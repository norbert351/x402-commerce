# xPay Commerce

[![live](https://img.shields.io/badge/live-onrender-0FACB0)](https://xpay-commerce.onrender.com)
[![Track A — Payment Workflows](https://img.shields.io/badge/Binance%20Agent%20OS-Track_A_%E2%80%94_Payment_F4BA2E)](#)

**Pay-per-call MCP commerce on Binance Agent OS** — the Payment Workflows lane of the Binance Agent OS Mini Hackathon (Track A, judged · video + GitHub submission · deadline Sep 8 23:59 UTC). **Live:** [https://xpay-commerce.onrender.com](https://xpay-commerce.onrender.com) (BSC testnet / `$U`).

The thesis: **agents paying agents in micro-payments, not subscriptions or shared API keys.** Turn any Binance data/analysis/signal feed into an x402-priced endpoint so an AI agent pays a few cents *per request* on-chain and gets the data. Removal of x402 ⟹ the paywall disappears ⟹ the product stops being pay-per-call. x402 is load-bearing.

- **Sell side** (`apps/asp`): a server that returns HTTP `402 Payment Required` + an x402 v2 challenge on any unpaid request, verifies the on-chain settlement, and only then serves the live Binance feed.
- **Buy side** (`apps/buyer`): the agent client that probes → settles USDC on-chain → signs the EIP-712 Payment → replays with `PAYMENT-SIGNATURE` → receives the resource.
- **Trust layer**: spend-limit set once, executor never holds the key, every payment carries an on-chain tx receipt, replay ring enforces *one transfer = one request*.

```
Agent (buyer)          Sell-side ASP (you)               Chain
  |─ call paid tool ──>|  no PAYMENT-SIGNATURE            |
  |<─ 402 + challenge ─|  PAYMENT-REQUIRED: b64{x402}     |
  |─ USDC.transfer ────|─────────────────────────────────>|  settle on-chain
  |─ sign EIP-712 ─────|                                   |
  |─ replay w/ sig ───>|  verify amount/chainId/payTo      |
  |                    |  + signer + Transfer event        |
  |<─ 200 + live feed ─|  then serve Binance market data  |
```

## Architecture

```
┌─ Buy side ──────────────────────────┐  ┌─ Binance Agent OS / Sell side ──────────────┐
│ Agent (Claude/Codex/Cursor)  ·cyan │  │ x402 ASP · Payment Gate          ·slate      │
│ Agent Wallet / Agentic Hub  ·amber │  │ MCP Server Binding               ·cyan       │
│ Trust Layer (spend-limit)   ·rose  │  │ Paid Agent Workflows (4 lanes)   ·amber      │
└─────────────────────────────────────┘  │ Binance Feed (live market)      ·emerald    │
       x402 rail → HTTP 402 + EIP-712      │ Ledger / Audit (receipts)      ·violet     │
       on-chain USDC transfer              │ Settlement Verifier (viem)    ·emerald    │
       └───────────────────────────────────┘
```

See `architecture.html` (and `architecture.png`) for the full diagram. It lives at the repo root.

## Requirement (critical)

The VM's **IPv6 egress is broken** — all node under this repo is launched with `--dns-result-order=ipv4first` (undici `ETIMEDOUT` otherwise). The npm scripts (`npm run asp`, `npm run buy`, `npm test`, `npm run diagram`) already pass it.

## Setup

```bash
cd x402-commerce
npm install
cp .env.example .env        # set XPAY_SELLER_KEY / XPAY_BUYER_KEY (see below)
```

`.env` is gitignored and holds the runtime keys. `packages/core/src/env.js` loads it; a real shell env var wins over the file.

### Chain / settlement token

Chain-parametrised via `.env`. Default is **Base Sepolia USDC** `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (validated, fail-open, no faucet drama). For the **Binance Agent OS lane**, point `XPAY_CHAIN_ID` / `XPAY_ASSET` / `XPAY_RPC_URL` at BNB testnet ($U or USDT) — the gate is chain-agnostic; only the constants change.

| Var | Default | Notes |
|---|---|---|
| `XPAY_CHAIN_ID` | `84532` | Base Sepolia. BNB = `97` (testnet) |
| `XPAY_ASSET` | Base-Sepolia USDC | ERC-20 address of settlement token |
| `XPAY_DECIMALS` | `6` | |
| `XPAY_RPC_URL` | base-sepolia.publicnode.com | `--dns-result-order=ipv4first` enforced at launch |
| `XPAY_PRICE_USDC` | `0.02` | price per paid call |
| `XPAY_TIMEOUT_S` | `300` | settlement window |
| `XPAY_SELLER_KEY` | — | derives `payTo` if unset |
| `XPAY_PAY_TO` | seller addr | receiving address (checks case-insensitively) |
| `XPAY_BUYER_KEY` | — | buy-side spend-capped signer |
| `XPAY_PORT` | `3000` | ASP listen port |

## Run

```bash
npm run asp           # start the sell-side ASP (default :3000, Base Sepolia / USDC)
# in another shell:
XPAY_BUYER_KEY=$KEY npm run buy "http://localhost:3000/v1/market" BTCUSDT
```

**Switch to the Binance Agent OS (BNB) rail** — BSC testnet, settle in **$U** (United Stables, 18-dec, the BNB agent economy's settlement stable — NOT USDT, which is mainnet-only):

```bash
XPAY_ENV_FILE=.env.bnb XPAY_PORT=3020 npm run asp    # sell side on chain 97 / $U
# buyer (needs a BSC-funded key with BNB + $U to settle live)
XPAY_ENV_FILE=.env.bnb XPAY_BUYER_KEY=<bsc-key> npm run buy "http://localhost:3020/v1/market" BTCUSDT
```

The gate and buyer are chain-agnostic: Base-Sepolia (USDC) is the fail-open default; BNB ($U eip3009) is wired and **positive settle→serve is now live-verified on BSC testnet** with a real on-chain $U payment + replay protection.

Full loop already verified live on Base Sepolia (real on-chain USDC):

```
Paid 1 call  tx=0x2987983a2016b9e57173781ef010e1e9abce98d60e6e0919fb85ab58a98ef8d5
{ "resource":"/v1/market/BTCUSDT", "symbol":"BTCUSDT", "price":"77338.00000000",
  "payer":"0x73b1…4539", "paidTx":"0x2987…8d5" }
```

## Tests

`npm test` — 6 tests: health public, 402+challenge when no signature, rejected unsigned replay, challenge/replay envelope round-trip, amount-atomic derivation.

Plus `apps/buyer/src/e2e-replay.mjs` — the **replay-protection proof** (one transfer = one request):

```
first replay : 200 - 77350.84000000
second replay: 402 - {"code":"payment_already_used","detail":"tx already consumed"}
```

## Status

- [x] x402 v2 challenge builder + EIP-712 verify (signer = payer, on-chain Transfer, replay ring)
- [x] Sell-side ASP serving live Binance feed behind the gate
- [x] Buy-side agent client (probe → settle → sign → replay)
- [x] Replay protection verified on-chain (negative matrix)
- [x] Chain-parametrised `.env` (swap Base-Sepolia ⇄ BNB)
- [x] **MCP Server binding** (stdio; `get_market_data` x402-priced + `get_quote` + `get_klines`)
- [x] **BNB rail wired AND live** (chain 97 / $U; positive settle→serve + replay protection verified on BSC testnet)
- [x] **Ledger + spend-budget enforcement** (node:sqlite audit trail + /ledger + per-payer daily budget, `XPAY_BUDGET_ATOMIC`; budget_exceeded verified live)
- [x] **Richer paid feed** — `/v1/market/:sym`, `/v1/market/:sym/ticker` (24h), `/v1/market/:sym/klines` (candles, interval/limit); same gate, per-resource replay
- [x] **Free live preview** — `/v1/preview/:sym` (2s-fresh price + 24h, no payment) for the dashboard
- [x] **Web dashboard** — static SPA served at `/` (system status, free preview strip, request studio with a live paywall-demo 402, ledger + spend budget, MCP wiring page)
- [x] **HTTP/SSE MCP** — same paid tools also mounted on the ASP at `/mcp` (remote agents; shared `packages/core/mcp-tools.js`)
- [x] **Self-serve storefront** — publish a paid feed (symbol/type/$U price/optional daily budget) → live x402 endpoint priced per-call (`/api/feeds` + Storefront UI); per-feed budget enforced at settle
- [x] **Post-deploy smoke check** — `npm run smoke [url]` (health, preview, paywall, richer rails, ledger, MCP SSE, UI)
- [x] **Deployed on Render (live)** — `https://xpay-commerce.onrender.com` (BSC testnet / `$U`), keep-alive cron armed for the judged demo window
- [ ] BNB mainnet config flip (needs real $U / p2p rail)
- [ ] Real Binance Agent OS MCP-Hub / x402 rail (mainnet) wiring

## Live demo

- **URL:** [https://xpay-commerce.onrender.com](https://xpay-commerce.onrender.com) — landing → live market feed → Market / Ledger / MCP.
- **Demo video:** [`docs/demo/xpay-commerce-demo.mp4`](docs/demo/xpay-commerce-demo.mp4) — real live screen recording (60s, 720p, ≤20MB) of the deployed product with **real clicks on every feature**: landing/live market → market studio (type a symbol, pick a resource) → **HTTP 402 x402 challenge** (+ decoded) → **a real agent wallet settles `$U` on BSC testnet and the Ledger shows the transaction land live** → Ledger overview/budget → MCP tools. Playable live at [`https://xpay-commerce.onrender.com/xpay-demo.mp4`](https://xpay-commerce.onrender.com/xpay-demo.mp4). Re-recordable via `scripts/live-demo-full.cjs` (real clicks, `ffmpeg x11grab` capture) + `scripts/build_nar_concat.py` (single-voice narration — pure concatenation, no mixing).
- **Verify it live:** `npm run smoke https://xpay-commerce.onrender.com` → **10 passed, 0 failed**
  (health · live BTC/ETH/SOL preview · 402 paywall ×3 · ledger · budget · MCP SSE · UI).
- **Docs:** [ARCHITECTURE.md](ARCHITECTURE.md) · [docs/TECHNICAL.md](docs/TECHNICAL.md) · [docs/ROADMAP.md](docs/ROADMAP.md).

## Who it's for

Developers/agents who want to **sell any Binance data, analysis, or signal feed as a
pay-per-call x402 endpoint** — agent asks → auto-settles micro-`$U` on-chain → gets the
data, no API keys or subscriptions. **It's not for** bulk/subscription merchandisers:
x402 is deliberately per-call. Removal of the x402 gate = the paywall disappears = it is
no longer pay-per-call — so the protocol **is** the product.

## Verify after deploy

```bash
npm run smoke https://xpay-commerce.onrender.com
# expect: 10 passed, 0 failed
```

## Honest limits (verified vs unverified)

- **Verified**: live Base-Sepolia on-chain settlement + replay protection; live Binance feed served behind the gate; MCP stdio loop live on-chain; **BNB $U positive settle→serve + replay protection live on BSC testnet (chain 97)**; **27/27 test suite**; HTTP/SSE MCP handshake; web dashboard + richer feed rails; node v22 / viem 2.56 (**x402 v2 implemented natively on viem — no `@x402` SDK wrapper**) / `@modelcontextprotocol/sdk` v1.30.
- **Unverified / inferred**: no official Track A judging rubric published (open call); BNB **mainnet** not exercised (needs real $U + permit2 rail); real Binance Agent OS MCP-Hub / mainnet rail is a config swap, not yet wired/tested; the in-browser "paywall demo" 402 button shows the challenge but settlement still happens via the buyer CLI (no wallet keys in the UI by design).