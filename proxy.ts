import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { buildCsp } from "./lib/csp"

const SHOW = {
  dashboard: process.env.NEXT_PUBLIC_SHOW_DASHBOARD === "true",
  reporting: process.env.NEXT_PUBLIC_SHOW_REPORTING === "true",
  reportingChat: process.env.NEXT_PUBLIC_SHOW_REPORTING_CHAT === "true",
}

const FALLBACK = "/knowledge-base"

const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/__clerk/(.*)",
  // Browsers POST CSP violation reports here without any session.
  "/csp-report",
])

function isHidden(pathname: string): boolean {
  if (pathname === "/") return !SHOW.dashboard
  if (pathname.startsWith("/reporting/chat")) return !SHOW.reporting || !SHOW.reportingChat
  if (pathname.startsWith("/reporting")) return !SHOW.reporting
  return false
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl
  if (isHidden(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = FALLBACK
    return NextResponse.redirect(url)
  }
  if (!isPublic(req)) {
    await auth.protect()
  }

  // Enforced CSP (lib/csp.ts), validated via a report-only rollout first.
  // The nonce must ride on the *request* CSP header — that's what tells
  // Next.js to stamp it onto its own <script> tags during render. Violations
  // still POST to /csp-report (Vercel logs in prod), so regressions surface.
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("content-security-policy", csp)
  // Read by app/layout.tsx to nonce the clerk-js script tag; also makes every
  // page render dynamically, which a per-request nonce requires anyway.
  requestHeaders.set("x-nonce", nonce)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("content-security-policy", csp)
  return res
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
