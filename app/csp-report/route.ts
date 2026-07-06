import { appendFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

// Sink for CSP violation reports (`report-uri /csp-report` in lib/csp.ts).
// Browsers POST here on their own — no auth, no Clerk session — so the route
// is listed as public in proxy.ts. Reports go to the server log (Vercel logs
// in prod) and, best-effort, to a local file for easy inspection in dev.
export async function POST(req: Request) {
  let body = ""
  try {
    body = (await req.text()).slice(0, 8_192)
  } catch {
    return new Response(null, { status: 204 })
  }
  console.log("[csp-report]", body)
  try {
    await appendFile(join(tmpdir(), "resonata-csp-reports.jsonl"), body + "\n")
  } catch {
    // read-only filesystem (prod) — server log above is the durable copy
  }
  return new Response(null, { status: 204 })
}
