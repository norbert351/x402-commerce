# xPay Commerce — Design System

_Source of truth for the UI. Built fresh per the Composition Variation System — this identity is new, not carried from any prior project._

## 1. Identity (one sentence)

> **"Ink terminal-economy for agents"** — a deep graphite developer console where a warm amber marks real money changing hands. Technical but alive, editorial but unmistakably a payments rail.

- **Who it's for:** developers, AI agents, hackathon judges who must *feel* the x402 protocol is load-bearing in one glance.
- **Tone of copy:** plain, first-time-friendly, confident, zero hype. Conversational instructions + precise onchain readouts.
- **Memorable trait:** the amber "money-in-motion" accent + a serialized 3-step payment-rail visual on the landing.

## 2. Palette

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0D12` | app background (blue-tinted ink, not pure black) |
| `--bg-2` | `#0E131B` | sidebar, raised wells |
| `--card` | `#11161F` | cards |
| `--card-2` | `#151C27` | hover / inset |
| `--border` | `#1E2633` | hairline strokes |
| `--border-2` | `#2A3342` | strong borders |
| `--text` | `#EDE9E2` | warm off-white headings |
| `--body` | `#C7CDD8` | body text |
| `--muted` | `#8A93A5` | secondary |
| `--accent` | `#FFB020` | **amber** — price, money, CTAs |
| `--accent-2` | `#FFCE6B` | amber highlight / gradient |
| `--accent-dim` | `#3A2E15` | amber tint tiles |
| `--green` | `#34D399` | online / positive change |
| `--danger` | `#F87171` | errors / 402 blocks |
| `--warn` | `#F59E0B` | caution |

Contrast: all body/muted temps pass AA on `--bg`/`--card`. Amber on ink = strong primary contrast. **No purple, no teal, no neon blur.**

## 3. Typography

- **Display (H1/H2/eyebrow):** **Clash Display** 500–700 (Fontshare) — geometric, technical, premium.
- **Body/UI:** **General Sans** 400–600 (Fontshare).
- **Mono (all onchain readouts, prices, hashes, code):** **JetBrains Mono** (Google Fonts).
- Loaded via CDN `<link>` (plain static SPA — no build step).

## 4. Space / Radius / Motion

- Radius: **10px** cards, **14px** hero showcase, **999px** pills.
- Base: 4px scale; section gaps 16–32px; content max-width **1120px**.
- Motion: `cubic-bezier(0.16,1,0.3,1)`; subtle rise-in on load (stagger), amber pulse on live dots, hover lift on cards. Content visible by default (no scroll-hide for new users).

## 5. Hero architecture (landing = Dashboard root)

Centered brand statement — **no text-block-on-the-right**:

- eyebrow pill (protocol creds) → centered H1 (amber keyword) → subhead → CTA row (primary "Unlock live data →" to Market, secondary "Open the ledger"):
- **Showcase visual below the headline:** a serialized 3-step payment rail (Probe → 402 challenge → Settle & serve) drawn as connected nodes with an amber payment token animating head-right; floating live stat chips (price/call, chain·asset, paid calls) around it.
- Below the fold: System status stats, free market preview strip, then two explainer cards + developer entry. Landing funnels to Market/Ledger via the CTAs; live data panels stay on their own product pages.

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