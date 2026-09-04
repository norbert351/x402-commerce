// Shared MCP tool registry for xPay Commerce. Used by BOTH the stdio MCP
// server (apps/mcp) and the HTTP/SSE MCP endpoint mounted in the ASP server,
// so the tool surface is identical across transports.
import { z } from 'zod';
import { config, createLedger } from './index.js';
import { fetchPrice, fetch24hr, fetchKlines } from './binance.js';

function challengeText(resource, detail) {
  return JSON.stringify({
    status: 'payment_required', x402Version: 2, code: detail?.code || null,
    resource, payTo: config.payTo, asset: config.asset, chainId: config.chainId,
    amountAtomic: config.amountAtomic, priceUsdc: config.pricePerCallUsd,
    description: `xPay Commerce: ${resource}`, hint: 'HTTP 402 · sign EIP-712 Payment after settling USDC on-chain',
  }, null, 2);
}

// registerTools(mcpServer, { ledger, verify, bankTxId }) — mounts the live,
// paid x402 tools. Called once per transport.
export function registerTools(server, { ledger, verify, bankTxId }) {
  // ---- get_market_data: paid, live spot price ----
  server.tool('get_market_data',
    { symbol: z.string().describe('Trading pair, e.g. BTCUSDT'), paymentSignature: z.string().optional().describe('Base64 PAYMENT-SIGNATURE after settling on-chain') },
    async ({ symbol, paymentSignature }) => {
      const resource = `/v1/market/${symbol.toUpperCase()}`;
      if (!paymentSignature) {
        return { content: [{ type: 'text', text: challengeText(resource) }], isError: false, structuredContent: { status: 'payment_required', resource, payTo: config.payTo, chainId: config.chainId, amountAtomic: config.amountAtomic, priceUsdc: config.pricePerCallUsd } };
      }
      try {
        const { payer, txHash } = await verify(paymentSignature, { expectedResource: resource, consume: bankTxId });
        const charge = ledger.charge({ txHash, payer, resource, amountAtomic: config.amountAtomic, chainId: config.chainId, chainName: 'MCP', asset: config.asset, budgetAtomic: process.env.XPAY_BUDGET_ATOMIC ? Number(process.env.XPAY_BUDGET_ATOMIC) : null });
        if (!charge.ok && charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${process.env.XPAY_BUDGET_ATOMIC}` };
        const price = await fetchPrice(symbol);
        const p = { status: 'paid', resource, symbol: symbol.toUpperCase(), price: price.price, payer, paidTx: txHash, budget: ledger.spendToday(payer) };
        return { content: [{ type: 'text', text: JSON.stringify(p, null, 2) }], isError: false, structuredContent: p };
      } catch (err) {
        return { content: [{ type: 'text', text: challengeText(resource, err) }], isError: false, structuredContent: { status: 'payment_required', resource, code: err.code } };
      }
    });

  // ---- get_quote: REAL live quote (fixed from stub) ----
  server.tool('get_quote',
    { symbol: z.string().describe('Trading pair, e.g. ETHUSDT'), paymentSignature: z.string().optional() },
    async ({ symbol, paymentSignature }) => {
      const resource = `/v1/market/${symbol.toUpperCase()}/ticker`;
      if (!paymentSignature) {
        return { content: [{ type: 'text', text: challengeText(resource) }], isError: false, structuredContent: { status: 'payment_required', resource, payTo: config.payTo, chainId: config.chainId, amountAtomic: config.amountAtomic, priceUsdc: config.pricePerCallUsd } };
      }
      try {
        const { payer, txHash } = await verify(paymentSignature, { expectedResource: resource, consume: bankTxId });
        const charge = ledger.charge({ txHash, payer, resource, amountAtomic: config.amountAtomic, chainId: config.chainId, chainName: 'MCP', asset: config.asset, budgetAtomic: process.env.XPAY_BUDGET_ATOMIC ? Number(process.env.XPAY_BUDGET_ATOMIC) : null });
        if (!charge.ok && charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${process.env.XPAY_BUDGET_ATOMIC}` };
        const ticker = await fetch24hr(symbol);
        const p = { status: 'paid', resource, symbol: symbol.toUpperCase(), quote: { lastPrice: ticker.lastPrice, priceChangePercent: ticker.priceChangePercent, highPrice: ticker.highPrice, lowPrice: ticker.lowPrice, volume: ticker.quoteVolume }, payer, paidTx: txHash, budget: ledger.spendToday(payer) };
        return { content: [{ type: 'text', text: JSON.stringify(p, null, 2) }], isError: false, structuredContent: p };
      } catch (err) {
        return { content: [{ type: 'text', text: challengeText(resource, err) }], isError: false, structuredContent: { status: 'payment_required', resource, code: err.code } };
      }
    });

  // ---- get_klines: paid, live candlesticks ----
  server.tool('get_klines',
    { symbol: z.string(), interval: z.string().default('1h').describe('1m/5m/15m/1h/4h/1d'), limit: z.number().int().min(1).max(200).default(50), paymentSignature: z.string().optional() },
    async ({ symbol, interval, limit, paymentSignature }) => {
      const resource = `/v1/market/${symbol.toUpperCase()}/klines?interval=${interval}&limit=${limit}`;
      if (!paymentSignature) {
        return { content: [{ type: 'text', text: challengeText(resource) }], isError: false, structuredContent: { status: 'payment_required', resource, payTo: config.payTo, chainId: config.chainId, amountAtomic: config.amountAtomic } };
      }
      try {
        const { payer, txHash } = await verify(paymentSignature, { expectedResource: resource, consume: bankTxId });
        const charge = ledger.charge({ txHash, payer, resource, amountAtomic: config.amountAtomic, chainId: config.chainId, chainName: 'MCP', asset: config.asset, budgetAtomic: process.env.XPAY_BUDGET_ATOMIC ? Number(process.env.XPAY_BUDGET_ATOMIC) : null });
        if (!charge.ok && charge.code === 'budget_exceeded') throw { code: 'budget_exceeded', detail: `daily ${charge.dailyAtomic}/${process.env.XPAY_BUDGET_ATOMIC}` };
        const klines = await fetchKlines(symbol, interval, limit);
        const p = { status: 'paid', resource, symbol: symbol.toUpperCase(), interval, klines, payer, paidTx: txHash };
        return { content: [{ type: 'text', text: JSON.stringify(p, null, 2) }], isError: false, structuredContent: p };
      } catch (err) {
        return { content: [{ type: 'text', text: challengeText(resource, err) }], isError: false, structuredContent: { status: 'payment_required', resource, code: err.code } };
      }
    });

  return server;
}