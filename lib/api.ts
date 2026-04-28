// Small fetch wrapper that injects the admin token on every request.
// The backend reads it from the `X-Admin-Token` header; token comes from
// `NEXT_PUBLIC_ADMIN_TOKEN` and is visible in the browser — fine for the
// MVP single-operator deployment, not for a public customer rollout.

import { env } from "./env"

export class ApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    message: string,
    public body?: unknown,
  ) {
    super(message)
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  body?: unknown
  // Default true. Turn off for endpoints that don't return JSON (rare).
  parseJson?: boolean
  // Wire through to fetch() so callers can cancel long-running requests
  // (research/scrape, etc). AbortError surfaces as a thrown DOMException;
  // callers should catch and ignore rather than treating as failure.
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  if (!env.apiUrl) {
    throw new ApiError(
      0,
      path,
      "NEXT_PUBLIC_API_URL is not set — UI cannot reach the backend.",
    )
  }
  const url = `${env.apiUrl.replace(/\/$/, "")}${path}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  }
  if (env.adminToken) {
    headers["X-Admin-Token"] = env.adminToken
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (!res.ok) {
    let body: unknown = undefined
    try {
      body = await res.json()
    } catch {
      // non-JSON error body — keep going
    }
    throw new ApiError(res.status, url, `API ${res.status} for ${path}`, body)
  }

  if (opts.parseJson === false) {
    return undefined as T
  }
  return (await res.json()) as T
}
