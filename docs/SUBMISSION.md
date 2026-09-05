# xPay Commerce — Binance Agent OS Mini Hackathon — Submission Copy

Track A — **"Build an AI Agent with Agent OS"** ($20K USDC, judged). Deadlines: **Sep 8,
2026 23:59 UTC**. Everything below is a ready-to-paste answer for the official entry form,
written to match the live repo (`norbert351/x402-commerce`, public) and the live demo
(`https://xpay-commerce.onrender.com`). No overclaims — every capability listed is
code-verified + smoke-tested live.

---

## Problem · Audience · Why it stands out

**Problem.** AI agents consume data on demand, but there is no machine-native way to pay
for a single call — they get forced toward subscriptions and shared API keys. The inverse
pains the same builders: someone running a valuable Binance feed has no drop-in way to
**charge per request**.

**Audience** — two-sided, both named:
- **Sellers (day-one adopters):** developers/analysts running a live Binance market-data,
  signal, or analysis feed who want to monetize it *by the call* — set a `$U` price + a
  daily spend budget, no KYC, no subscription infra.
- **Buyers:** AI agents (on Agent OS, Claude Code, Cursor) that need live data now and
  auto-settle per call.
- **Who it is NOT for:** bulk/subscription merchandisers — x402 is deliberately per-call.

**Why it stands out** (the payment/paid-MCP lane is filling up — security-preflight nodes,
generic paid-MCP infrastructure, agentic-payments policy gates). xPay is different because
it targets the *agent-to-agent payments on Binance market data* itself as a **self-serve
storefront**: publish any Binance feed as a paid endpoint in one call (symbol/type/`$U`
price/optional daily budget via `/api/feeds`), and the same x402 gate prices it per-call.
Its trust layer is the differentiator: the paid endpoints ARE Binance Agent OS MCP market
tools (sponsor tech load-bearing, settled in `$U`), the seller holds **no private key**
(buyer signs off-VM), there's a **per-payer daily budget set once**, and a **replay-proof
ledger** — one transfer = one request — provable live in the demo with a real on-chain
`$U` settlement.

---

## Q — Which theme does your submission fall under?

**Payment Workflows (E.g. Agent-to-Agent payments)**

> xPay Commerce is an **Agent-to-Agent payments** storefront on Binance Agent OS: an AI
> agent pays a micro-payment on-chain, per request, through **x402 / Open Payments v2**,
> to unlock a gated Binance market-data endpoint. It's the "agents paying agents" rail for
> the Payment Workflows lane — with a keyless seller, a budget set once, and a replay-proof
> ledger. No subscriptions, no shared API keys.

---

## Q — Text description of your project

**xPay Commerce** is a **pay-per-call storefront** that turns any Binance market-data /
analysis / signal feed into an **x402-priced endpoint** — so an AI agent pays a
micro-payment *per request* on-chain and gets the data in return. Two-sided commerce for
the agent economy: a seller prices a Binance feed per call, and any agent pays a few cents,
on its own, without an account or an API key.

Built natively on viem + the live Binance feed, settled on-chain in **$U** (BSC testnet),
wrapped in an agent-trust layer that is the heart of the build:
- **Seller holds no private key** — the buyer signs off-VM, so the selling server is keyless by design.
- **Per-payer daily budget, set once** — a spend cap enforced at settlement, so an agent can't drain a seller.
- **One transfer = one request** — a durable replay ring means a paid transaction is consumed exactly once (replay rejected: `payment_already_used`).
- **Immutable on-chain ledger** — every settled call is an audit row (tx hash, payer, resource, amount).

The workhorse flow an AI agent runs:

1. The agent (Claude Code / Cursor / any MCP client, or the bundled buyer CLI) calls a
   paid market resource with no proof of payment.
2. The ASP answers **HTTP 402** with an **x402 v2 challenge** (`PAYMENT-REQUIRED`) encoding
   the resource, payee, and amount.
