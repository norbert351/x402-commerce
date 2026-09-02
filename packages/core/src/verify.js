import { createPublicClient, http, verifyTypedData } from 'viem';
import { mainnet, baseSepolia } from 'viem/chains';
import { config } from './config.js';
import { EIP712_DOMAIN, EIP712_TYPES, toPaymentMessage } from './x402.js';

const CHAINS = { 1: mainnet, 84532: baseSepolia };
const CHAIN = CHAINS[config.chainId] ?? { id: config.chainId };
const publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl, { timeout: 20000 }) });

// Structured event (viem getLogs needs object form, NOT an ABI string — else zero logs).
const TransferEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { type: 'address', name: 'from', indexed: true },
    { type: 'address', name: 'to', indexed: true },
    { type: 'uint256', name: 'value', indexed: false },
  ],
};

// Verify a PAYMENT-SIGNATURE replay: field match -> signer matches payer -> on-chain
// Transfer exists in the settlement window -> not already consumed.
// `consume` is injected (the ASP's replay ring / persistent ledger) so this function is pure.
// Returns { payer, txHash } on success, throws { code, detail } on failure.
export async function verifyPayments(replayB64, { expectedResource, consume }) {
  const { accepted, signature, payer } = decode(replayB64);

  // cheap field checks first
  if (String(accepted.amount) !== config.amountAtomic) throw { code: 'amount_mismatch', detail: `expected ${config.amountAtomic}` };
  if (String(accepted.chainId) !== String(config.chainId)) throw { code: 'chain_mismatch', detail: `expected ${config.chainId}` };
  if (String(accepted.payTo).toLowerCase() !== config.payTo) throw { code: 'payto_mismatch' };

  // signer must equal the payer (viem: address is an INPUT, verifyTypedData returns boolean)
  const ok = await verifyTypedData({
    address: String(payer).toLowerCase(),
    domain: EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: 'Payment',
    message: toPaymentMessage(accepted),
    signature,
  });
  if (!ok) throw { code: 'signer_mismatch' };

  // prove the money moved on-chain from payer -> payTo in the settlement window
  const latest = await publicClient.getBlockNumber();
  const events = await publicClient.getLogs({
    address: config.asset,
    event: TransferEvent,
    args: { from: String(payer).toLowerCase(), to: config.payTo },
    fromBlock: latest - 1000n, // generous window; buyer now waits for receipt so the tx is mined & addressable
    toBlock: latest,
  });
  const value = BigInt(accepted.amount);
  const match = [...events].reverse().find((e) => e.args.value === value); // newest-first; dup values recur
  if (!match) throw { code: 'payment_not_settled', detail: 'no matching on-chain Transfer found' };

  // replay ring: one tx = one request
  if (consume && !(await consume(match.transactionHash))) throw { code: 'payment_already_used', detail: 'tx already consumed' };

  return { payer: String(payer).toLowerCase(), txHash: match.transactionHash };
}

function decode(b64) {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString());
  } catch {
    throw { code: 'bad_header', detail: 'PAYMENT-SIGNATURE is not valid b64 JSON' };
  }
}

export { publicClient };