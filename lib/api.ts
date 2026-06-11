"use client"

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
type TokenGetter = () => Promise<string | null>
type UnauthorizedHandler = () => Promise<void>

let clerkTokenGetter: TokenGetter | null = null
let unauthorizedHandler: UnauthorizedHandler | null = null

export function __setClerkTokenGetter(getter: TokenGetter) {
  clerkTokenGetter = getter
}

export function __setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler
}

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
  const token = await clerkTokenGetter?.()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("resonata.selected_hotel_id")
      }
      await unauthorizedHandler()
    }
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
  attribution_last_discovered_at: string | null
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

export type NotBookedTaxonomyCategory = {
  name: string
  addressable: boolean
  catch_all: string
  subcategories: string[]
}

export type NotBookedTaxonomyResponse = {
  categories: NotBookedTaxonomyCategory[]
}

export type NotBookedSubcategoryCount = {
  name: string
  count: number
  percentage: number
}

export type NotBookedCategoryBreakdown = {
  category: string
  count: number
  percentage: number
  subcategories: NotBookedSubcategoryCount[]
}

export type NotBookedBreakdownResponse = {
  total_not_booked: number
  prior_period_total: number
  addressable_count: number
  addressable_percentage: number
  lost_revenue_cents_estimate: number | null
  lost_revenue_is_estimate: boolean
  attribution_last_discovered_at: string | null
  categories: NotBookedCategoryBreakdown[]
}

export type NotBookedSeasonalityRow = {
  month: string
  category: string
  count: number
}

export type CallAnalyticsSummary = {
  status: string
  outcome: string | null
  sentiment: string | null
  booking_made: boolean | null
  booking_link_sent: boolean | null
  not_bookable_reason: string | null
  not_booked_reason_category: string | null
  not_booked_reason_subcategory: string | null
  not_booked_reason_version: string | null
}

export type CallListItem = {
  id: string
  provider_call_id: string
  hotel_id: string | null
  summary: string | null
  duration_seconds: number | null
  analytics: CallAnalyticsSummary | null
  // Server-derived: a PMS reservation was attributed to this call's link send.
  booked: boolean
  created_at: string
  updated_at: string
}

export type CallListPage = {
  items: CallListItem[]
  total: number
  limit: number
  offset: number
}

// Server-derived outcome buckets — must match `CallOutcome` in the backend's
// api/router.py (booked > link_sent > not_booked > not_bookable; unfinished
// analytics = pending). "booked" = PMS reservation attributed to the call.
export type CallOutcomeFilter =
  | "booked"
  | "link_sent"
  | "not_booked"
  | "not_bookable"
  | "pending"

export type CallDetail = {
  id: string
  provider_call_id: string
  hotel_id: string | null
  transcript: string | null
  summary: string | null
  duration_seconds: number | null
  created_at: string
  updated_at: string
}

export type CurrentUser = {
  user_id: string
  email: string
  role: string
  is_active: boolean
}

export type PersonaState = {
  content: string
  source: "override" | "disk"
  saved_at: string | null
}

export type PersonaHistoryEntry = {
  content: string
  saved_at: string
}

type CallMetricsBaseParams = {
  hotel_id: string
  min_duration_seconds?: number
}

export function fetchCurrentUser(opts: Pick<Options, "signal"> = {}) {
  return api<CurrentUser>("/api/v1/me", opts)
}

export function fetchPersona(opts: Pick<Options, "signal"> = {}) {
  return api<PersonaState>("/api/v1/admin/persona", opts)
}

export function updatePersona(content: string) {
  return api<PersonaState>("/api/v1/admin/persona", {
    method: "POST",
    body: { content },
  })
}

export function clearPersona() {
  return api<PersonaState>("/api/v1/admin/persona", {
    method: "DELETE",
  })
}

export function fetchPersonaHistory(opts: Pick<Options, "signal"> = {}) {
  return api<PersonaHistoryEntry[]>("/api/v1/admin/persona/history", opts)
}

export function fetchCalls(
  params: {
    hotel_id: string
    limit?: number
    offset?: number
    outcome?: CallOutcomeFilter
    not_booked_reason?: string
    not_booked_subcategory?: string
    date_from?: string
    date_to?: string
  },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallListPage>(withQuery("/api/v1/calls", params), opts)
}

export function fetchCallDetail(callId: string, opts: Pick<Options, "signal"> = {}) {
  return api<CallDetail>(`/api/v1/calls/${callId}`, opts)
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

export function fetchNotBookedTaxonomy(
  params: { hotel_id: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<NotBookedTaxonomyResponse>(
    withQuery("/api/v1/reporting/not-booked/taxonomy", params),
    opts,
  )
}

export function fetchNotBookedBreakdown(
  params: CallMetricsBaseParams & { start_date: string; end_date: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<NotBookedBreakdownResponse>(
    withQuery("/api/v1/reporting/not-booked/breakdown", params),
    opts,
  )
}

export function fetchNotBookedSeasonality(
  params: CallMetricsBaseParams & { start_month: string; end_month: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<NotBookedSeasonalityRow[]>(
    withQuery("/api/v1/reporting/not-booked/seasonality", params),
    opts,
  )
}
