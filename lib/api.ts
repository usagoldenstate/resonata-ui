"use client"

import { env } from "./env"
import type { HotelLines } from "./product-lines"

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

// A string[] is emitted as a repeated key (`?hotel_id=a&hotel_id=b`), which
// is how the backend's multi-hotel scope dependency reads it.
export type QueryValue = string | number | boolean | string[] | null | undefined
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

export function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) {
      // Repeated key, blanks dropped, de-duplicated in order. An empty array
      // emits nothing — the caller decides whether that is an error.
      const seen = new Set<string>()
      for (const item of value) {
        const cleaned = String(item).trim()
        if (cleaned && !seen.has(cleaned)) {
          seen.add(cleaned)
          search.append(key, cleaned)
        }
      }
      continue
    }
    search.set(key, String(value))
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
        window.localStorage.removeItem("resonata.hotel_scope")
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

// Streaming variant of api(): POSTs and returns the raw Response so callers
// can read an SSE body incrementally via res.body.getReader(). Same base URL,
// auth, ngrok header, and non-2xx -> ApiError semantics as api(). Used by the
// reporting insights chat (lib/reporting-chat.ts) — EventSource can't POST or
// send an Authorization header, hence fetch + reader.
export async function apiStream(
  path: string,
  opts: { body: unknown; signal?: AbortSignal },
): Promise<Response> {
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
    method: "POST",
    headers,
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  })

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("resonata.selected_hotel_id")
        window.localStorage.removeItem("resonata.hotel_scope")
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
  if (!res.body) {
    throw new ApiError(0, url, "Response body is not streamable in this browser.")
  }
  return res
}

export type CallMetricsSummary = {
  total_calls: number
  calls_booked: number
  // Funnel middle stage: calls that sent a booking link (superset of
  // calls_booked, so total_calls >= links_sent >= calls_booked).
  links_sent: number
  // Sum of call durations over the window; powers the Total Call Minutes /
  // Avg Call Duration tiles.
  total_call_seconds: number
  conversion_rate: number
  missed_opportunities: number
  attribution_last_discovered_at: string | null
}

// "projected" today; widen to add "actualized" once realized revenue ships.
export type RevenueBasis = "projected"

export type RevenueTrendRow = {
  date: string
  revenue_cents: number
  booking_count: number
}