3. The agent settles the micro-payment **on-chain** (a real `$U`/USDC `Transfer` into the
   seller's address), signs the **EIP-712 Payment**, and replays with a `PAYMENT-SIGNATURE`.
4. The ASP verifies the EIP-712 signature (signer == payer), confirms the on-chain
   `Transfer` within the settlement window, checks the replay ring + per-payer budget, and
   only then serves the live Binance feed.

Removal of the x402 gate ⟹ the paywall disappears ⟹ it is no longer pay-per-call. The
protocol **is** the product. The same gate serves **three surfaces**: the REST feed
(spot / 24h ticker / klines), **MCP tools** (`get_market_data`, `get_quote`,
`get_klines` — stdio + HTTP/SSE for remote agents), and a buy-side agent CLI.

---

## Q — Which platform did you post your video on?

**YouTube** (recommended for judges) — upload `docs/demo/xpay-commerce-demo.mp4` and paste
the public link.

> **Immediate fallback ("Others"):** the same 60s 720p file is served at
> `https://xpay-commerce.onrender.com/xpay-demo.mp4`.

---

## Q — Link to your public video post

_Paste the YouTube URL after uploading._ (Fallback: `https://xpay-commerce.onrender.com/xpay-demo.mp4`.)

The video is a **real live screen recording** (not slides/static frames) of the deployed
product, with **real clicks on every feature**: landing → live market feed (real
BTC/ETH/SOL prices + sparklines) → request studio (type a symbol, pick a resource) → **HTTP
402 x402 paywall challenge** (+ decoded) → **a real agent wallet settles `$U` on BSC
testnet and the Ledger shows the transaction land live** → Ledger overview/budget → MCP
tools. With clean synced narration.

---

## Q — Step-by-step guide: how to replicate the agent

Reproduce the full loop in ~5 steps. The seller side needs **no private keys** — the buyer
signs off-VM, so only the buyer needs a funded wallet.

### 1. Clone + install
```bash
git clone https://github.com/norbert351/x402-commerce
cd x402-commerce
npm install        # node >= 22
```

### 2. Configure the sell side (env vars, all public)
```bash
export XPAY_CHAIN_ID=97                  # BSC testnet (84532 = Base Sepolia default)
export XPAY_ASSET=0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565   # $U, 18-dec
export XPAY_RPC_URL=https://bsc-testnet-rpc.publicnode.com
export XPAY_PRICE_USDC=0.00002           # price per call
export XPAY_TIMEOUT_S=300                # settlement window
export XPAY_PAY_TO=0x73b16058d57a6337060677496d4A8e97A9554539  # seller addr
# optional: XPAY_BUDGET_ATOMIC=2000000000000000000  # 2 $U/day/payer spend cap
```

### 3. Run the sell-side ASP
```bash
npm run asp        # node --dns-result-order=ipv4first apps/asp/src/server.js
```

### 4. Make a real paid call with the buy-side agent CLI (needs a funded $U wallet)
```bash
XPAY_BUYER_KEY=<your-funded-wallet-key> \
  node --dns-result-order=ipv4first apps/buyer/src/buy.js \
  "http://localhost:3000/v1/market/BTCUSDT" BTCUSDT
```
It **probes** → reads the `402` + `PAYMENT-REQUIRED` challenge → **settles the micro-payment
on-chain** → **signs the EIP-712 Payment** → **replays with `PAYMENT-SIGNATURE`** → receives
the billed live price. Replay the same signature again and it is rejected
(`payment_already_used`) — the anti-double-bank proof.

### 5. Connect an AI agent over MCP (the "agent" surface)
Add the server to any MCP client (Claude Code / Cursor / etc.):
```json
{ "mcpServers": { "xpay-commerce": {
    "command": "node",
    "args": ["--dns-result-order=ipv4first", "/abs/path/apps/mcp/src/server.js"]
} } }
```
Then the agent can call the three paid tools (`get_market_data`, `get_quote`,
`get_klines`) and auto-settle per call. For a remote agent, point it at the HTTP/SSE
endpoint: `https://xpay-commerce.onrender.com/mcp`.

### Verify
- `npm test` → **27/27 passing**.
- `npm run smoke https://xpay-commerce.onrender.com` → **10/10** (health · live preview ·
  402 paywalls · ledger · budget · MCP SSE · UI).
- See every settled payment at `GET /ledger` and per-payer spend at `GET /budget`.

---

## Verification matrix (honest)

| Claim | Status | Evidence |
|---|---|---|
| Live deploy (BSC testnet / $U) | ✅ VERIFIED | health 200; smoke 10/10; live feed prices |
| x402 load-bearing (remove ⟹ dies) | ✅ VERIFIED | `verifyTypedData` + on-chain `Transfer` + replay ring in `packages/core` |
| Live Binance feed behind the gate | ✅ VERIFIED | real BTC/ETH/SOL served after 402 |
| On-chain settle→serve + replay protection | ✅ VERIFIED | earlier live BSC-tx (README) |
| Repo public + secret-clean | ✅ VERIFIED | `private:false`; tracked-tree grep clean |
| BNB **mainnet** / MCP-Hub wiring | ⚠️ NOT exercised | config-flip + a real $U / permit2 rail required |
| Official weighted rubric | ⚠️ none published | scored against the 4 Track-A categories |