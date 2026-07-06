// Content-Security-Policy for the app, built per-request in proxy.ts with a
// fresh nonce and ENFORCED (validated first via a report-only rollout).
// When adding anything that loads from or talks to a new external domain,
// allowlist it here or the browser will block it — violations POST to
// /csp-report and show in the devtools console.
//
// Runs in the edge runtime, so env vars are frozen at build time (same
// constraint as the feature flags — changing them requires a redeploy).

function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

// The Clerk publishable key encodes the frontend-API domain:
// pk_test_<base64("foo-bar-1.clerk.accounts.dev$")>. Deriving it here means
// the policy tracks the key across dev/prod (including a custom Clerk domain)
// instead of hardcoding a domain that silently goes stale.
function clerkFrontendApiOrigin(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
  const encoded = key.split("_")[2]
  if (!encoded) return null
  try {
    const domain = atob(encoded).replace(/\$$/, "")
    return domain ? `https://${domain}` : null
  } catch {
    return null
  }
}

// auth.protect() redirects signed-out requests to the Clerk Account Portal —
// a *different* domain from the frontend API. Router RSC fetches follow that
// redirect, and CSP checks every hop of a redirect chain against connect-src,
// so the portal must be allowlisted too (this surfaced as a report-only
// violation on sign-out). Dev keys: foo.clerk.accounts.dev → foo.accounts.dev;
// custom prod domain: clerk.example.com → accounts.example.com.
function clerkAccountsPortalOrigin(frontendApiOrigin: string | null): string | null {
  if (!frontendApiOrigin) return null
  const host = new URL(frontendApiOrigin).host
  const portalHost = host.endsWith(".clerk.accounts.dev")
    ? host.replace(".clerk.accounts.dev", ".accounts.dev")
    : host.replace(/^clerk\./, "accounts.")
  return portalHost === host ? null : `https://${portalHost}`
}

export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  const apiOrigin = toOrigin(process.env.NEXT_PUBLIC_API_URL ?? "")
  const clerkOrigin = clerkFrontendApiOrigin()

  // 'strict-dynamic': scripts carrying the nonce may load further scripts
  // (Next.js chunk loading, @clerk/nextjs pulling in clerk-js). The host
  // entries are the fallback for browsers that don't support CSP3.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    clerkOrigin,
    "https://challenges.cloudflare.com", // Clerk bot protection (Turnstile)
  ]
  if (isDev) scriptSrc.push("'unsafe-eval'") // dev-only: Turbopack source maps

  // fetch()/XHR/WebSocket targets: the FastAPI backend, Clerk's frontend API,
  // and Clerk telemetry. Vercel Analytics posts to '/_vercel/insights' on the
  // deployment's own origin, so 'self' covers it.
  const connectSrc = [
    "'self'",
    apiOrigin,
    clerkOrigin,
    clerkAccountsPortalOrigin(clerkOrigin),
    "https://clerk-telemetry.com",
    "https://*.clerk-telemetry.com",
  ]
  if (isDev) connectSrc.push("ws://localhost:*", "wss://localhost:*") // HMR

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.filter(Boolean).join(" ")}`,
    `connect-src ${connectSrc.filter(Boolean).join(" ")}`,
    // Next.js and next/font inject inline <style>; nonce-ing styles isn't
    // worth the churn — inline CSS is a far weaker attack channel than JS.
    "style-src 'self' 'unsafe-inline'",
    // Deliberately permissive: demo-hotel room image_urls are arbitrary
    // operator-supplied hosts, and Clerk avatars come from img.clerk.com.
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:", // Geist is self-hosted by next/font at build time
    "media-src 'self' blob:", // call-recording playback via Blob object URLs
    "worker-src 'self' blob:", // Clerk
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Also set in next.config.mjs, but this header REPLACES that one on
    // middleware-handled routes (they don't stack), so it must live here too.
    "frame-ancestors 'none'",
    // Browsers POST violation reports here (app/csp-report/route.ts) —
    // devtools-console-only signal is too easy to miss during validation.
    "report-uri /csp-report",
  ]
  return directives.join("; ")
}
