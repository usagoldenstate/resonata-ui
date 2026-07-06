// Baseline hardening for an admin UI handling guest PII. The full nonce-based
// CSP lives in lib/csp.ts + proxy.ts; frame-ancestors is (redundantly)
// enforced here too because it needs no nonce and applies even to responses
// the middleware doesn't touch.
const securityHeaders = [
  // Block all framing (clickjacking). CSP frame-ancestors is the modern
  // control; X-Frame-Options covers older browsers.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The UI never needs these browser capabilities; deny them outright.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
