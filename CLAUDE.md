# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Mi Biblioteca" is a personal book-library tracker (Spanish UI) built as a **single self-contained HTML file** (`index.html`, ~1700 lines). There is no build step, no package manager, no bundler, and no test suite — everything (markup, CSS, and JS) lives in that one file. The only external dependency is the Supabase JS client loaded from a CDN `<script>` tag.

## Running / developing

There is no build or dev server tooling in this repo. The app's JS is loaded as native ES modules (`<script type="module">` plus `import`/`export` between files in `js/`), so **opening `index.html` directly via `file://` no longer works** — browsers block ES module fetches over the `file:` origin. Always serve the directory with a static file server (e.g. `python3 -m http.server`) and open it via `http://localhost:...`; this is also required for Supabase auth redirects, which rely on `window.location.origin`. There are no lint or test commands — verify changes manually in the browser.

## Architecture

Everything is defined inside a single IIFE at the bottom of `index.html` (`(function(){ "use strict"; ... })()`). There is no framework — DOM is built via manual `innerHTML` string templates and a single delegated `click` listener on `document` that dispatches on `data-action` attributes (event delegation pattern; see the big `if/else if` chain around line ~1390).

Key architectural points:

- **Backend**: Supabase (Postgres + Auth), configured via `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near the top of the script. Tables used: `books`, `wishlist`, `profile`, `notifications`, `notification_receipts`.
- **Guest mode**: The app supports an unauthenticated "invitado" mode where all data is persisted to `localStorage` instead of Supabase. Every DB operation has a paired function (`dbSelectBooks`, `dbInsertBook`, `dbUpdateBook`, `dbDeleteBook`, etc.) that branches on `isGuest` to either hit Supabase or read/write `localStorage`. When adding new persisted fields/entities, both code paths must be updated together.
- **Guest → account migration**: `migrateGuestDataToAccount()` copies `localStorage` guest data into Supabase tables after a guest signs up, triggered via the `guest_pending_migration` localStorage flag and handled in the `sb.auth.onAuthStateChange` callback.
- **Auth flow**: A single form (`#auth-form`) is reused for login/signup/password-recovery, switched via the `authMode` variable (`'login' | 'signup' | 'recover'`) and `updateAuthUI()`. Password recovery uses Supabase's `PASSWORD_RECOVERY` auth event to show a dedicated recovery screen.
- **Rendering**: All state (`books`, `wishlist`, `notifications`, `filters`, `groupBy`, etc.) lives in module-level `var`s. Any mutation is followed by a call to `renderAll()` (or a more targeted `renderBooksGrid()` / `renderWishGrid()` / `renderNotifList()`) which re-renders the relevant DOM via `innerHTML`. There is no virtual DOM or diffing — sections are fully replaced.
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
