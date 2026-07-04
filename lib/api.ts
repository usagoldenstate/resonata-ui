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
  // Funnel middle stage: calls that sent a booking link (superset of
  // calls_booked, so total_calls >= links_sent >= calls_booked).
  links_sent: number
  // Sum of call durations over the window; powers the Total Call Minutes /
  // Avg Call Duration tiles.
  total_call_seconds: number
  conversion_rate: number
  missed_opportunities: number
  csat_score: number | null
  csat_satisfied: number
  csat_dissatisfied: number
  csat_mixed: number
  csat_declined: number
  csat_responses: number
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
  trend: RevenueTrendRow[]
}

export type CsatFeedbackItem = {
  provider_call_id: string
  call_record_id: string | null
  response: string
  reason: string | null
  survey_language: string
  responded_at: string | null
}

export type CsatFeedbackResponse = {
  items: CsatFeedbackItem[]
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
  // Server-derived: a playable Twilio recording is attached. The raw sid is never
  // exposed; audio is fetched by call_id through the authed proxy below.
  has_recording: boolean
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
}

export type UserGrantedHotel = {
  hotel_id: string
  display_name: string
  granted_at: string
}

export type UserAccessItem = {
  user_id: string
  auth_subject: string
  email: string
  role: string
  is_active: boolean
  hotels: UserGrantedHotel[]
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
  pms_webhook_last_received_at: string | null
  is_active: boolean
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
}

// Platform-admin-only partial update (PATCH /admin/hotels/{id}/platform-settings).
export type HotelPlatformUpdate = {
  inbound_phone_number?: string | null
  vapi_phone_number_id?: string | null
  booking_engine_provider?: string | null
  is_active?: boolean
  commission_rate_basis_points?: number
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
}

export type PendingInvitation = {
  invitation_id: string
  email: string
  status: string
  created_at: string | null
  role: "operator" | "platform_admin" | null
  hotel_ids: string[]
}

// Invite a new user by email. Clerk emails them a sign-up link; the role +
// hotel access are applied automatically when they finish signing up.
export function inviteUser(body: {
  email: string
  role: "operator" | "platform_admin"
  hotel_ids: string[]
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
    call_id?: string
  },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallListPage>(withQuery("/api/v1/calls", params), opts)
}

export function fetchCallDetail(callId: string, opts: Pick<Options, "signal"> = {}) {
  return api<CallDetail>(`/api/v1/calls/${callId}`, opts)
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
  params: CallMetricsBaseParams & { start_date: string; end_date: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CallMetricsSummary>(
    withQuery("/api/v1/reporting/call-metrics/summary", params),
    opts,
  )
}

export function fetchRevenueSummary(
  params: { hotel_id: string; start_date: string; end_date: string; basis?: RevenueBasis },
  opts: Pick<Options, "signal"> = {},
) {
  return api<RevenueSummary>(
    withQuery("/api/v1/reporting/revenue/summary", params),
    opts,
  )
}

export function fetchCsatFeedback(
  params: { hotel_id: string; start_date: string; end_date: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<CsatFeedbackResponse>(
    withQuery("/api/v1/reporting/csat/feedback", params),
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

export function fetchFaqs(
  params: CallMetricsBaseParams & { start_date: string; end_date: string },
  opts: Pick<Options, "signal"> = {},
) {
  return api<FaqResponse>(withQuery("/api/v1/reporting/faqs", params), opts)
}

export function fetchFaqOccurrences(
  params: CallMetricsBaseParams & {
    start_date: string
    end_date: string
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
