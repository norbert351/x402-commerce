# xPay Commerce — Design System

_Source of truth for the UI. Built fresh per the Composition Variation System — this identity is new, not carried from any prior project._

## 1. Identity (one sentence)

> **"Clean ink-terminal for agents"** — a tidy, flat dark developer page where a single warm amber marks real money changing hands. Minimal chrome, a real-time market panel as the hero, no AI-generic gradients or grit.

- **Who it is for:** developers, AI agents, hackathon judges who must *feel* the x402 protocol is load-bearing in one glance.
- **Tone of copy:** plain, first-time-friendly, confident, zero hype. Conversational instructions + precise onchain readouts.
- **Memorable trait:** the amber money accent + a **live market-data panel** (real prices + sparklines over the free preview rail) as the hero image, matching what the product actually is.

## 2. Palette

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B0E14` | flat, clean ink background |
| `--bg-2` | `#10141C` | sidebar, raised wells |
| `--card` | `#141925` | cards (flat, no banding) |
| `--card-2` | `#171D2A` | hover / inset |
| `--border` | `#1F2634` | hairline strokes |
| `--border-2` | `#2B3446` | strong borders |
| `--text` | `#F2F4F8` | warm off-white headings |
| `--body` | `#C6CEDB` | body text |
| `--muted` | `#93A0B5` | secondary |
| `--accent` | `#F0B23C` | **amber** — price, money, CTAs |
| `--accent-2` | `#FFD27A` | amber highlight / gradient |
| `--accent-dim` | `#3A2F16` | amber tint tiles |
| `--green` | `#3ECF8E` | online / positive change |
| `--danger` | `#F97066` | errors / 402 blocks |
| `--warn` | `#F5A623` | caution |

Contrast: all body/muted temps pass AA on `--bg`/`--card`. Amber on ink = strong primary contrast. **No purple, no teal, no neon blur, no heavy radial glows or grid grit.**

## 3. Typography

- **Display (H1/H2/eyebrow):** **Switzer** 500–700 (Fontshare) — clean, geometric, softer terminals than Clash Display.
- **Body/UI:** **General Sans** 400–600 (Fontshare).
- **Mono (all onchain readouts, prices, hashes, code):** **JetBrains Mono** (Google Fonts).
- Loaded via CDN `<link>` (plain static SPA — no build step).

## 4. Space / Radius / Motion

- Radius: **10px** cards, **14px** hero showcase, **999px** pills.
- Base: 4px scale; section gaps 16–32px; content max-width **1120px**.
- Motion: `cubic-bezier(0.16,1,0.3,1)`; subtle rise-in on load (stagger), amber pulse on live dots, hover lift on cards. Content visible by default (no scroll-hide for new users).

## 5. Hero architecture (landing = standalone page, NO app chrome)

The homepage is a **marketing landing with its own header** — the sidebar/topbar/bottom-nav app chrome is hidden (`body.on-landing`). Centered brand statement — **no text-block-on-the-right**:

- Own slim header: brand left, text nav (Market/Ledger/MCP) center, primary CTA right.
- eyebrow pill (protocol creds) → centered H1 (amber keyword) → subhead → CTA row (primary "Unlock live data →" to Market, secondary "Open the ledger"):
- **Live market panel** = the real-time hero image: three ticker rows (price + 24h change + live SVG sparkline) fed by the free `/v1/preview` rail, refreshing every 5s. This matches what the product sells (market data).
- **System chips row** under the panel (price/call, chain·asset, paid calls, budget) wired to `/health`.
- Below the fold: "How the pay-per-call rail works" (3 steps) → "Built for agents, audited like a ledger" (trust bullets) → CTA band → footer. Product data panels live on the product routes.

## 6. Component notes (all reused view classes restyled)

- **Cards:** inset ink, 1px hairline, hover `border-2`. Head = title (Clash 600) + right hint.
- **Stats:** 4-up; label = mono uppercase micro; value = Amber (money) or text (identity). Live ones get an amber pulse dot.
- **Pills:** 999px, tinted bg + tint border. `teal`→amber accent token, `green`/`red`/`warn`/`muted` stay semantic.
- **Buttons:** primary = amber bg, ink text, 600 weight, hover lift; outline = hairline; warn = amber outline. Block on ≤560px.
- **Inputs/fields:** `#0C1016` bg, hairline, amber focus ring (3px `--accent` 12%).
- **Tables:** hairline frame, sticky-ish header on `--bg-2`, mono cells for keys, dashed hover.
- **Code blocks:** `#0A0D12` inset, amber resized header chip, mono 12.5px, amber copy button.
- **Steps:** numbered amber disks on a hairline spine (kept from original taxonomy; re-skinned).
- **Banners:** tinted bg + tint border; error/danger, warn, info(amber-tint).

## 7. Mobile

- Sticky topbar brand always; sidebar hidden ≤899px, bottom nav shown; hero stacks; CTA buttons full-width ≤560px; stats 2-up ≤700px; tables scroll horizontally. Verified via style-sheet media-query inspection + 390px capture.