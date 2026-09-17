---
name: bruukion-design-system
description: Bruukion's own visual identity — palette, type, tone, and component conventions. Load whenever touching CSS, adding a new UI element, or designing a new screen/mockup for this app, so new work matches the shipped brand instead of drifting toward generic defaults.
---

# Bruukion design system

Bruukion ("Mi Biblioteca") is a personal book-library tracker. Its identity is **lúdica/coleccionista** — playful, collector-minded, tactile — like a well-loved personal bookshelf, not a SaaS dashboard. Tagline: **"Tu biblioteca personal"**.

This skill is the standing reference so new UI stays consistent with the shipped brand. Use it together with `frontend-design` (aesthetic-direction discipline) — this skill supplies the concrete answers (which colors, which fonts, which shapes) so Claude doesn't fall back to generic defaults (purple-blue gradients, Inter, stock Lucide icons, "Elevate your workflow" copy).

## Palette — one semantic job per color, never reuse

Defined as CSS custom properties in `css/styles.css` `:root`. Each color has exactly **one** job — this discipline is what makes the palette read as intentional, not decorative. Don't repurpose a color for a second meaning (e.g. don't reuse `--amber` for anything but "leyendo" status).

| Token | Hex | Job |
|---|---|---|
| `--ink` | `#241C2E` | primary text / dark surfaces |
| `--paper` | `#FFF8EC` | card/surface background |
| `--bg` | `#FBF0D9` | page background |
| `--border` | `#E8D9AE` | hairline borders |
| `--coral` / `--coral-dark` | `#E8543E` / `#C23F2C` | the ONE general accent: primary CTAs, wishlist, brand icon lomo 1, active-toggle tint, links |
| `--amber` / `--amber-dark` | `#F5A623` / `#C57F12` | "leyendo" (reading) status — only |
| `--teal` / `--teal-dark` | `#2FBF9F` / `#1F9B80` | "leído" (read) status — only |
| `--muted-plum` | `#8B7E92` | "pendiente" status / general neutral |
| `--violet` / `--violet-dark` | `#7B4B8C` / `#5F3A6D` | premium/fundador/edición-especial only |
| `--danger` / `--danger-dark` | `#A8433A` / `#8A362F` | destructive/error only, never a brand accent |
| `--text` / `--text-muted` | `#241C2E` / `#6B6072` | body text / secondary text |

Always reuse these tokens (per CLAUDE.md) — never hardcode a new hex for something these already cover.

## Typography

- `--font-serif`: **Bricolage Grotesque** — headings, numbers, the logo/wordmark. (Var name says "serif" for historical reasons; it's actually a display sans. Don't rename the var.)
- `--font-sans`: **Onest** — body text, UI controls.
- Both loaded via Google Fonts `<link>` in `index.html`; CSP already permits `fonts.googleapis.com`/`fonts.gstatic.com`.

## Shape & elevation

- Generously rounded corners: ~10–14px on buttons/inputs/nav items, ~20px on cards/modals. Avoid sharp corners and avoid full-pill unless it's a chip/badge.
- Shadows are soft and ink-tinted, never pure black: `rgba(36,28,46,.04–.12)`, e.g. `box-shadow:0 12px 32px rgba(36,28,46,.08)`. Coral CTAs get a coral-tinted glow instead: `rgba(232,84,62,.35)`.

## Iconography

Inline SVGs only (`ICONS` object in `js/state.js`, or hardcoded in `index.html`), no icon font/library. The brand mark is a stylized 3-book-spine tile (evolved, not a generic line icon) — reuse its silhouette/spirit for any new brand-adjacent icon rather than reaching for a stock icon set. Covers with no image show the book's **status color** as background with just the title's first letter centered (not a generic gradient).

## Copy tone

Spanish UI, tú-form (not voseo) — see `feedback_spanish_tone_neutral` memory. Playful/collector voice for brand-facing copy (marketing, empty states, onboarding); plain functional Spanish for utilitarian microcopy (form labels, errors) — don't force personality into every string.

## Workflow

Per `feedback_design_workflow` memory: for any new screen or nontrivial visual change, mock it up with the `/design` skill (Claude Design canvas) and get explicit approval on a **concrete personality brief** before writing CSS/HTML — abstract briefs like "modern" or "clean" regress toward generic. Ground new mockups in this palette/type/shape system rather than starting from a blank aesthetic.

Full color-to-element mapping lives in the brand manual artifact referenced in the `session_2026-09-02_brand_redesign` memory — consult it if a request needs the exhaustive list of what uses which color.
