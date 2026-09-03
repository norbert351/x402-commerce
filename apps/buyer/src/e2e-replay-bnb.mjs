import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config, EIP712_DOMAIN, EIP712_TYPES, toPaymentMessage, buildReplayBytes, acceptedEntry } from '@xpay/core';

// BNB replay-protection e2e: one $U transfer = one request. Second replay must reject.
const KEY = process.env.XPAY_BUYER_KEY || process.env.XPAY_SELLER_KEY || process.env.SENTINEL_PK || '';
const ENDPOINT = process.env.XPAY_ENDPOINT || 'http://localhost:3020/v1/market/BTCUSDT';
const RESOURCE = '/v1/market/BTCUSDT';
const ACCEPTED = { ...acceptedEntry(RESOURCE, `xPay Commerce: ${RESOURCE}`) };

const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: bscTestnet, transport: http(config.rpcUrl) });
const publicClient = createPublicClient({ chain: bscTestnet, transport: http(config.rpcUrl) });
const TOKEN = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

const probe = await fetch(ENDPOINT);
const challenge = JSON.parse(Buffer.from(probe.headers.get('payment-required'), 'base64').toString());
const accepted = challenge.accepts[0];

const tx = await wallet.writeContract({ address: accepted.asset, abi: TOKEN, functionName: 'transfer', args: [accepted.payTo, BigInt(accepted.amount)] });
await publicClient.waitForTransactionReceipt({ hash: tx });
const signature = await wallet.signTypedData({ domain: EIP712_DOMAIN, types: EIP712_TYPES, primaryType: 'Payment', message: toPaymentMessage(accepted) });
const replay = buildReplayBytes({ accepted, payer: account.address, signature });

const r1 = await fetch(ENDPOINT, { headers: { 'PAYMENT-SIGNATURE': replay } });
const b1 = await r1.json();
const r2 = await fetch(ENDPOINT, { headers: { 'PAYMENT-SIGNATURE': replay } });
const b2 = await r2.json();

console.log('first replay :', r1.status, '-', b1.price ?? JSON.stringify(b1));
console.log('second replay:', r2.status, '-', JSON.stringify(b2));
if (r1.status !== 200) throw new Error('first replay was not served');
if (r2.status !== 402 || b2.code !== 'payment_already_used') throw new Error('replay protection FAILED on BNB');
console.log('BNB REPLAY PROTECTION VERIFIED: 1 transfer = 1 request');