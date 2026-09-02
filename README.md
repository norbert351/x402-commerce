# xPay Commerce

**Pay-per-call MCP commerce on Binance Agent OS** — the Payment Workflows lane of the Binance Agent OS Mini Hackathon (Track A).

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
npm run asp           # start the sell-side ASP (default :3000)
# in another shell:
XPAY_BUYER_KEY=$KEY npm run buy "http://localhost:3000/v1/market" BTCUSDT
```

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
- [ ] MCP Server binding (Streamable HTTP / stdio tool surface)
- [ ] Ledger/audit persistence (postgres) + spend-budget enforcement UI
- [ ] Real Binance Agent OS x402 rail (BNB) wiring
- [ ] Deploy (Render) + keep-alive for judged demo window

## Honest limits (verified vs unverified)

- **Verified**: live Base-Sepolia on-chain settlement + replay protection, live Binance market-data feed reachable+served behind the gate; 6/6 test suite; node v22 / viem 2.56 / @x402 SDK compatibility.
- **Unverified / inferred**: no official Track A judging rubric published (open call); BNB-chain settlement constants not yet exercised live; real Binance Agent OS MCP-Hub integration is a config swap, not yet wired/tested.