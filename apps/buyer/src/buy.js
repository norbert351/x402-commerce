import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config, EIP712_DOMAIN, EIP712_TYPES, toPaymentMessage, buildReplayBytes } from '@xpay/core';

// Buy-side agent: probe a paid endpoint -> get 402 + challenge -> settle on-chain ->
// sign the x402 Payment proof -> replay with PAYMENT-SIGNATURE -> receive the resource.
// No API key, no subscription: the payment IS the authorization.

const KEY = process.env.XPAY_BUYER_KEY || process.env.XPAY_SELLER_KEY || process.env.SENTINEL_PK || '';
if (KEY.length < 64) throw new Error('XPAY_BUYER_KEY / SENTINEL_PK not set');

const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(config.rpcUrl) });
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.rpcUrl) });
const USDC = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

export async function buy(endpointUrl, { symbol = 'BTCUSDT', priceOverride } = {}) {
  const resource = endpointUrl.replace(/\/$/, '');
  // 1. probe — expect 402
  const probe = await fetch(resource, { headers: { 'User-Agent': 'xpay-buyer/0.1' } });
  if (probe.status !== 402) throw new Error(`expected 402, got ${probe.status}`);

  // 2. decode the challenge (PAYMENT-REQUIRED header)
  const challengeB64 = probe.headers.get('payment-required');
  if (!challengeB64) throw new Error('missing PAYMENT-REQUIRED header');
  const challenge = JSON.parse(Buffer.from(challengeB64, 'base64').toString());
  const accepted = challenge.accepts[0];

  // 3. settle on-chain: plain transfer, no approve needed (USDC EIP-3009 / direct transfer)
  const amount = priceOverride !== undefined ? BigInt(priceOverride) : BigInt(accepted.amount);
  const tx = await wallet.writeContract({
    address: accepted.asset, abi: USDC, functionName: 'transfer',
    args: [accepted.payTo, amount],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx }); // wait until MINED so the seller's on-chain scan sees it

  // 4. sign the Payment proof (domains/types in @xpay/core match the seller gate exactly)
  const signature = await wallet.signTypedData({
    domain: EIP712_DOMAIN, types: EIP712_TYPES, primaryType: 'Payment',
    message: toPaymentMessage(accepted),
  });

  // 5. replay with PAYMENT-SIGNATURE
  const replay = buildReplayBytes({ accepted, payer: account.address, signature });
  const r = await fetch(resource, { headers: { 'PAYMENT-SIGNATURE': replay } });
  const body = await r.json();
  if (r.status !== 200) throw new Error(`replay failed ${r.status}: ${JSON.stringify(body)}`);
  return { txHash: tx, result: body };
}

// CLI
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2] || 'http://localhost:3000/v1/market';
  const symbol = process.argv[3] || 'BTCUSDT';
  buy(url + '/', { symbol }).then((r) => {
    console.log(`Paid ${1} call  tx=${r.txHash}`);
    console.log(JSON.stringify(r.result, null, 2));
  }).catch((e) => { console.error('XPAY_BUY_ERROR', e.message); process.exit(1); });
}