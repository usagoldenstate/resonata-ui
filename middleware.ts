// Next.js root middleware: redirect direct navigation to hidden pages.
// Keeps the feature flags honest — hiding nav items isn't enough if an
// operator (or a bookmark, or a link) still loads `/reporting/revenue`.

import { NextResponse, type NextRequest } from "next/server"

// Env is read at build time for middleware (it runs on the edge), so these
// literals are frozen per deploy. That's fine — feature flags are per-env.
const SHOW = {
  dashboard: process.env.NEXT_PUBLIC_SHOW_DASHBOARD === "true",
  reporting: process.env.NEXT_PUBLIC_SHOW_REPORTING === "true",
  callLog: process.env.NEXT_PUBLIC_SHOW_CALL_LOG === "true",
  faqs: process.env.NEXT_PUBLIC_SHOW_FAQS === "true",
}

// Landing page when a hidden page is blocked. Knowledge Base is always on,
// so it's the safe fallback.
const FALLBACK = "/knowledge-base"

function isHidden(pathname: string): boolean {
  if (pathname === "/") return !SHOW.dashboard
  if (pathname.startsWith("/reporting")) return !SHOW.reporting
  if (pathname.startsWith("/call-log")) return !SHOW.callLog
  if (pathname.startsWith("/faqs")) return !SHOW.faqs
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isHidden(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = FALLBACK
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

// Only run the middleware on actual page routes, not static assets, API
// handlers, or Next.js internals.
export const config = {
  matcher: ["/((?!_next/|api/|static/|.*\\..*).*)"],
}
