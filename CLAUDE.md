# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Mi Biblioteca" is a personal book-library tracker (Spanish UI). `index.html` holds the markup (~490 lines); CSS lives in `css/styles.css`; JS is split into native ES modules under `js/` (see Architecture below). There is no build step, no package manager, no bundler, and no test suite — the browser loads the `.js`/`.css` files directly, unbundled. The only external dependencies are the Supabase JS client, Sentry, and PostHog, all loaded from CDN `<script>` tags.

## Running / developing

There is no build or dev server tooling in this repo. The app's JS is loaded as native ES modules (`<script type="module">` plus `import`/`export` between files in `js/`), so **opening `index.html` directly via `file://` no longer works** — browsers block ES module fetches over the `file:` origin. Always serve the directory with a static file server (e.g. `python3 -m http.server`) and open it via `http://localhost:...`; this is also required for Supabase auth redirects, which rely on `window.location.origin`. There are no lint or test commands — verify changes manually in the browser.

## Architecture

The app's JS lives in native ES modules under `js/`, loaded via `<script type="module" src="js/main.js"></script>` in `index.html` — no bundler, no build step, plain `import`/`export` between flat files. There is no framework — DOM is built via manual `innerHTML` string templates and a single delegated `click` listener on `document` (in `js/main.js`) that dispatches on `data-action` attributes via a big `if/else if` chain (event delegation pattern; not yet a lookup-table dispatch — kept as-is during the modularization to minimize risk).

Module map:
- `js/state.js` — the single shared mutable `state` object (books, wishlist, filters, view/sort/column config, auth/session flags, notifications, etc.), plus static constants (`STATUS_LABELS`, `ICONS`, caps, etc.) and the role predicates (`isPremiumUser`, `canAddBook`, `canAddWish`). Every other module reads/writes app state through `state.x`, never through a bare identifier — a plain `import {x}` binding is read-only, so cross-module mutation has to go through an object property instead of reassigning the imported name itself.
- `js/db.js` — the Supabase client, guest-mode `localStorage` persistence, all `dbSelect*`/`dbInsert*`/`dbUpdate*`/`dbDelete*` functions, cover-storage helpers, and saved filter/view preferences.
- `js/telemetry.js` — Sentry + PostHog init and wrappers (`reportError`, `trackEvent`, etc.).
- `js/utils.js` — pure, stateless helpers (`esc`, date/cost formatting, saga-key parsing).
- `js/ui.js` — toast, the confirm-modal, scroll-lock, the generic focus-trap, avatar icon-picker, library-title editing.
- `js/table.js` / `js/render.js` — table scaffolding and column defs (`table.js`) and all grid/card/stats/detail-modal rendering (`render.js`). These two import from each other (`render.js`'s `coverThumbHTML` is used by `table.js`'s column defs; `render.js` needs the column defs back) — a deliberate, verified-safe circular import, since neither side is touched at module-evaluation time, only inside functions called later.
- `js/forms-shared.js` — author autocomplete, cross-domain saga-numbering suggestions, cover upload/validation, and guest→account data migration — all genuinely shared by both the book and wish forms.
- `js/books.js` / `js/wishlist.js` — modal open/close/dirty-check and save logic for each entity. `wishlist.js` has no dependency on `books.js` even though "comprar" (buying a wish item) conceptually creates a book — that handler still lives in `main.js`'s click dispatch.
- `js/notifications.js` — the notification bell, list, and read/delete actions.
- `js/auth.js` — login/signup/recovery UI, OAuth, guest mode, and `loadData()` (the "fetch everything and render" bootstrap). It does not own the `sb.auth.onAuthStateChange` registration itself — that stays in `main.js`, which is the actual app entry point.
- `js/main.js` — composition root: every import, the remaining one-time wiring (auth listeners, `sb.auth.onAuthStateChange`, scroll-lock/focus-trap init, filter/search inputs, form submits), and the big delegated click handler.

`admin.html` is a separate, smaller, similarly self-contained page with no code sharing with `index.html` — not part of this module system.

Key architectural points:

