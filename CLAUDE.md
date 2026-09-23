# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server at http://localhost:3000
- `npm run build` — production build (note: `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `tsc --noEmit` is the reliable type check)
- `npm run start` — serve the production build
- `npm run lint` — `eslint .`

No test suite is configured.

## Architecture

This is a Next.js 16 App Router + React 19 admin UI for the Resonata voice-agent backend. It is UI-only: every page talks directly to a FastAPI backend from the browser; the only server route is `app/csp-report/route.ts`, a sink for browser CSP violation reports.

### Security headers + CSP (`lib/csp.ts`, `proxy.ts`, `next.config.mjs`)

A nonce-based Content-Security-Policy is built per-request in `proxy.ts` and enforced. Anything that loads from or connects to a **new external domain** must be allowlisted in `lib/csp.ts` or the browser blocks it (violations POST to `/csp-report` and appear in the devtools console / Vercel logs). Clerk's domains are derived from the publishable key. The per-request nonce is why all pages render dynamically (`headers()` in `app/layout.tsx` feeds it to `ClerkProvider`). Static fallback headers (`frame-ancestors`, `nosniff`, etc.) live in `next.config.mjs`.

### Backend boundary (`lib/api.ts`, `lib/env.ts`)

All backend calls go through the `api<T>(path, opts)` wrapper in `lib/api.ts`. It:

- Prefixes `NEXT_PUBLIC_API_URL` (set per-env; points at FastAPI, e.g. `http://localhost:8000` in dev).
- Reads the Clerk session token from the bridge mounted in `app/(protected)/layout.tsx` and sends it as `Authorization: Bearer ...`.
- Sends `ngrok-skip-browser-warning: true` so ngrok-fronted dev backends work.
- On a backend 401, clears the stored hotel scope (`resonata.hotel_scope` + the legacy `resonata.selected_hotel_id`) and signs the user out to `/sign-in`.
- `withQuery` emits a `string[]` param as a repeated key (`?hotel_id=a&hotel_id=b`, blanks dropped, de-duplicated) — how the backend's multi-hotel scope reads it.
- Throws `ApiError` (with status + parsed body) on non-2xx.

When adding backend calls, always go through `api()`; do not call `fetch` directly.

### Hotel selection (`lib/hotel-context.tsx`)

`<HotelProvider>` is mounted only after Clerk reports `isLoaded && isSignedIn` in `app/(protected)/layout.tsx`. It loads `GET /api/v1/me/hotels` once on mount and falls back to the first accessible active hotel on first load.

The selection is a **scope**: one hotel (`{kind: "hotel", hotelId}`) or one organization — a management company's portfolio, every accessible hotel with that `organization_id` (`{kind: "org", organizationId}`). Only the scope's identity is persisted (`localStorage` `resonata.hotel_scope`; the legacy `resonata.selected_hotel_id` is migrated on read), and an org's hotel list is recomputed from every fresh `/me/hotels` response so membership changes and revoked grants take effect on the next load. A `?hotel_id=` URL param (the sales email's "open the call" link) always forces single-hotel scope. The sidebar groups hotels under their organization and offers "<Org> (N hotels)" once a group spans two or more visible hotels (N is the user's accessible subset, so the label is honest for a partial grant).

`useHotel()` exposes `hotelId` (null in org mode), `scope`, `scopeHotels`, `scopeLabel`, `organizations`, `setHotelId`, `setScope`. Only `/call-log` and `/sales-inquiries` render a whole organization (rows carry a hotel badge; requests send `hotel_id` repeated; the backend applies dates hotel-locally per hotel; the sales page fetches each hotel's roster — the owner filter merges them, editing uses the row's hotel roster, and detail/patch calls are keyed by the row's own `hotel_id`). Every other route is single-hotel: `ScopeGate` in the protected layout swaps it for the shared `SingleHotelRequired` prompt while the scope is an organization (allowlist `PORTFOLIO_ROUTES` — a new page gets the safe behaviour for free; never fall back to the first hotel silently). Organizations are created/renamed under Dev Pages → Organizations, attached per hotel on Settings (platform admin), and granted per user on Dev Pages → User Access (invite form, manual grant, org chips).

### Product lines (`lib/product-lines.ts`)

Each hotel carries `lines` (`reservations` | `sales` | `both`) on its `/me/hotels` item — which products it bought. `useHotel().scopeLines` is the union across the scope (null until the list loads; a missing field reads as `reservations`, so an older backend degrades to today's reservations UI). `LINE_RULES` in `lib/product-lines.ts` is the single map of line-specific routes (`/`, `/reporting/*`, `/faqs`, `/room-mapping` → reservations; `/sales-inquiries` → sales; everything else shared), used by both the sidebar (hides items) and `LineGate` in the protected layout (redirects a blocked page, including a bookmarked one, to `homeRouteFor` — `/sales-inquiries` for a sales-only scope, `/` otherwise). Add a new line-specific page there, not as a one-off check. Call Log pins a single-line scope to its line and shows the Line column/filter only for `both`; Agent Configuration renders Reservations/Sales tabs only for `both` hotels and saves only the fields of the hotel's lines (the transfer-departments PUT still round-trips every department's `sales_line_transfer`, chosen via the Sales section's dropdown). `lines` itself is set by platform admins in Settings → Products.

### Feature flags + hidden pages

Pages that aren't wired to the backend yet are hidden behind `NEXT_PUBLIC_SHOW_*` env vars (see `.env.example`). The flags are enforced in **two** places that must stay in sync:

- `components/sidebar.tsx` hides nav items.
- `proxy.ts` combines Clerk route protection with direct-navigation redirects (including bookmarks) to `/knowledge-base` as the fallback.

`lib/env.ts` exports the parsed flags (`featureFlags`, `pageFlagByPrefix`, `dashboardVisible`). The dashboard lives at `/` and is handled as an exact-match special case in the proxy — do not add it to the prefix list. Proxy env is frozen at build time (edge runtime), so flag changes require a redeploy.

### Knowledge Base serialization (`lib/knowledge-serialize.ts`)

The Knowledge Base editor stores rich sections (plain field lists, catalog tables, pool cards, venue cards) in-memory. `sectionsToEntries` flattens each section into two backend fields:

- `content` — human-readable text the voice agent reads in its system prompt. Metadata like confidence/source is stripped so the LLM doesn't read editor state aloud.
- `structured_content` — the raw UI section, persisted verbatim so the editor rehydrates losslessly.

`entriesToSections` rehydrates, preferring `structured_content` and falling back to a single-field placeholder for legacy YAML-seeded rows. When adding a new section type, update both the `renderSectionContent` switch and the `Section` union.

### UI stack

- shadcn/ui (style: `new-york`, base color: `neutral`) — config in `components.json`, components in `components/ui/`. Aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- Tailwind v4 (`@tailwindcss/postcss`), global CSS at `app/globals.css`, CSS variables enabled.
- `lucide-react` for icons, `sonner` for toasts, `recharts` for charts, `react-hook-form` + `zod` for forms.

## Notes

- This repo is linked to a v0 project; edits made in v0 push commits directly to `main` and deploy via Vercel. Be aware that v0-generated commits may land alongside hand edits.
- `next.config.mjs` has `typescript.ignoreBuildErrors: true` and `images.unoptimized: true` — typecheck explicitly (`npx tsc --noEmit`) rather than relying on `next build` to catch TS errors.
