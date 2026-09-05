# xPay Commerce — Technical Doc

Street-level detail for judges who want to verify the mechanics, not the pitch. This
doc matches the **live deploy** (`https://xpay-commerce.onrender.com`, BSC testnet /
chain 97, settle in `$U`). Re-verified against the codebase 2026-09-05.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node 22 (`--dns-result-order=ipv4first` — the VM's IPv6 egress is broken) |
| Protocol | **x402 / Open Payments v2**, implemented **natively on viem** (no SDK wrapper) |
| Onchain SDK | `viem ^2.56.3` — `verifyTypedData`, `getLogs`, `createPublicClient` |
| Persistence | `node:sqlite` ledger + replay ring |
| Transport | Sell-side ASP (`apps/asp`), buy-side agent CLI (`apps/buyer`), MCP (`apps/mcp`) |
| Frontend | Vanilla SPA served by the ASP (no separate build step) |
| Data source | Binance public REST (`api.binance.com` → fallback `data-api.binance.vision`) |

## The x402 rail (the whole product)

A buyer (human or AI agent) requests a paid resource with **no** proof of payment:

```
Agent (buyer)            Sell-side ASP (xPay)              Chain (BSC testnet)
  |  call paid tool  ───>|  no PAYMENT-SIGNATURE            |
  | <── 402 + challenge ─|  PAYMENT-REQUIRED: b64{x402}     |
  |  $U.transfer()      ─|──────────────────────────────────>| settle on-chain
  |  sign EIP-712        |                                   |
  |  replay w/ signature─>|  verify: amount/chainId/payTo    |
  |                      |  + signer==payer + Transfer evt   |
  | <── 200 + live data ─|  then serve Binance market feed  |
```

### Verification (`packages/core/src/verify.js`)
On every replay it checks **all four**, in order:
1. **Field/eip-712 match** against the signed challenge (resource + payee + amount).
2. **signer == payer** — `verifyTypedData` proves the payload was signed by the claimed wallet.
3. **On-chain settlement** — `getLogs` for a real `Transfer` (asset → `payTo`) inside the
   settlement window (`XPAY_TIMEOUT_S`, default 300s). This is the load-bearing step:
   **no on-chain payment, no data.**
4. **Not already consumed** — the replay ring (below). One transfer = one request.

### Replay ring / ledger (`packages/core/src/ledger.js`)
A `node:sqlite` table doubles as the durable replay ring:
- Each settled payment inserts a row keyed on **tx_hash (PRIMARY KEY)**, `INSERT OR IGNORE`
  → `changes === 0` means "already banked" → the gate returns `payment_already_used`.
- Survives restarts (a consumed tx stays consumed); this is the anti-double-bank proof.

### Spend budget (`XPAY_BUDGET_ATOMIC`)
Per-payer **daily** budget enforced at settle time, in **atomic units of the settle asset**
(no price oracle). When a payer exceeds it the gate returns `budget_exceeded` before serving.
Unset = uncapped (the live demo's default).

## Paid surface (everything behind the 402 gate)

| Resource | Returns | Notes |
|---|---|---|
| `GET /v1/market/:sym` | live spot price | base paid surface |
| `GET /v1/market/:sym/ticker` | 24h change / high / low / volume | richer, same gate |
| `GET /v1/market/:sym/klines?interval&limit` | OHLCV candles | 1m–1d, ≤200 bars |

Free teaser (no payment) that powers the live landing panel:
`GET /v1/preview/:sym` — 2s-fresh price + 24h ticker.

Other public endpoints: `/health` (live config + payTo + budget + ledger count),
`/ledger` (payments), `/budget` (per-payer spend).

### Self-serve storefront (the reusable rail)
`GET /api/feeds` (list) + `POST /api/feeds` (`{symbol, type, priceAtomic, budgetAtomic?, payTo?}`)
let a seller **publish a paid feed** in one call. A published feed overrides that resource's
price / optional daily budget / payTo in the gate, while anything unpublished falls back to
the global config — so the default path is byte-for-byte unchanged (verified by the test
suite). This is what makes xPay a *publish-able agent-payments rail* rather than a fixed
demo catalog.

## MCP surface (`apps/mcp`, same paid tools)

| Tool | Resource |
|---|---|
| `get_market_data` | `/v1/market/:sym` |
| `get_quote` | `/v1/market/:sym/ticker` |
| `get_klines` | `/v1/market/:sym/klines` |

Two transports, shared tool implementations (`packages/core/mcp-tools.js`):
- **stdio** — add to Claude Code / Cursor / any MCP client via `.mcp.json`.
- **HTTP + SSE** — remote agents reach the same tools at `https://xpay-commerce.onrender.com/mcp`
  (no filesystem path, just the endpoint).

## Buy-side CLI (`apps/buyer`)

`probe → read 402 + PAYMENT-REQUIRED → settle $U on-chain → sign EIP-712 → replay with
PAYMENT-SIGNATURE → 200`. The agent wallet never touches a subscription or an API key.

## Tests

`npm test` — **27/27 passing** (unit: challenge/replay envelope, EIP-712 field match,
amount-atomic derivation, ledger integrate, budget per-payer + UTC-midnight reset,
MCP stdio, BNB-rail negatives) plus the replay-protection proof
(`apps/buyer/src/e2e-replay.mjs`: first replay 200, second `payment_already_used`).

`npm run smoke https://xpay-commerce.onrender.com` — **10/10 passing live** (health,
live preview price, 402 paywalls ×3, ledger, budget, MCP SSE, UI).

## Live config (2026-09-05)

| Key | Value |
|---|---|
| Chain | BSC **testnet**, `eip155:97` |
| Asset | **$U** (United Stables) `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565`, 18-dec |
| RPC | `https://bsc-testnet-rpc.publicnode.com` |
| Price / call | `0.00002 $U` |
| payTo | `0x73b16058d57a6337060677496d4A8e97A9554539` (public seller address) |
| Budget | uncapped by default |

Chain-agnostic by design — the same gate/buyer run on **Base Sepolia / USDC** (the
fail-open default) with a config swap only.

## Honest limits

- Ledger is `node:sqlite` on an ephemeral disk → it **resets on a Render redeploy**
  (live during the instance lifetime; not durable across redeploys). Fine for a judged
  demo window; going to production means Postgres.
- BSC **mainnet** config is a flip, not yet exercised (needs real `$U` + the permit2/eip3009 rail).
- No official Binance judging rubric is published — this build is scored against the four
  published Track-A workflow categories (this entry = **Payment Workflows**).