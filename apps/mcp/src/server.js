import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config, buildChallengeBytes, verifyPayments, createLedger } from '@xpay/core';

// xPay Commerce — MCP binding.
// The Binance feed exposed as an x402-priced MCP tool: an agent calls get_market_data,
// the server answers with a PAYMENT challenge (resource, price, payTo) until the agent
// settles on-chain and replays with a PAYMENT-SIGNATURE header inside the tool call.
// Same gate as the REST ASP, same ledger (replay + budget + audit) — the MCP surface IS the commerce.

const ledger = createLedger(new URL('../../asp/data/ledger.sqlite', import.meta.url).pathname);
const BUDGET_ATOMIC = process.env.XPAY_BUDGET_ATOMIC ? Number(process.env.XPAY_BUDGET_ATOMIC) : null;
const CHAIN_NAME = config.chainId === 97 ? 'BSC' : config.chainId === 84532 ? 'Base' : String(config.chainId);
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
      const { payer, txHash } = await verifyPayments(paymentSignature, { expectedResource: resource, consume: bankTxId });
      const charge = ledger.charge({
        txHash, payer, resource, amountAtomic: config.amountAtomic,
        chainId: config.chainId, chainName: CHAIN_NAME, asset: config.asset, budgetAtomic: BUDGET_ATOMIC,
      });
      if (!charge.ok && charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${BUDGET_ATOMIC}` };
      const price = await livePrice(symbol);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'paid', resource, symbol: symbol.toUpperCase(), price: price.price, payer, paidTx: txHash, budget: ledger.spendToday(payer) }, null, 2) }],
        isError: false,
      };
    } catch (err) {
      return { content: [{ type: 'text', text: challengeText(resource, err) }], isError: false };
    }
  });

function bankTxId(txHash) {
  if (ledger.alreadyBanked(txHash)) throw { code: 'payment_already_used', detail: 'tx already consumed' };
  return true;
}

server.tool('get_quote',
  { symbol: z.string().describe('Trading pair, e.g. ETHUSDT') },
  async ({ symbol }) => {
    const resource = `/v1/quote/${symbol.toUpperCase()}`;
    return { content: [{ type: 'text', text: challengeText(resource) }], isError: false };
  });

// Connect over stdio (agents add this server via their MCP client config).
const transport = new StdioServerTransport();
await server.connect(transport);