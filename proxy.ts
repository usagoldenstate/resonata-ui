import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

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
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
