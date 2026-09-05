# xPay Commerce — Roadmap

Scoped honestly: what is real today, where it goes next, and what it takes to go from a
judged demo to a product. Nothing here is claimed as built.

## Today (live, verified)
- Pay-per-call x402 gate over the live Binance feed — BSC testnet / `$U`.
- Replay protection + per-payer daily budget + a durable on-chain audit ledger.
- THREE surfaces: REST feed, MCP tools (stdio + HTTP/SSE), buy-side CLI.
- Landing + product dashboard (Market / Ledger / MCP) on `https://xpay-commerce.onrender.com`.

## Next (build order, grounded in what's real)
1. **BNB mainnet flip.** The rail is chain-agnostic and verified on testnet; mainnet is a
   config swap once real `$U` + the permit2/eip3009 rail are available. This is the
   "agents paying agents in production" story.
2. **Direct Binance Agent OS MCP-Hub wiring.** Today agents reach the paid tools over our
   HTTP/SSE MCP endpoint; registering the server on the Agent OS MCP hub makes it one-URL
   discoverable inside Binance's own agent stack.
3. **Durable ledger.** `node:sqlite` resets on redeploy; move to Postgres so the audit
   trail outlives instance restarts and supports per-payer analytics.
4. **Spend-cap UX.** Expose the per-payer daily budget set-once in the UI (already enforced
   server-side) so a customer holds their own reins — no keys in the UI, matching the
   current architecture.

## Demo → product
- **Who it's for:** developers/agents selling any Binance data, analysis, or signal feed as
  a per-call x402 endpoint — "turn your feed into a paid tool an agent will pay for."
- **Who it's NOT for:** bulk merchandisers who want a subscription (x402 is per-call by
  design) or consumers who don't have an agent paying them.
- **Expand after the hackathon:** catalog + one-URL publish flow (name your resource, set
  the `$U`/USDC price, share the MCP endpoint), seller onboarding, usage analytics. The
  same x402 gate already serves any resource — listing more feeds is configuration.`