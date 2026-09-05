# xPay Commerce — Architecture

System diagram: `architecture.html` / `architecture.png` (dark SVG, in the repo root).

```
┌─ Buy side ───────────────────┐   ┌─ xPay Commerce (sell-side ASP) ────────────┐
│ AI agent / CLI (apps/buyer)  │   │  apps/asp/src/server.js        ·node       │
│  · probe                     │   │  x402 gate (verify.js)          ·viem      │
│  · settle $U on-chain        │   │  MCP tools (get_market_data…)   ·mcp tools │
│  · sign EIP-712, replay      │   │  Ledger + replay ring           ·node:sqlite│
└───────────────┬──────────────┘   │  Binance feed                    ·binance.js │
                │  HTTP 402 + x402  │  Web dashboard (landing + product chrome)   │
                │  challenge → settle → replay → 200                             │
                └─────────────────>└─────────────────────────────────────────────┘
                                        │  $U.transfer()  (chain 97 · BSC testnet)
                                        ▼
                                  Binance Wallet Agentic Hub / x402 rail
```

## The one load-bearing decision

**The x402 gate is the product.** A paid call only resolves after `verifyPayments` proves:
EIP-712 signature (signer == payer) **and** a live on-chain `Transfer` into `payTo` within
the settlement window **and** that tx has never been consumed (replay ring). Only then is
the Binance feed served. The seller never holds a private key; the buyer signs off-VM.

| After removing x402 / on-chain settlement | What happens |
|---|---|
| `verifyTypedData` step | Pay-per-call collapses → any request gets a 200 instantly |
| On-chain `Transfer` requirement | The paywall vanishes → it is no longer pay-per-call |
| Replay ring / ledger | One tx could be replayed forever → unlimited free draws to drain the seller |
| `PAYMENT-SIGNATURE` replay flow | Agents have no way to prove they paid → resource never unlocks |

Remove any single row and the core value flow stops or becomes exploitable. That is the
definition of **load-bearing** — x402 is the mechanism, not a checkbox.

## Across the product's life (depth, not one-shot)

The gate runs on **every** paid call across **three surfaces** — the REST feed (spot /
ticker / klines), the MCP tools (stdio + HTTP/SSE), and the buy-side CLI. Budget is enforced
**per payer, daily**, at settle. One transaction = exactly one resource, permanently.

## Key files

| File | Responsibility |
|---|---|
| `packages/core/src/x402.js` | x402 v2 challenge + EIP-712 domain/types + encode/decode |
| `packages/core/src/verify.js` | on-chain verification (verifyTypedData + getLogs Transfer) |
| `packages/core/src/ledger.js` | node:sqlite ledger + durable replay ring (INSERT OR IGNORE) |
| `packages/core/src/binance.js` | Binance feed (UA + timeout + `data-api.binance.vision` fallback) |
| `packages/core/src/config.js` | chain-parametrised settlement config |
| `packages/core/src/mcp-tools.js` | the 3 paid tools, shared across transports |
| `apps/asp/src/server.js` | HTTP server: gate + paid routes + preview + UI + budget |
| `apps/buyer/src` | agent client: probe → settle → sign → replay |
| `apps/mcp/src/server.js` | MCP stdio + HTTP/SSE bindings |
| `apps/asp/public/` | static SPA (landing + Market / Ledger / MCP) |

## Deploy

Render, single web service, all env public (chain/payTo/price — the seller needs **no**
private keys), `render.yaml` blueprint. Keep-alive cron pings `/health` every 10m so the
judged demo window never hits a cold free-tier service.