- **Backend**: Supabase (Postgres + Auth), configured via `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near the top of `js/db.js`. Tables used: `books`, `wishlist`, `profile`, `notifications`, `notification_receipts`, `subscriptions`.
- **Edge Functions** (`supabase/functions/`, deployed separately from this repo's static files — see each `index.ts`'s header comment for deploy instructions and required secrets): `download-cover` (re-hosts a user-supplied cover image URL into Storage), `create-checkout` (creates a Lemon Squeezy hosted checkout session for a Premium upgrade), `ls-webhook` (receives Lemon Squeezy payment/subscription webhooks and syncs `profile.role` + `subscriptions`). All three use a service-role admin client to bypass RLS server-side; none of their secrets live in this repo.
- **Payments**: Free users upgrade to `premium` via Lemon Squeezy (Merchant of Record — chosen because Stripe doesn't support Ecuador-registered sellers). Three plans (`monthly`/`annual`/`lifetime`) all grant the same `role:'premium'`; `fundador` stays a separate, manually admin-granted role untouched by payments. Checkout is a full-page redirect to Lemon Squeezy's hosted checkout (`js/db.js`'s `dbStartCheckout()` → `create-checkout` Edge Function), never an embedded script/iframe, so no CSP changes were needed. `ls-webhook` is the sole writer of `subscriptions` and of `profile.role` transitions to/from `premium`.
- **Guest mode**: The app supports an unauthenticated "invitado" mode where all data is persisted to `localStorage` instead of Supabase. Every DB operation has a paired function (`dbSelectBooks`, `dbInsertBook`, `dbUpdateBook`, `dbDeleteBook`, etc., in `js/db.js`) that branches on `state.isGuest` to either hit Supabase or read/write `localStorage`. When adding new persisted fields/entities, both code paths must be updated together.
- **Guest → account migration**: `migrateGuestDataToAccount()` (in `js/forms-shared.js`) copies `localStorage` guest data into Supabase tables after a guest signs up, triggered via the `guest_pending_migration` localStorage flag and handled in `js/main.js`'s `sb.auth.onAuthStateChange` callback.
- **Auth flow**: A single form (`#auth-form`) is reused for login/signup/password-recovery, switched via `state.authMode` (`'login' | 'signup' | 'recover'`) and `updateAuthUI()` (in `js/auth.js`). Password recovery uses Supabase's `PASSWORD_RECOVERY` auth event to show a dedicated recovery screen.
- **Rendering**: All app state (`state.books`, `state.wishlist`, `state.notifications`, `state.filters`, `state.groupBy`, etc.) lives in the single shared `state` object exported by `js/state.js` — every module that needs to read or mutate it imports `state` and accesses `state.x`, since a plain `import {x}` binding can't be reassigned from outside its own module. Any mutation is followed by a call to `renderAll()` (or a more targeted `renderBooksGrid()` / `renderWishGrid()` / `renderNotifList()`, in `js/render.js`/`js/notifications.js`) which re-renders the relevant DOM via `innerHTML`. There is no virtual DOM or diffing — sections are fully replaced.
- **Two main entities**: `books` (your library, with `status`: `pendiente`/`leyendo`/`leido`) and `wishlist` (books you want to buy). A "buy-wish" action converts a wishlist item into a book and deletes the wishlist entry.
- **Filtering/grouping**: Book and wishlist views each have independent filter state (`filters` / `wishFilters`) and group-by state (`groupBy` / `wishGroupBy`), persisted to `localStorage` via `savePrefs()`/`loadPrefs()` so preferences survive reloads (per-browser, not per-account).
- **Notifications**: Only available for authenticated (non-guest) users. Backed by two tables — `notifications` (the message) and `notification_receipts` (per-user read state) — joined via a Supabase `select` with an embedded relation. Notifications older than 30 days are purged on load.
- **Icons**: Inline SVGs, either hardcoded in the HTML template sections or stored as strings in the `ICONS` object for reuse in JS-generated markup.
- **XSS safety**: User-supplied strings are escaped via the `esc()` helper before being interpolated into `innerHTML` templates — always use `esc()` when adding new interpolated user data to HTML strings.

## Conventions to follow when editing

- Match the existing code style: ES5-style `var`, `function(){}` expressions (no arrow functions, no `let`/`const`, no classes) — this is intentional throughout the file, keep new code consistent with it.
- UI copy is in Spanish; keep new user-facing strings in Spanish to match.
- CSS uses custom properties defined in `:root` (`--ink`, `--paper`, `--bg`, `--brass`, `--sage`, `--burgundy`, etc.) — reuse these tokens rather than hardcoding new colors.
- New interactive elements should follow the `data-action="..."` + delegated-listener pattern rather than attaching individual `addEventListener` calls per element.
