# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server at http://localhost:3000
- `npm run build` — production build (note: `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `tsc --noEmit` is the reliable type check)
- `npm run start` — serve the production build
- `npm run lint` — `eslint .`

No test suite is configured.

## Architecture

This is a Next.js 16 App Router + React 19 admin UI for the Resonata voice-agent backend. It is UI-only: there are no server routes under `app/api/`; every page talks directly to a FastAPI backend from the browser.

### Backend boundary (`lib/api.ts`, `lib/env.ts`)

All backend calls go through the `api<T>(path, opts)` wrapper in `lib/api.ts`. It:

- Prefixes `NEXT_PUBLIC_API_URL` (set per-env; points at FastAPI, e.g. `http://localhost:8000` in dev).
- Injects `X-Admin-Token` from `NEXT_PUBLIC_ADMIN_TOKEN`. The token is intentionally public-to-browser — acceptable for the single-operator MVP, not for a public rollout.
- Sends `ngrok-skip-browser-warning: true` so ngrok-fronted dev backends work.
- Throws `ApiError` (with status + parsed body) on non-2xx.

When adding backend calls, always go through `api()`; do not call `fetch` directly.

### Hotel selection (`lib/hotel-context.tsx`)

`<HotelProvider>` wraps the app in `app/layout.tsx` and is the single source of truth for the currently selected hotel. It loads `GET /api/v1/admin/hotels` once on mount, persists the selection in `localStorage` under `resonata.selected_hotel_id`, and falls back to the first active hotel on first load. Every data-bound page reads `hotelId` from `useHotel()` and scopes its requests to it.

### Feature flags + hidden pages

Pages that aren't wired to the backend yet are hidden behind `NEXT_PUBLIC_SHOW_*` env vars (see `.env.example`). The flags are enforced in **two** places that must stay in sync:

- `components/sidebar.tsx` hides nav items.
- `middleware.ts` redirects direct navigation (including bookmarks) to `/knowledge-base` as the fallback.

`lib/env.ts` exports the parsed flags (`featureFlags`, `pageFlagByPrefix`, `dashboardVisible`). The dashboard lives at `/` and is handled as an exact-match special case in the middleware — do not add it to the prefix list. Middleware env is frozen at build time (edge runtime), so flag changes require a redeploy.

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
