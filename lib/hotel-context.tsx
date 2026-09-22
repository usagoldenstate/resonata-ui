"use client"

// Selected-scope context for authenticated users. Fetches the caller's
// accessible active hotels once on mount, persists the current selection in
// localStorage so a reload lands back on it, and exposes setters the picker
// calls.
//
// A selection is a SCOPE: one hotel, or one organization (a management
// company's portfolio — every accessible hotel that belongs to it). Pages that
// only ever work one hotel at a time keep reading `hotelId`, which is null in
// organization mode; the protected layout swaps those pages for a "pick a
// hotel" prompt so they never improvise. Pages that support the portfolio
// view (call log, sales inquiries) read `scopeHotels` instead.
//
// Only the scope's IDENTITY is persisted ({kind, hotelId} / {kind,
// organizationId}); the hotel list behind an organization is recomputed from
// every fresh /me/hotels response, so a hotel added to or removed from the
// portfolio (or a revoked grant) takes effect on the next load rather than
// living on in a stale cached list.

import * as React from "react"

import { api, ApiError } from "./api"

export type HotelListItem = {
  hotel_id: string
  display_name: string
  pms_provider: string
  is_active: boolean
  // IANA zone name; reporting pages compute preset date ranges in hotel-local
  // time so they line up with how the backend buckets records.
  timezone: string
  // The organization the hotel belongs to, when it has one. The picker groups
  // by it and offers the group as a scope once it holds two or more hotels.
  organization_id: string | null
  organization_name: string | null
}

export type HotelScope =
  | { kind: "hotel"; hotelId: string }
  | { kind: "org"; organizationId: string }

export type OrganizationGroup = {
  organization_id: string
  display_name: string
  // The accessible hotels in this organization — possibly a subset of the
  // organization's hotels, which is why the picker says "(N hotels)" rather
  // than "all hotels".
  hotels: HotelListItem[]
}

// Distinguishes the two states that used to both surface as a generic error:
//   no-access — the caller is a legitimate, authenticated user who simply
//               hasn't been granted any hotel yet (backend 403/404, or an empty
//               list). An expected onboarding state, not a failure.
//   error     — a genuine transient failure (backend down, network, 5xx).
// Pages branch on this to show the right copy and the right action
// (contact Resonata vs. retry).
export type HotelAccessState = "loading" | "ok" | "no-access" | "error"

type Ctx = {
  hotels: HotelListItem[]
  // Organizations with at least one accessible hotel, derived from `hotels`.
  organizations: OrganizationGroup[]
  scope: HotelScope | null
  // The single selected hotel, or null in organization mode.
  hotelId: string | null
  // Timezone of the selected hotel; null until the list has loaded or in
  // organization mode (each row then carries its own hotel's zone).
  hotelTimezone: string | null
  // Every hotel the current scope spans: one entry for a hotel scope, the
  // organization's accessible hotels for an org scope, empty before load.
  scopeHotels: HotelListItem[]
  // Human label for the scope ("Coastal (3 hotels)" / the hotel's name).
  scopeLabel: string | null
  setHotelId: (id: string) => void
  setScope: (scope: HotelScope) => void
  loading: boolean
  error: string | null
  accessState: HotelAccessState
  refresh: () => Promise<void>
}

const HotelContext = React.createContext<Ctx | null>(null)

const STORAGE_KEY = "resonata.hotel_scope"
// Pre-organizations key. Read once to migrate, then superseded.
const LEGACY_STORAGE_KEY = "resonata.selected_hotel_id"

function readUrlHotelId(): string | null {
  if (typeof window === "undefined") return null
  try {
    return new URLSearchParams(window.location.search).get("hotel_id")
  } catch {
    return null
  }
}

function readStoredScope(): HotelScope | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HotelScope> | null
      if (parsed?.kind === "hotel" && typeof parsed.hotelId === "string") {
        return { kind: "hotel", hotelId: parsed.hotelId }
      }
      if (parsed?.kind === "org" && typeof parsed.organizationId === "string") {
        return { kind: "org", organizationId: parsed.organizationId }
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) return { kind: "hotel", hotelId: legacy }
  } catch {
    // Storage unavailable (private mode, blocked) — start unselected.
  }
  return null
}

function writeStoredScope(scope: HotelScope) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope))
    // Keep the legacy key in step for the one place that still reads it as a
    // signal (sign-out cleanup), then let it fade.
    if (scope.kind === "hotel") {
      window.localStorage.setItem(LEGACY_STORAGE_KEY, scope.hotelId)
    } else {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    }
  } catch {
    // Best-effort persistence only.
  }
}

export function groupByOrganization(hotels: HotelListItem[]): OrganizationGroup[] {
  const groups = new Map<string, OrganizationGroup>()
  for (const h of hotels) {
    if (!h.organization_id) continue
    const group = groups.get(h.organization_id) ?? {
      organization_id: h.organization_id,
      display_name: h.organization_name ?? h.organization_id,
      hotels: [],
    }
    group.hotels.push(h)
    groups.set(h.organization_id, group)
  }
  return [...groups.values()].sort((a, b) => a.display_name.localeCompare(b.display_name))
}

