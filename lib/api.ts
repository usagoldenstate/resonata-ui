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

type QueryValue = string | number | boolean | null | undefined

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
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

export type CallMetricsSummary = {
  total_calls: number
  calls_booked: number
  conversion_rate: number
  missed_opportunities: number
  bookings_last_updated_at: string | null
}

export type CallMetricsHourlyResponse = {
  coverage_days: number
  hours: Array<{
    hour: number
    calls: number
    avg_calls: number
  }>
}

export type CallMetricsDailyRow = {
  date: string
  calls: number
  booked: number
}

export type CallMetricsMonthlyRow = {
  month: string
  calls: number
  booked: number
}

type CallMetricsBaseParams = {
  hotel_id: string
  min_duration_seconds?: number
}

export function fetchCallMetricsSummary(
  params: CallMetricsBaseParams & { start_date: string; end_date: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallMetricsSummary>(
    withQuery("/api/v1/reporting/call-metrics/summary", params),
    opts,
  )
}

export function fetchCallMetricsHourly(
  params: CallMetricsBaseParams,
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallMetricsHourlyResponse>(
    withQuery("/api/v1/reporting/call-metrics/volume/hourly", params),
    opts,
  )
}

export function fetchCallMetricsDaily(
  params: CallMetricsBaseParams & { start_date: string; end_date: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallMetricsDailyRow[]>(
    withQuery("/api/v1/reporting/call-metrics/volume/daily", params),
    opts,
  )
}

export function fetchCallMetricsMonthly(
  params: CallMetricsBaseParams & { start_month: string; end_month: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallMetricsMonthlyRow[]>(
    withQuery("/api/v1/reporting/call-metrics/volume/monthly", params),
    opts,
  )
}
