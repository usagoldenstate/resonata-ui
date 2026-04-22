// Typed access to the `NEXT_PUBLIC_*` env vars the UI reads in the browser.
// Every flag defaults to hidden/false so a missing env var never surprises
// operators with a mock-data page they shouldn't see.

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  adminToken: process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "",
} as const

// Feature flags — one per page, defaulted to false. Explicit "true" string
// turns a page on.
function flag(raw: string | undefined): boolean {
  return raw === "true"
}

export const featureFlags = {
  showDashboard: flag(process.env.NEXT_PUBLIC_SHOW_DASHBOARD),
  showReporting: flag(process.env.NEXT_PUBLIC_SHOW_REPORTING),
  showCallLog: flag(process.env.NEXT_PUBLIC_SHOW_CALL_LOG),
  showFaqs: flag(process.env.NEXT_PUBLIC_SHOW_FAQS),
} as const

// Hidden-page routes that the middleware should redirect. Keep in one
// place so sidebar + middleware stay in sync.
export const pageFlagByPrefix: Array<{ prefix: string; visible: boolean }> = [
  { prefix: "/reporting", visible: featureFlags.showReporting },
  { prefix: "/call-log", visible: featureFlags.showCallLog },
  { prefix: "/faqs", visible: featureFlags.showFaqs },
]

// Special-case: the dashboard lives at "/" — matching by prefix would match
// everything, so we handle it separately in the middleware with an exact check.
export const dashboardVisible = featureFlags.showDashboard
