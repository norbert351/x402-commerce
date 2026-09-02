import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config, buildChallengeBytes, verifyPayments } from '@xpay/core';
import { createConsumeRing } from '../../asp/src/ring.js';

// xPay Commerce — MCP binding.
// The Binance feed exposed as an x402-priced MCP tool: an agent calls get_market_data,
// the server answers with a PAYMENT challenge (resource, price, payTo) until the agent
// settles on-chain and replays with a PAYMENT-SIGNATURE header inside the tool call.
// Same gate as the REST ASP, same replay ring — the MCP surface IS the commerce.

const consume = createConsumeRing(new URL('../../asp/data', import.meta.url).pathname);
const server = new McpServer({ name: 'xpay-commerce', version: '0.1.0' });

// Helpers shared with the REST ASP
function challengeText(resource, detail) {
  return JSON.stringify({
    status: 'payment_required', x402Version: 2, code: detail?.code || null,
    resource, payTo: config.payTo, asset: config.asset, chainId: config.chainId,
    amountAtomic: config.amountAtomic, priceUsdc: config.pricePerCallUsd,
    description: `xPay Commerce: ${resource}`, hint: 'HTTP 402 · sign EIP-712 Payment after settling USDC on-chain',
  }, null, 2);
}

async function livePrice(symbol) {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
  if (!r.ok) throw new Error(`binance ${r.status}`);
  return r.json();
}

server.tool('get_market_data',
  {
    symbol: z.string().describe('Trading pair, e.g. BTCUSDT'),
    paymentSignature: z.string().optional().describe('Base64 PAYMENT-SIGNATURE (accepted+signature+payer) after settling on-chain'),
  },
  async ({ symbol, paymentSignature }) => {
    const resource = `/v1/market/${symbol.toUpperCase()}`;
    if (!paymentSignature) {
      return { content: [{ type: 'text', text: challengeText(resource) }], isError: false };
    }
    try {
      const { payer, txHash } = await verifyPayments(paymentSignature, { expectedResource: resource, consume });
      const price = await livePrice(symbol);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'paid', resource, symbol: symbol.toUpperCase(), price: price.price, payer, paidTx: txHash }, null, 2) }],
        isError: false,
      };
    } catch (err) {
      return { content: [{ type: 'text', text: challengeText(resource, err) }], isError: false };
    }
  });

server.tool('get_quote',
  { symbol: z.string().describe('Trading pair, e.g. ETHUSDT') },
  async ({ symbol }) => {
    const resource = `/v1/quote/${symbol.toUpperCase()}`;
    return { content: [{ type: 'text', text: challengeText(resource) }], isError: false };
  });

// Connect over stdio (agents add this server via their MCP client config).
const transport = new StdioServerTransport();
await server.connect(transport);