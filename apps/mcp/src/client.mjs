import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia, bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config, EIP712_DOMAIN, EIP712_TYPES, toPaymentMessage, buildReplayBytes, acceptedEntry } from '@xpay/core';
import { fileURLToPath } from 'node:url';

// MCP client (buy-side agent): connects to the xPay MCP server over stdio, powers
// an x402 payment, and calls get_market_data with the proof — the full "agent pays
// per call via MCP tool" story.

const KEY = process.env.XPAY_BUYER_KEY || process.env.XPAY_SELLER_KEY || process.env.SENTINEL_PK || '';
const MCP_SERVER = fileURLToPath(new URL('./server.js', import.meta.url));
const RESOURCE = '/v1/market/BTCUSDT';
const ACCEPTED = { ...acceptedEntry(RESOURCE, `xPay Commerce: ${RESOURCE}`) };
const CHAIN = config.chainId === 97 ? bscTestnet : config.chainId === 84532 ? baseSepolia : { id: config.chainId };

const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: CHAIN, transport: http(config.rpcUrl) });
const publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
const TOKEN = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

const client = new Client({ name: 'xpay-buyer', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: [MCP_SERVER],
  stderr: 'pipe',
});
await client.connect(transport);

// 1. list tools
const tools = await client.listTools();
console.log('MCP tools:', tools.tools.map((t) => t.name).join(', '));

// 2. unsigned call -> expect payment_required challenge
const unsigned = await client.callTool({ name: 'get_market_data', arguments: { symbol: 'BTCUSDT' } });
const u = JSON.parse(unsigned.content[0].text);
console.log('\n[unsigned] ->', u.status, '| priceUsdc', u.priceUsdc, '| payTo', u.payTo.slice(0, 6) + '…');
if (u.status !== 'payment_required') throw new Error('expected payment_required');

// 3. settle on-chain + sign + replay, then call with proof
const tx = await wallet.writeContract({ address: config.asset, abi: TOKEN, functionName: 'transfer', args: [config.payTo, BigInt(config.amountAtomic)] });
await publicClient.waitForTransactionReceipt({ hash: tx });
const signature = await wallet.signTypedData({ domain: EIP712_DOMAIN, types: EIP712_TYPES, primaryType: 'Payment', message: toPaymentMessage(ACCEPTED) });
const proof = buildReplayBytes({ accepted: ACCEPTED, signature, payer: account.address });

const paid = await client.callTool({ name: 'get_market_data', arguments: { symbol: 'BTCUSDT', paymentSignature: proof } });
const p = JSON.parse(paid.content[0].text);
console.log('[paid]    ->', p.status, '| price', p.price, '| paidTx', p.paidTx.slice(0, 12) + '…');
if (p.status !== 'paid') throw new Error('expected paid');

await client.close();
console.log('\nMCP x402 LOOP OK');