export type RevenueSummary = {
  basis: RevenueBasis
  is_estimate: boolean
  currency: string
  total_revenue_cents: number
  booking_count: number
  // Bookings counted but withheld from total_revenue_cents (foreign currency or
  // no projected price yet). booking_count - excluded_from_total feeds the money.
  excluded_from_total: number
  room_nights: number
  avg_booking_value_cents: number | null
  // ADR computed server-side over night-bearing bookings only; null when
  // room_nights is 0. Don't derive ADR as total_revenue_cents / room_nights —
  // rows with revenue but no stay dates would overstate it.
  adr_cents: number | null
  attribution_last_discovered_at: string | null
  // "day" for windows up to 183 days; "month" (date = first of month) beyond
  // that, including all time, so the trend chart stays readable.
  trend_bucket: "day" | "month"
  trend: RevenueTrendRow[]
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

export type FaqCategoryCount = {
  category: string
  count: number
  percentage: number
}

export type FaqVariant = {
  question: string | null // verbatim phrasing; null when redacted for privacy
  count: number
}

export type FaqQuestion = {
  question: string
  category: string
  count: number
  // Semantic grouping: null group_id means the row came from the lexical
  // fallback path (call not yet processed by the FAQ grouper).
  group_id: string | null
  variants: FaqVariant[]
}

export type FaqCoverageGap = {
  label: string
  count: number
}

export type FaqResponse = {
  total_questions: number
  unique_questions: number
  calls_with_questions: number
  prior_period_total: number
  categories: FaqCategoryCount[]
  questions: FaqQuestion[]
  coverage_gaps: FaqCoverageGap[]
}

export type FaqOccurrence = {
  question: string | null // verbatim phrasing; null when redacted for privacy
  asked_at: string // ISO datetime (UTC)
  provider_call_id: string | null // the id the Call Log page filters on
}

// One page of individual mentions behind a FAQ phrasing, newest first.
export type FaqOccurrencesResponse = {
  total: number // matching occurrences across all pages
  occurrences: FaqOccurrence[]
}

export type CallAnalyticsSummary = {
  status: string
  assessment: string | null
  sentiment: string | null
  booking_made: boolean | null
  not_bookable_reason: string | null
  not_booked_reason_category: string | null
  not_booked_reason_subcategory: string | null
  not_booked_reason_version: string | null
}

export type CallListItem = {
  outcome: CallOutcomeFilter
  id: string
  provider_call_id: string
  hotel_id: string | null
  // Which inbound line the call arrived on. "sales" = the hotel's sales
  // department's no-answer forward, answered by the sales intake assistant
  // (no booking; a SalesInquiry is recorded instead). Mirrors CallRecord.line.
  line: CallLine
  summary: string | null
  duration_seconds: number | null
  // Plaintext caller ID (E.164); null for blocked/withheld callers or erased rows.
  caller_phone_e164: string | null
  analytics: CallAnalyticsSummary | null
  // Server-derived: a PMS reservation was attributed to this call's link send.
  booked: boolean
  // Orthogonal to `outcome`: the call ended forwarded to a human. The
  // department name is a write-time snapshot; null when the destination
  // matched no configured department (the row still reads as transferred).
  transferred: boolean
  transfer_department_name: string | null
  // Orthogonal to `outcome` and `transferred`: "cancelled" when a
  // reservation was cancelled on the call, "attempted" for any other
  // cancellation activity, null for none. `cancellation_needs_verification`
  // is its own flag — a call can cancel one reservation and leave another's
  // outcome unknown.
  cancellation_outcome: CancellationOutcome | null
  cancellation_status: CancellationStatus | null
  cancellation_needs_verification: boolean
  // Set only when a `q` search matched the transcript: the excerpt around
  // the first spoken match. null for id/summary-only matches (speaker is
  // null when the match precedes any speaker label).
  match_snippet: CallSearchSnippet | null
  created_at: string
  updated_at: string
}

export type CallSearchSnippet = { speaker: "guest" | "agent" | null; text: string }

export type CallListPage = {
  items: CallListItem[]
  // With a search active the backend stops counting at a cap; `total_capped`
  // then means `total` is a lower bound ("1,000+") and more pages may exist.
  total: number
  total_capped: boolean
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

export type CallLine = "reservations" | "sales"

// A call's cancellation activity, derived at end of call from the cancellation
// tools' results. Mirrors the backend's CancellationOutcome/CancellationStatus
// (schemas/call_records.py).
export type CancellationOutcome = "cancelled" | "attempted"
export type CancellationStatus =
  | "started"
  | "not_found"
  | "failed"
  | "needs_staff"
  | "eligible_not_completed"
  | "already_cancelled"
  | "outcome_unknown"
  | "cancelled"

// Call-log filter: `any` is either group; `needs_verification` is the
// independent unknown-outcome flag.
export type CancellationFilter = "cancelled" | "attempted" | "needs_verification" | "any"

// One reservation the call's cancellation flow touched. Mirrors
// CancellationAttemptSummary. `reason` is the tool's code, e.g.
// "active_cancellation_penalty" (needs_staff) or "tool_failure" /
// "no_result" / "outcome_unknown" (outcome_unknown).
export type CancellationAttempt = {
  confirmation_number: string | null
  status: CancellationStatus
  reason: string | null
  lookups: number
  cancellation_number: string | null
  check_in: string | null
  check_out: string | null
}

// The structured intake a sales-line call produced — one per call, written
// mid-call by the submit_sales_inquiry tool. Mirrors the backend's
// SalesInquirySummary. `email_status` is the delivery to the hotel's sales
// mailbox: "failed" means the last send attempt did not go out and the
// reconcile job will retry; "gave_up" means it exhausted its retries — the
// row exists, a person has to forward it.
export type SalesInquiry = {
  id: string
  caller_name: string | null
  // Strictly the number the caller asked for, or null when they gave none or
  // it couldn't be parsed. The caller id is always alongside so sales has a
  // second number to try; the two often match.
  callback_phone_e164: string | null
  caller_id_phone_e164: string | null
  email: string | null
  event_type: string
  event_dates_text: string | null
  event_start_date: string | null
  event_end_date: string | null
  dates_flexible: boolean | null
  // Party size: the caller's words plus the parsed low/high pair. A single
  // figure is stored in both bounds, so a range is simply min !== max.
  headcount_text: string | null
  headcount_min: number | null
  headcount_max: number | null
  needs_guest_rooms: boolean | null
  // The caller's own words plus the post-call AI-estimated total-event range.
  // Money crosses the wire as decimal strings.
  budget_text: string | null
  estimated_budget_min: string | null
  estimated_budget_max: string | null
  budget_estimation_status: "pending" | "complete" | "failed"
  budget_estimated_at: string | null
  budget_estimation_model: string | null
  budget_estimation_prompt_version: string | null
  notes: string | null
  sent_to: string | null
  email_status: "sending" | "sent" | "failed" | "gave_up"
  email_error_class: string | null
  sent_at: string | null
  created_at: string
}

// Aggregate counts behind the call-log stat tiles. Outcome buckets sum to
// total_calls; `transferred` is orthogonal. Mirrors CallStats in the backend's
// schemas/call_records.py.
export type CallStats = {
  total_calls: number
  booked: number
  link_sent: number
  not_booked: number
  not_bookable: number
  pending: number
  transferred: number
  // Orthogonal cancellation counts; needs_verification overlaps both groups.
  cancelled: number
  cancellation_attempted: number
  cancellation_needs_verification: number
  // Mean over calls with a recorded duration; null when there are none.
  avg_duration_seconds: number | null
}

// A link the agent sent the caller during the call — a booking-engine deep
// link or a PMS card-hold pay link. Mirrors SentLinkSummary in the backend's
// schemas/call_records.py. `delivery_status` is the ledger's raw status
// ("sent" = the email/SMS provider accepted it).
export type SentLink = {
  kind: "booking_link" | "payment_link"
  url: string
  channel: "email" | "sms"
  recipient: string | null
  delivery_status: string
  sent_at: string | null
  created_at: string
}

export type CallDetail = {
  id: string
  provider_call_id: string
  hotel_id: string | null
  line: CallLine
  transcript: string | null
  summary: string | null
  duration_seconds: number | null
  // Plaintext caller ID (E.164); null for blocked/withheld callers or erased rows.
  caller_phone_e164: string | null
  // Server-derived: a playable Twilio recording is attached. The raw sid is never
  // exposed; audio is fetched by call_id through the authed proxy below.
  has_recording: boolean
  // Sales-line calls only; null on reservations calls and on sales calls that
  // ended before the inquiry was submitted.
  sales_inquiry: SalesInquiry | null
  // Every link sent to the caller on this call, oldest first.
  sent_links: SentLink[]
  // Orthogonal to `outcome`: the call ended forwarded to a human.
  transferred: boolean
  transfer_department_name: string | null
  // Cancellation outcome (see CallListItem) plus one entry per reservation.
  // `cancellation_extraction_failed` = the call's history couldn't be read,
  // so a null outcome then says nothing about whether a cancellation happened.
  cancellation_outcome: CancellationOutcome | null
  cancellation_status: CancellationStatus | null
  cancellation_needs_verification: boolean
  cancellation_extraction_failed: boolean
  cancellation_attempts: CancellationAttempt[]
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

// Inclusive hotel-local date window for the summary/breakdown endpoints. Omit
// both (or pass "" — withQuery drops it) for all time; the backend rejects a
// window with only one end.
type DateWindowParams = {
  start_date?: string
  end_date?: string
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

// ── Booking engine (dev pages) ──────────────────────────────────────────────

export type P3CheckoutUrlStyle = "rates_rooms_inline" | "trailing_rate_room"

export type P3Config = {
  base_url: string
  p3_hotel_id: string
  checkout_url_style: P3CheckoutUrlStyle
  default_child_bucket: number
  room_type_mappings: Record<string, string>
  rate_mappings: Record<string, string>
  addon_mappings: Record<string, string>
}

export type SynxisConfig = {
  base_url: string
  chain_id: string
  synxis_hotel_id: string
  currency: string
  locale: string
  // PMS id → Synxis code. Empty = passthrough of the PMS business codes;
  // non-empty = allowlist (unmapped ids omit the URL param — search-page link).
  room_type_mappings: Record<string, string>
  rate_mappings: Record<string, string>
}

// The shape of `config` depends on `booking_engine_provider`; each provider's
// editor narrows it.
export type BookingEngineConfig = P3Config | SynxisConfig

export type BookingEngineState = {
  hotel_id: string
  booking_engine_provider: string | null
  registered_providers: string[]
  is_active: boolean
  configurable: boolean
  config: Record<string, unknown> | null
  config_valid: boolean
  config_error: string | null
}

export type PmsCatalogRoomType = {
  room_type_id: string
  room_name: string
  // PMS business short code (e.g. StayNTouch `SK`); null when the PMS has none.
  room_code: string | null
}

export type PmsCatalogRate = {
  rate_id: string
  rate_name: string | null
  rate_code: string | null
}

export type BookingEnginePmsCatalog = {
  hotel_id: string
  pms_provider: string
  room_types: PmsCatalogRoomType[]
  rates: PmsCatalogRate[]
  rates_source: "availability_sample"
  sample_check_in: string | null
  sample_check_out: string | null
  rates_error: string | null
}

export type BookingEnginePreviewRequest = {
  config: Record<string, unknown>
  check_in: string
  check_out: string
  adults: number
  children: number
  // Synxis only — P3 is single-room.
  rooms?: number
  room_type_id: string
  // Required by P3, ignored by Synxis.
  rate_id?: string
  addon_selections?: Array<{ addon_id: string; quantity: number }>
}

export function fetchBookingEngineState(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<BookingEngineState>(
    `/api/v1/admin/hotels/${hotelId}/booking-engine`,
    opts,
  )
}

export function fetchBookingEnginePmsCatalog(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<BookingEnginePmsCatalog>(
    `/api/v1/admin/hotels/${hotelId}/booking-engine/pms-catalog`,
    opts,
  )
}

export function updateBookingEngineConfig(
  hotelId: string,
  config: BookingEngineConfig,
) {
  return api<BookingEngineState>(`/api/v1/admin/hotels/${hotelId}/booking-engine`, {
    method: "PUT",
    body: config,
  })
}

export function previewBookingEngineLink(
  hotelId: string,
  body: BookingEnginePreviewRequest,
) {
  return api<{ url: string }>(
    `/api/v1/admin/hotels/${hotelId}/booking-engine/preview-link`,
    { method: "POST", body },
  )
}

// ── User hotel access (dev pages) ───────────────────────────────────────────

export type AdminHotelListItem = {
  hotel_id: string
  display_name: string
  pms_provider: string
  is_active: boolean
  // The organization (management company) the hotel belongs to, if any.
  organization_id: string | null
}

// ── Organizations (management companies / portfolios) ───────────────────────
// A named group of hotels. Membership is set from the hotel side
// (platform settings → Organization); users are granted the org as a unit and
// see every hotel in it at request time — nothing is copied per hotel.
export type Organization = {
  organization_id: string
  display_name: string
  hotel_count: number
  created_at: string
}

export function fetchOrganizations(opts: Pick<Options, "signal"> = {}) {
  return api<Organization[]>("/api/v1/admin/organizations", opts)
}

export function createOrganization(body: { organization_id: string; display_name: string }) {
  return api<Organization>("/api/v1/admin/organizations", { method: "POST", body })
}

export function renameOrganization(organizationId: string, display_name: string) {
  return api<Organization>(`/api/v1/admin/organizations/${encodeURIComponent(organizationId)}`, {
    method: "PATCH",
    body: { display_name },
  })
}

export type UserGrantedHotel = {
  hotel_id: string
  display_name: string
  granted_at: string
}

export type UserGrantedOrganization = {
  organization_id: string
  display_name: string
  granted_at: string
}

export type UserAccessItem = {
  user_id: string
  auth_subject: string
  email: string
  role: string
  is_active: boolean
  // Direct per-hotel grants only; org grants are listed separately and are
  // never expanded into this list.
  hotels: UserGrantedHotel[]
  organizations: UserGrantedOrganization[]
}

export function fetchAdminHotels(opts: Pick<Options, "signal"> = {}) {
  return api<AdminHotelListItem[]>("/api/v1/admin/hotels", opts)
}

// ── Hotel detail + settings (Settings page) ─────────────────────────────────

// Full per-hotel row returned by GET /admin/hotels/{id}. The Settings page
// reads this to populate every backed field; mirrors the backend `HotelDetail`
// schema (only the fields the UI touches are typed here).
export type HotelDetail = {
  hotel_id: string
  display_name: string
  timezone: string
  // Organization membership. Platform-admin only; null = independent hotel.
  organization_id: string | null
  pms_provider: string
  booking_engine_provider: string | null
  agent_name: string | null
  first_message: string | null
  email_from: string | null
  preferred_rate_code: string | null
  commission_rate_basis_points: number
  currency: string
  max_call_minutes: number | null
  // E.164 inbound DID callers dial to reach this hotel. Platform-admin only.
  inbound_phone_number: string | null
  // Vapi phoneNumberId (UUID) this hotel's calls arrive on. When set, the
  // backend rejects Vapi webhooks whose payload carries a different id
  // (tenant-binding guard). Platform-admin only; null disables the check.
  vapi_phone_number_id: string | null
  // Twilio sender (E.164) for outbound guest SMS. Its presence is what turns
  // on the text-or-email choice for booking-link delivery; null = email only.
  // Platform-admin only.
  twilio_from_number: string | null
  // Sales intake line — the hotel's second Vapi number (the sales department's
  // no-answer forward). Platform-admin only. Enabling requires the email.
  sales_line_enabled: boolean
  sales_vapi_phone_number_id: string | null
  sales_inquiry_email: string | null
  // The hotel's sales team as plain name tags — who follow-up activity is
  // attributed to. Operator-editable, unlike the sales-line fields above.
  sales_rep_names: string[]
  // The sales line's own opener (null = the template) and the template
  // rendered for this hotel. Operator-editable via Agent Configuration.
  sales_first_message: string | null
  sales_first_message_default?: string
  // Which products the hotel bought. Platform-admin only.
  lines?: HotelLines
  pms_webhook_last_received_at: string | null
  is_active: boolean
  // Which completion path the hotel uses. Platform-admin only.
  reservation_flow?: ReservationFlow
  // Provider-specific booking-engine parameterisation (Synxis/P3 shapes).
  booking_engine_config?: Record<string, unknown> | null
  // Non-secret per-hotel PMS behaviour settings (never credentials).
  pms_config?: Record<string, unknown> | null
  // Returned inline so the agent-config editor hydrates in one round-trip.
  transfer_departments?: TransferDepartmentRow[]
}

export type ReservationFlow = "booking_engine_link" | "pms_payment_link"

// Read shape of one transfer destination (returned inline on HotelDetail and
// from GET /transfer-departments).
export type TransferDepartmentRow = {
  department_id: string
  name: string
  phone_number: string
  routing_rules: string
  position: number
  is_default: boolean
  sales_line_transfer: boolean
}

// Write shape — the bulk PUT replaces the whole list; the server assigns
// `position` from the array order.
export type TransferDepartmentInput = {
  name: string
  phone_number: string
  routing_rules: string
  is_default: boolean
  sales_line_transfer: boolean
}

export function fetchTransferDepartments(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<TransferDepartmentRow[]>(
    `/api/v1/admin/hotels/${hotelId}/transfer-departments`,
    opts,
  )
}

export function replaceTransferDepartments(
  hotelId: string,
  departments: TransferDepartmentInput[],
) {
  return api<TransferDepartmentRow[]>(
    `/api/v1/admin/hotels/${hotelId}/transfer-departments`,
    { method: "PUT", body: { departments } },
  )
}

// ── Hotel creation (the setup wizard's first step) ──────────────────────────
// Mirrors the backend `HotelCreate`. The wizard always creates INACTIVE and
// activates from the review step once every blocking step is done.
export type HotelCreateBody = {
  hotel_id: string
  display_name: string
  timezone: string
  currency: string
  agent_name?: string | null
  first_message?: string | null
  sales_first_message?: string | null
  pms_provider: string
  booking_engine_provider?: string | null
  booking_engine_config?: Record<string, unknown> | null
  email_from?: string | null
  preferred_rate_code?: string | null
  max_call_minutes?: number | null
  commission_rate_basis_points: number
  is_active: boolean
  // At least one destination is required at creation time — the voice agent
  // must always have somewhere to transfer a caller it can't help.
  departments: TransferDepartmentInput[]
}

export function createHotel(body: HotelCreateBody) {
  return api<HotelDetail>("/api/v1/admin/hotels", { method: "POST", body })
}

// ── PMS credentials (setup wizard) ──────────────────────────────────────────
// The backend never returns stored values — only which field names are set.
export type PmsCredentialsState = {
  hotel_id: string
  pms_provider: string
  configured: boolean
  fields_set: string[]
}

export type PmsCredentialsTestResult = {
  ok: boolean
  message: string
  checked_at: string
}

export function fetchPmsCredentials(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<PmsCredentialsState>(
    `/api/v1/admin/hotels/${hotelId}/pms-credentials`,
    opts,
  )
}

// FULL replace — send every field the provider needs, not a patch.
export function updatePmsCredentials(
  hotelId: string,
  credentials: Record<string, unknown>,
) {
  return api<PmsCredentialsState>(
    `/api/v1/admin/hotels/${hotelId}/pms-credentials`,
    { method: "PUT", body: { credentials } },
  )
}

export function testPmsCredentials(hotelId: string) {
  return api<PmsCredentialsTestResult>(
    `/api/v1/admin/hotels/${hotelId}/pms-credentials/test`,
    { method: "POST" },
  )
}

// ── Setup status (setup wizard) ─────────────────────────────────────────────
// Server-computed per-step completion. The wizard is resumable because every
// step persists through an ordinary endpoint and this is the read-back.
export type SetupStepKey =
  | "identity"
  | "lines"
  | "pms"
  | "catalog"
  | "reservation_flow"
  | "delivery"
  | "sales"
  | "persona"
  | "knowledge"
  | "telephony"
  | "access"

export type SetupStepStatus = "done" | "skipped" | "incomplete" | "not_applicable"

export type SetupStep = {
  key: SetupStepKey
  status: SetupStepStatus
  // Blocking steps must be done (or skipped, where the backend allows it)
  // before the hotel can be activated.
  blocking: boolean
  detail: string | null
}

// Work that happens outside this app (Vapi dashboard, StayNTouch portal, …).
export type SetupExternalTask = {
  key: string
  title: string
  detail: string
  url_hint: string | null
}

// The TEMPLATE opening each line speaks while its own column is empty,
// rendered server-side from the hotel's current display_name + agent_name.
// `reservations` backs `Hotel.first_message`, `sales` backs
// `Hotel.sales_first_message`; both columns are editable per hotel, so these
// are for prefill only. Optional until the backend change lands.
export type FirstMessageDefaults = {
  reservations: string
  sales: string
}

export type SetupStatus = {
  hotel_id: string
  is_active: boolean
  setup_progress: Record<string, string>
  steps: SetupStep[]
  external_tasks: SetupExternalTask[]
  can_activate: boolean
  blockers: string[]
  first_message_defaults?: FirstMessageDefaults
}

// Which inbound lines the hotel runs — `hotels.lines`. Chosen on the identity
// step (it decides which later steps apply); the setup-progress PATCH writes it.
export type LinesMode = HotelLines

export function fetchHotelSetup(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<SetupStatus>(`/api/v1/admin/hotels/${hotelId}/setup`, opts)
}

export function patchSetupProgress(
  hotelId: string,
  body: { step?: SetupStepKey; status?: "done" | "skipped"; lines_mode?: LinesMode },
) {
  return api<SetupStatus>(`/api/v1/admin/hotels/${hotelId}/setup-progress`, {
    method: "PATCH",
    body,
  })
}

// ── Knowledge base (wizard's research step) ─────────────────────────────────
export type HotelKnowledgeEntry = {
  topic: string
  content: string
  // The editor's own section object, round-tripped verbatim (see
  // lib/knowledge-serialize.ts). Opaque to this layer.
  structured_content: unknown
  sort_order: number
}

export function fetchHotelKnowledge(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<HotelKnowledgeEntry[]>(
    `/api/v1/admin/hotels/${hotelId}/knowledge`,
    opts,
  )
}

export function replaceHotelKnowledge(
  hotelId: string,
  entries: HotelKnowledgeEntry[],
) {
  return api<HotelKnowledgeEntry[]>(`/api/v1/admin/hotels/${hotelId}/knowledge`, {
    method: "PUT",
    body: { entries },
  })
}

// ── Room types (wizard's catalog step) ──────────────────────────────────────
export type HotelRoomTypeRow = {
  room_type_id: string
  room_name: string
  cached_description: string | null
  operator_description: string | null
  image_url: string | null
  max_occupancy: number
}

export type HotelRoomTypeList = {
  hotel_id: string
  pms_provider: string
  supported: boolean
  message: string | null
  rooms: HotelRoomTypeRow[]
}

export function fetchHotelRoomTypes(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<HotelRoomTypeList>(`/api/v1/admin/hotels/${hotelId}/room-types`, opts)
}

// ── Vapi webhook secret (wizard's telephony step) ───────────────────────────
// Plaintext comes back exactly once; only its SHA-256 hash is stored. Calls
// 401 between the rotate and pasting it into the Vapi dashboard.
export function rotateVapiWebhookSecret(hotelId: string) {
  return api<{ vapi_webhook_secret: string }>(
    `/api/v1/admin/hotels/${hotelId}/vapi-webhook-secret/rotate`,
    { method: "POST" },
  )
}

// Operator-safe partial update (PUT /admin/hotels/{id}). Only send changed keys.
export type HotelOperatorUpdate = {
  display_name?: string
  timezone?: string
  agent_name?: string | null
  first_message?: string | null
  preferred_rate_code?: string | null
  max_call_minutes?: number | null
  // Full RFC 5322 sender ("Name <addr@domain>" or bare address). The settings
  // page composes this from the Sender Name + Email Address fields. Operator-
  // editable on the backend (PUT), not a platform-settings field.
  email_from?: string | null
  // Replaces the whole list. Normalized server-side (trimmed, blanks dropped,
  // case-insensitively de-duplicated, max 50).
  sales_rep_names?: string[]
  // Blank clears back to the shared template.
  sales_first_message?: string | null
}

// Platform-admin-only partial update (PATCH /admin/hotels/{id}/platform-settings).
export type HotelPlatformUpdate = {
  // An existing organization id, or null/"" to make the hotel independent.
  organization_id?: string | null
  inbound_phone_number?: string | null
  vapi_phone_number_id?: string | null
  twilio_from_number?: string | null
  sales_line_enabled?: boolean
  sales_vapi_phone_number_id?: string | null
  sales_inquiry_email?: string | null
  // Validated with the sales-line fields: the line can only be on for
  // "sales" | "both", so the two travel in one PATCH on launch day.
  lines?: HotelLines
  booking_engine_provider?: string | null
  booking_engine_config?: Record<string, unknown> | null
  // The PMS connector. Accepted ONLY while the hotel is inactive — a live
  // hotel's holds and attribution reference reservations inside its current
  // PMS, so the backend 422s a change. Switching discards the stored
  // credentials and the hotel's cached PMS catalog.
  pms_provider?: string
  // Non-secret PMS behaviour settings (e.g. reservation_source_code).
  pms_config?: Record<string, unknown> | null
  reservation_flow?: ReservationFlow
  is_active?: boolean
  commission_rate_basis_points?: number
}

// Base URL of the FastAPI backend, used to render the exact webhook URLs an
// operator pastes into Vapi / StayNTouch. Empty when unconfigured.
export function apiBaseUrl(): string {
  return env.apiUrl.replace(/\/$/, "")
}

export function fetchHotelDetail(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<HotelDetail>(`/api/v1/admin/hotels/${hotelId}`, opts)
}

export function updateHotelOperatorSettings(
  hotelId: string,
  body: HotelOperatorUpdate,
) {
  return api<HotelDetail>(`/api/v1/admin/hotels/${hotelId}`, {
    method: "PUT",
    body,
  })
}

export function updateHotelPlatformSettings(
  hotelId: string,
  body: HotelPlatformUpdate,
) {
  return api<HotelDetail>(`/api/v1/admin/hotels/${hotelId}/platform-settings`, {
    method: "PATCH",
    body,
  })
}

export type OperaCancellationCatalogItem = {
  code: string
  description: string | null
  group_code: string | null
  inactive: boolean
}

export type OperaCancellationConfig = {
  reason_code: string
  allowed_source_codes: Record<string, string>
  allowed_guarantee_codes: string[]
  catalog_verified_at: string
}

export type OperaCancellationSetup = {
  saved: OperaCancellationConfig | null
  ready: boolean
  validation_errors: string[]
  catalogs: {
    reasons: OperaCancellationCatalogItem[]
    sources: OperaCancellationCatalogItem[]
    guarantees: OperaCancellationCatalogItem[]
  }
}

export type OperaCancellationSetupUpdate = {
  reason_code: string
  allowed_source_codes: string[]
  allowed_guarantee_codes: string[]
}

export function fetchOperaCancellationSetup(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<OperaCancellationSetup>(
    `/api/v1/admin/hotels/${hotelId}/opera-cancellation/setup`,
    opts,
  )
}

export function saveOperaCancellationSetup(
  hotelId: string,
  body: OperaCancellationSetupUpdate,
) {
  return api<OperaCancellationSetup>(
    `/api/v1/admin/hotels/${hotelId}/opera-cancellation/setup`,
    { method: "PUT", body },
  )
}

export function disableOperaCancellation(hotelId: string) {
  return api<{ status: "disabled"; hotel_id: string }>(
    `/api/v1/admin/hotels/${hotelId}/opera-cancellation/setup`,
    { method: "DELETE" },
  )
}

export type StaynTouchCancellationCatalogItem = {
  id: number
  label: string
  description: string | null
  active: boolean
}

export type StaynTouchCancellationConfig = {
  allowed_origins: { id: number; name: string }[]
  allowed_sources: { id: number; code: string }[]
  catalog_verified_at: string
}

export type StaynTouchCancellationSetup = {
  saved: StaynTouchCancellationConfig | null
  ready: boolean
  validation_errors: string[]
  catalogs: {
    origins: StaynTouchCancellationCatalogItem[]
    sources: StaynTouchCancellationCatalogItem[]
  }
}

export type StaynTouchCancellationSetupUpdate = {
  allowed_origin_ids: number[]
  allowed_source_ids: number[]
}

export function fetchStaynTouchCancellationSetup(
  hotelId: string,
  opts: Pick<Options, "signal"> = {},
) {
  return api<StaynTouchCancellationSetup>(
    `/api/v1/admin/hotels/${hotelId}/stayntouch-cancellation/setup`,
    opts,
  )
}

export function saveStaynTouchCancellationSetup(
  hotelId: string,
  body: StaynTouchCancellationSetupUpdate,
) {
  return api<StaynTouchCancellationSetup>(
    `/api/v1/admin/hotels/${hotelId}/stayntouch-cancellation/setup`,
    { method: "PUT", body },
  )
}

export function disableStaynTouchCancellation(hotelId: string) {
  return api<{ status: "disabled"; hotel_id: string }>(
    `/api/v1/admin/hotels/${hotelId}/stayntouch-cancellation/setup`,
    { method: "DELETE" },
  )
}

export function fetchAdminUsers(opts: Pick<Options, "signal"> = {}) {
  return api<UserAccessItem[]>("/api/v1/admin/users", opts)
}

export function grantUserHotelAccess(body: {
  auth_subject: string
  email: string
  hotel_id: string
}) {
  return api<UserAccessItem>("/api/v1/admin/users/grants", {
    method: "POST",
    body,
  })
}

export function updateUserRole(userId: string, role: "operator" | "platform_admin") {
  return api<UserAccessItem>(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  })
}

export function revokeUserHotelAccess(userId: string, hotelId: string) {
  return api<UserAccessItem>(`/api/v1/admin/users/${userId}/grants/${hotelId}`, {
    method: "DELETE",
  })
}

export function grantUserOrganizationAccess(body: {
  auth_subject: string
  email: string
  organization_id: string
}) {
  return api<UserAccessItem>("/api/v1/admin/users/org-grants", {
    method: "POST",
    body,
  })
}

export function revokeUserOrganizationAccess(userId: string, organizationId: string) {
  return api<UserAccessItem>(
    `/api/v1/admin/users/${userId}/org-grants/${encodeURIComponent(organizationId)}`,
    { method: "DELETE" },
  )
}

export function deleteUser(userId: string) {
  return api<void>(`/api/v1/admin/users/${userId}`, {
    method: "DELETE",
    parseJson: false,
  })
}

// ── User invitations (Clerk-emailed sign-up flow) ───────────────────────────

export type UserInvitationResult = {
  invitation_id: string
  email: string
  status: string
  role: "operator" | "platform_admin"
  hotel_ids: string[]
  organization_ids: string[]
}

export type PendingInvitation = {
  invitation_id: string
  email: string
  status: string
  created_at: string | null
  role: "operator" | "platform_admin" | null
  hotel_ids: string[]
  organization_ids: string[]
}

// Invite a new user by email. Clerk emails them a sign-up link; the role +
// hotel / organization access are applied automatically when they finish
// signing up.
export function inviteUser(body: {
  email: string
  role: "operator" | "platform_admin"
  hotel_ids: string[]
  organization_ids: string[]
}) {
  return api<UserInvitationResult>("/api/v1/admin/users/invitations", {
    method: "POST",
    body,
  })
}

export function fetchPendingInvitations(opts: Pick<Options, "signal"> = {}) {
  return api<PendingInvitation[]>("/api/v1/admin/users/invitations", opts)
}

export function revokeInvitation(invitationId: string) {
  return api<void>(`/api/v1/admin/users/invitations/${invitationId}`, {
    method: "DELETE",
    parseJson: false,
  })
}

// `hotel_id` may be several hotels (the portfolio view): the backend spans
// them all, and a calendar date means that local date at EACH hotel.
export function fetchCalls(
  params: {
    hotel_id: string | string[]
    limit?: number
    offset?: number
    outcome?: CallOutcomeFilter
    not_booked_reason?: string
    not_booked_subcategory?: string
    date_from?: string
    date_to?: string
    // One box: a call id fragment, or words said on the call (transcript or
    // summary, case-insensitive substring; under 3 characters matches ids only).
    q?: string
    line?: CallLine
    // Narrows within whatever outcome filter is set (a transferred call keeps
    // its own outcome bucket); omit for both.
    transferred?: boolean
    // Likewise narrows within the outcome / transfer filters.
    cancellation?: CancellationFilter
  },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallListPage>(withQuery("/api/v1/calls", params), opts)
}

// Honors hotel + date range only: the backend ignores outcome / transfer /
// cancellation / reason filters so a rate never collapses to 100% when its bucket is selected.
export function fetchCallStats(
  params: {
    hotel_id: string | string[]
    date_from?: string
    date_to?: string
    // Omitted = the reservations line only (the backend default: sales calls
    // carry no outcome verdict and would inflate the pending tile).
    line?: CallLine
  },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallStats>(withQuery("/api/v1/calls/stats", params), opts)
}

export function fetchCallDetail(callId: string, opts: Pick<Options, "signal"> = {}) {
  return api<CallDetail>(`/api/v1/calls/${callId}`, opts)
}

// Platform-admin only: hard-deletes the call and everything hanging off it
// (analytics, FAQ occurrences, identifiers, surveys, Vapi recording).
export function deleteCall(callId: string) {
  return api<void>(`/api/v1/calls/${callId}`, {
    method: "DELETE",
    parseJson: false,
  })
}

// The generic api() helper always parses JSON, so recording audio needs its own
// path: same auth headers, but it returns the raw audio/mpeg body as a Blob for
// <audio> playback (the browser can't send the Clerk bearer on an <audio src>).
export async function fetchCallRecording(
  callId: string,
  opts: Pick<Options, "signal"> = {},
): Promise<Blob> {
  const path = `/api/v1/calls/${callId}/recording`
  if (!env.apiUrl) {
    throw new ApiError(0, path, "NEXT_PUBLIC_API_URL is not set — UI cannot reach the backend.")
  }
  const url = `${env.apiUrl.replace(/\/$/, "")}${path}`
  const headers: Record<string, string> = { "ngrok-skip-browser-warning": "true" }
  const token = await clerkTokenGetter?.()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(url, { headers, signal: opts.signal })
  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler) {
      await unauthorizedHandler()
    }
    throw new ApiError(res.status, url, `API ${res.status} for ${path}`)
  }
  return res.blob()
}

export function fetchCallMetricsSummary(
  params: CallMetricsBaseParams & DateWindowParams,
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallMetricsSummary>(
    withQuery("/api/v1/reporting/call-metrics/summary", params),
    opts,
  )
}

export function fetchRevenueSummary(
  params: { hotel_id: string; basis?: RevenueBasis } & DateWindowParams,
  opts: Pick<Options, "signal"> = {},
) {
  return api<RevenueSummary>(
    withQuery("/api/v1/reporting/revenue/summary", params),
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

// Static vocabulary — not hotel-scoped, so the call log can ask for it in the
// portfolio view too.
export function fetchNotBookedTaxonomy(opts: Pick<Options, "signal"> = {}) {
  return api<NotBookedTaxonomyResponse>("/api/v1/reporting/not-booked/taxonomy", opts)
}

export function fetchNotBookedBreakdown(
  params: CallMetricsBaseParams & DateWindowParams,
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

export function fetchFaqs(
  params: CallMetricsBaseParams & DateWindowParams,
  opts: Pick<Options, "signal"> = {},
) {
  return api<FaqResponse>(withQuery("/api/v1/reporting/faqs", params), opts)
}

export function fetchFaqOccurrences(
  params: CallMetricsBaseParams & DateWindowParams & {
    group_id: string
    variant?: string
    limit?: number
    offset?: number
  },
  opts: Pick<Options, "signal"> = {},
) {
  return api<FaqOccurrencesResponse>(
    withQuery("/api/v1/reporting/faqs/occurrences", params),
    opts,
  )
}

// ── Demo hotel builder (Demo Hotels page) ───────────────────────────────────
//
// Lets a platform admin spin up (or refresh) a mock-PMS demo hotel from a
// single JSON spec, either hand-filled from a downloadable template or
// drafted by a one-shot LLM web-search auto-fill. See DemoHotelSpec below —
// the backend validates with `extra: "forbid"`, so the UI must never send
// fields outside this shape.

export type DemoHotelBasics = {
  hotel_id: string
  display_name: string
  timezone: string
  currency: string
  agent_name?: string | null
  first_message?: string | null
  email_from?: string | null
}

export type DemoDepartmentInput = {
  name: string
  phone_number: string
  routing_rules: string
  is_default: boolean
}

export type DemoKnowledgeField = {
  // A canonical KB field key (e.g. "cin", "petFee") when the value fits a
  // built-in field, or any other key for overflow data. `label` is only set
  // for overflow fields; canonical keys derive their label from the KB
  // section template (see defaultSections() in the knowledge-base editor).
  key: string
  label?: string | null
  value: string
}

export type DemoKnowledgeSection = {
  // One of the fixed KB section ids (e.g. "overview", "checkin"). The display
  // title comes from the section template, not the spec.
  section_id: string
  fields: DemoKnowledgeField[]
}

export type DemoRoomInput = {
  room_type_id: string
  room_name: string
  description?: string | null
  max_occupancy?: number
  nightly_rate: string
  rate_id?: string
  rate_name?: string
  available_count?: number
  image_url?: string | null
  metadata?: Record<string, string>
}

export type DemoHotelSpec = {
  spec_version: 1
  hotel: DemoHotelBasics
  departments: DemoDepartmentInput[]
  knowledge: DemoKnowledgeSection[]
  rooms: DemoRoomInput[]
}

export type DemoHotelResult = {
  hotel_id: string
  // "validated" only appears when dry_run=true and the spec targets a
  // hotel_id that doesn't already exist; a dry run against an *existing*
  // demo hotel's id still reports "updated" so the review screen can warn
  // before the real (non-dry-run) call overwrites it.
  action: "created" | "updated" | "validated"
  rooms_written: number
  knowledge_entries_written: number
  departments_written: number
  room_mapping_refreshed: boolean
  webhook_url: string
}

export type DemoSpecTemplate = {
  spec_version: 1
  json_schema: object
  example: DemoHotelSpec
  llm_prompt: string
}

export type DemoSpecDraft = {
  spec: DemoHotelSpec
  warnings: string[]
}

export function fetchDemoSpecTemplate(opts: Pick<Options, "signal"> = {}) {
  return api<DemoSpecTemplate>("/api/v1/admin/demo-hotels/template", opts)
}

export function createDemoHotel(
  spec: DemoHotelSpec,
  opts: { dryRun?: boolean; signal?: AbortSignal } = {},
) {
  return api<DemoHotelResult>(
    withQuery("/api/v1/admin/demo-hotels", { dry_run: opts.dryRun ?? false }),
    { method: "POST", body: spec, signal: opts.signal },
  )
}

// Single-pass LLM web-search draft. Slow (roughly 10-90s) — callers should
// show progress and support cancellation via `signal`.
export function autoFillDemoSpec(query: string, signal?: AbortSignal) {
  return api<DemoSpecDraft>("/api/v1/admin/demo-hotels/auto-fill", {
    method: "POST",
    body: { query },
    signal,
  })
}

// Client-side filter — demo hotels are just hotels on the mock PMS adapter;
// there's no separate backend flag for it.
export function filterMockHotels(
  hotels: AdminHotelListItem[],
): AdminHotelListItem[] {
  return hotels.filter((h) => h.pms_provider === "mock")
}

// Shared with the Room Mapping tab's "Refresh from PMS" action
// (components/knowledge-base/room-mapping-tab.tsx calls the same route
// inline) — exported here too so the Demo Hotels wizard's "retry room
// mapping refresh" button doesn't have to duplicate the raw api() call.
export function refreshHotelRoomTypes(hotelId: string) {
  return api<unknown>(`/api/v1/admin/hotels/${hotelId}/room-types/refresh`, {
    method: "POST",
  })
}

// Automatically captured sales inquiries and shared follow-up tracking.
export type SalesFollowUpStatus = "new" | "call_attempted" | "contacted" | "booked" | "closed"
export type SalesInquiryItem = SalesInquiry & {
  // The list may span an organization; detail/patch and the roster used to
  // edit an assignment are keyed by the row's own hotel.
  hotel_id: string
  provider_call_id: string | null
  follow_up_status: SalesFollowUpStatus
  // A name from the hotel's sales-rep roster, not a user account — the
  // notification email goes to a shared mailbox whose readers have no login.
  assigned_rep: string | null
  version: number
  // True once a privacy erasure has pseudonymized the row. It stays listed for
  // its event lineage but is read-only: the PATCH refuses (409).
  erased: boolean
}
// One save is one entry: the outcome line in `text`, the typed note beneath.
export type SalesActivity = {
  id: string
  at: string
  actor: string
  source: "dashboard" | "email_link"
  kind: "status" | "assignment" | "note"
  text: string
  note: string | null
}
export type SalesInquiryDetail = SalesInquiryItem & {
  activity: SalesActivity[]
  // The no-login link the notification email carried, re-derived so it can be
  // handed out again. Null once the inquiry has been erased.
  follow_up_url: string | null
}
export type SalesInquiryPage = { items: SalesInquiryItem[]; total: number; counts: Partial<Record<SalesFollowUpStatus, number>> }
export type SalesInquiryPatch = {
  version: number
  follow_up_status?: SalesFollowUpStatus
  left_voicemail?: boolean
  assigned_rep?: string | null
  note?: string
}
export function fetchSalesInquiries(hotelIds: string | string[], filters: Record<string, QueryValue>) {
  return api<SalesInquiryPage>(withQuery("/api/v1/sales-inquiries", { hotel_id: hotelIds, ...filters }))
}
export function fetchSalesAssignees(hotelId: string) {
  return api<string[]>(withQuery("/api/v1/sales-inquiries/assignees", { hotel_id: hotelId }))
}
export function fetchSalesInquiry(hotelId: string, id: string) {
  return api<SalesInquiryDetail>(withQuery(`/api/v1/sales-inquiries/${encodeURIComponent(id)}`, { hotel_id: hotelId }))
}
export function updateSalesInquiry(hotelId: string, id: string, body: SalesInquiryPatch) {
  return api<SalesInquiryDetail>(withQuery(`/api/v1/sales-inquiries/${encodeURIComponent(id)}`, { hotel_id: hotelId }), { method: "PATCH", body })
}

// ── The emailed follow-up page ──────────────────────────────────────────────
// Reached from the sales notification email with no Clerk session; the signed
// token in the URL is the whole authorization, so these two calls carry no
// hotel_id and `api()` sends no Authorization header (none is set on a public
// route). Everything the page renders comes back in one response.
export type SalesFollowUpOutcome = "call_attempted" | "contacted" | "booked" | "closed"
export type PublicSalesInquiry = {
  hotel_display_name: string
  caller_name: string | null
  callback_phone_e164: string | null
  caller_id_phone_e164: string | null
  email: string | null
  event_type: string
  event_dates_text: string | null
  event_start_date: string | null
  event_end_date: string | null
  dates_flexible: boolean | null
  // Party size: the caller's words plus the parsed low/high pair. A single
  // figure is stored in both bounds, so a range is simply min !== max.
  headcount_text: string | null
  headcount_min: number | null
  headcount_max: number | null
  needs_guest_rooms: boolean | null
  // The caller's own words plus the post-call AI-estimated total-event range.
  budget_text: string | null
  estimated_budget_min: string | null
  estimated_budget_max: string | null
  budget_estimation_status: "pending" | "complete" | "failed"
  budget_estimated_at: string | null
  budget_estimation_model: string | null
  budget_estimation_prompt_version: string | null
  notes: string | null
  created_at: string
  follow_up_status: SalesFollowUpStatus
  follow_up_status_label: string
  assigned_rep: string | null
  version: number
  activity: SalesActivity[]
  sales_reps: string[]
  outcomes: Array<{ value: SalesFollowUpOutcome; label: string }>
}
export type PublicSalesUpdate = {
  version: number
  rep_name: string
  outcome: SalesFollowUpOutcome
  left_voicemail?: boolean
  note?: string
}
function publicInquiryPath(token: string) {
  return `/api/v1/public/sales-inquiries/${encodeURIComponent(token)}`
}
export function fetchPublicSalesInquiry(token: string) {
  return api<PublicSalesInquiry>(publicInquiryPath(token))
}
export function logPublicSalesUpdate(token: string, body: PublicSalesUpdate) {
  return api<PublicSalesInquiry>(publicInquiryPath(token), { method: "POST", body })
}

// Party size the way the caller said it: "150–200", "40", or "at least a
// hundred (100)" when their words carry a hedge the numbers can't. Null when
// nothing was given. Mirrors the email's rendering so staff read the same
// thing in both places.
export function formatHeadcount(row: {
  headcount_text: string | null
  headcount_min: number | null
  headcount_max: number | null
}): string | null {
  if (row.headcount_min === null || row.headcount_max === null) return row.headcount_text
  const figure =
    row.headcount_min === row.headcount_max
      ? row.headcount_min.toLocaleString()
      : `${row.headcount_min.toLocaleString()}\u2013${row.headcount_max.toLocaleString()}`
  if (!row.headcount_text || row.headcount_text.toLowerCase() === figure.toLowerCase()) return figure
  return `${row.headcount_text} (${figure})`
}
