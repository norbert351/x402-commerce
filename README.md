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
- [x] **MCP Server binding** (stdio; `get_market_data` x402-priced + `get_quote`)
- [x] **BNB rail wired AND live** (chain 97 / $U; positive settle→serve + replay protection verified on BSC testnet)
- [x] **Ledger + spend-budget enforcement** (node:sqlite audit trail + /ledger + per-payer daily budget, `XPAY_BUDGET_ATOMIC`; budget_exceeded verified live)
- [ ] BNB mainnet config flip (needs real $U / p2p rail)
- [ ] Real Binance Agent OS MCP-Hub / x402 rail (mainnet) wiring
- [ ] Deploy (Render) + keep-alive for judged demo window

## Honest limits (verified vs unverified)

- **Verified**: live Base-Sepolia on-chain settlement + replay protection; live Binance feed served behind the gate; MCP stdio loop live on-chain; **BNB $U positive settle→serve + replay protection live on BSC testnet (chain 97)**; 11/11 test suite; node v22 / viem 2.56 / @x402 / MCP-SDK compatibility.
- **Unverified / inferred**: no official Track A judging rubric published (open call); BNB **mainnet** not exercised (needs real $U + permit2 rail); real Binance Agent OS MCP-Hub / mainnet rail is a config swap, not yet wired/tested.