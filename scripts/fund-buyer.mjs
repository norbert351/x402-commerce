import { createWalletClient, createPublicClient, http, parseAbi, keccak256, toHex } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '@xpay/core';
import { writeFileSync } from 'fs';

// Derive a deterministic, DISTINCT demo-buyer wallet from the seller key (reproducible,
// so re-recordings reuse the same funded buyer). Fund it BNB (gas) + $U from the seller
// so a paid call is a genuine A->B transfer (payer !== payTo), not a self-transfer.
const sellerKey = process.env.SENTINEL_PK || process.env.XPAY_SELLER_KEY;
const buyerKey = keccak256(toHex(sellerKey + ':xpay-demo-buyer'));
const seller = privateKeyToAccount(sellerKey);
const buyer = privateKeyToAccount(buyerKey);
const wc = createWalletClient({ account: seller, chain: bscTestnet, transport: http(config.rpcUrl) });
const pc = createPublicClient({ chain: bscTestnet, transport: http(config.rpcUrl) });
const T = parseAbi(['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address a) view returns (uint256)']);

const BNB_TO_SEND = 2n * 10n ** 15n; // 0.002 BNB for gas
const U_TO_SEND = BigInt(Math.round(1 * 10 ** config.decimals)); // 1 $U

// ensure buyer has BNB gas
const buyerBnb = await pc.getBalance({ address: buyer.address });
if (buyerBnb < BNB_TO_SEND) {
  const h = await wc.sendTransaction({ to: buyer.address, value: BNB_TO_SEND });
  await pc.waitForTransactionReceipt({ hash: h });
  console.log('funded buyer BNB tx', h);
}
// ensure buyer has $U
const bal = await pc.readContract({ address: config.asset, abi: T, functionName: 'balanceOf', args: [buyer.address] });
if (bal < U_TO_SEND) {
  const h = await wc.writeContract({ address: config.asset, abi: T, functionName: 'transfer', args: [buyer.address, U_TO_SEND] });
  await pc.waitForTransactionReceipt({ hash: h });
  console.log('funded buyer $U tx', h);
}
writeFileSync('.demo-buyer-key', buyerKey, { mode: 0o600 });
console.log('BUYER_ADDR', buyer.address);
console.log('buyer != payTo?', buyer.address.toLowerCase() !== config.payTo);
const [b, u] = await Promise.all([
  pc.getBalance({ address: buyer.address }),
  pc.readContract({ address: config.asset, abi: T, functionName: 'balanceOf', args: [buyer.address] }),
]);
console.log('buyer BNB', Number(b) / 1e18, '| $U', Number(u) / 10 ** config.decimals);