export function organizationScopeLabel(group: OrganizationGroup): string {
  const n = group.hotels.length
  return `${group.display_name} (${n} hotel${n === 1 ? "" : "s"})`
}

// Reconcile a wanted scope against the hotels the user can actually see.
// Returns null when nothing in the list satisfies it (stale hotel, stale org,
// or an org that no longer spans two accessible hotels — a one-hotel "portfolio"
// collapses to that hotel).
function resolveScope(wanted: HotelScope | null, hotels: HotelListItem[]): HotelScope | null {
  if (!wanted) return null
  if (wanted.kind === "hotel") {
    return hotels.some((h) => h.hotel_id === wanted.hotelId) ? wanted : null
  }
  const members = hotels.filter((h) => h.organization_id === wanted.organizationId)
  if (members.length >= 2) return wanted
  if (members.length === 1) return { kind: "hotel", hotelId: members[0].hotel_id }
  return null
}

export function HotelProvider({ children }: { children: React.ReactNode }) {
  const [hotels, setHotels] = React.useState<HotelListItem[]>([])
  // Seed the selection synchronously from localStorage so data-bound pages get
  // a scope on their very first render and can start fetching in parallel
  // with the hotels-list validation below, rather than waiting a full round
  // trip for it. refresh() reconciles this optimistic value against the real
  // list: it's kept if still valid, or replaced by the first active hotel /
  // null if the stored value is stale. Safe from hydration mismatch because
  // this provider is mounted only after Clerk reports loaded (a
  // post-hydration client update), so it never renders during server-matched
  // hydration.
  const [scope, setScopeState] = React.useState<HotelScope | null>(readStoredScope)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [accessState, setAccessState] =
    React.useState<HotelAccessState>("loading")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setAccessState("loading")
    try {
      const list = await api<HotelListItem[]>("/api/v1/me/hotels")
      setHotels(list)
      // A successful response with no hotels means the account exists but
      // hasn't been granted access to anything yet — the onboarding state.
      setAccessState(list.length > 0 ? "ok" : "no-access")
      // A `?hotel_id=` in the URL (the sales-inquiry email's "open the call"
      // link) wins over the stored selection when it names a hotel this user
      // can see — and it always forces single-hotel scope, since the link
      // points at one hotel's call.
      const fromUrl = readUrlHotelId()
      const urlScope = resolveScope(fromUrl ? { kind: "hotel", hotelId: fromUrl } : null, list)
      const next =
        urlScope ??
        resolveScope(readStoredScope(), list) ??
        (list.length > 0 ? ({ kind: "hotel", hotelId: list[0].hotel_id } as HotelScope) : null)
      setScopeState(next)
      // Rewrite storage whenever the resolved scope differs from what was
      // stored (URL override, or a stale value replaced by the fallback), so
      // the optimistic seed doesn't keep pointing pages at something the user
      // can't load.
      if (next) writeStoredScope(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // A 403/404 means the user authenticated fine but the backend has no
      // record granting them hotel access — treat as no-access, not a failure.
      // Anything else (network, 5xx, missing config) is a genuine error.
      const noAccess =
        e instanceof ApiError && (e.status === 403 || e.status === 404)
      setAccessState(noAccess ? "no-access" : "error")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const setScope = React.useCallback((next: HotelScope) => {
    setScopeState(next)
    writeStoredScope(next)
  }, [])

  const setHotelId = React.useCallback(
    (id: string) => setScope({ kind: "hotel", hotelId: id }),
    [setScope],
  )

  const organizations = React.useMemo(() => groupByOrganization(hotels), [hotels])

  const hotelId = scope?.kind === "hotel" ? scope.hotelId : null
  const selectedHotel = hotelId ? hotels.find((h) => h.hotel_id === hotelId) ?? null : null
  const selectedGroup =
    scope?.kind === "org"
      ? organizations.find((g) => g.organization_id === scope.organizationId) ?? null
      : null
  const scopeHotels = React.useMemo(() => {
    if (selectedGroup) return selectedGroup.hotels
    return selectedHotel ? [selectedHotel] : []
  }, [selectedGroup, selectedHotel])

  const value: Ctx = {
    hotels,
    organizations,
    scope,
    hotelId,
    hotelTimezone: selectedHotel?.timezone ?? null,
    scopeHotels,
    scopeLabel: selectedGroup
      ? organizationScopeLabel(selectedGroup)
      : selectedHotel?.display_name ?? null,
    setHotelId,
    setScope,
    loading,
    error,
    accessState,
    refresh,
  }
  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>
}

export function useHotel(): Ctx {
  const ctx = React.useContext(HotelContext)
  if (ctx === null) {
    throw new Error("useHotel() must be used inside <HotelProvider>")
  }
  return ctx
}
