"use client"

// Selected-hotel context for authenticated users. Fetches the caller's
// accessible active hotels once on mount, persists the
// current selection in localStorage so a reload lands back on the same hotel,
// and exposes a setter the hotel picker calls. Every page that talks to the
// backend reads `hotelId` from here.

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
  hotelId: string | null
  // Timezone of the selected hotel; null until the hotel list has loaded.
  hotelTimezone: string | null
  setHotelId: (id: string) => void
  loading: boolean
  error: string | null
  accessState: HotelAccessState
  refresh: () => Promise<void>
}

const HotelContext = React.createContext<Ctx | null>(null)

const STORAGE_KEY = "resonata.selected_hotel_id"

function readStoredHotelId(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function HotelProvider({ children }: { children: React.ReactNode }) {
  const [hotels, setHotels] = React.useState<HotelListItem[]>([])
  // Seed the selection synchronously from localStorage so data-bound pages get
  // a hotelId on their very first render and can start fetching in parallel
  // with the hotels-list validation below, rather than waiting a full round
  // trip for it. refresh() reconciles this optimistic value against the real
  // list: it's kept if still valid, or replaced by the first active hotel /
  // null if the stored id is stale. Safe from hydration mismatch because this
  // provider is mounted only after Clerk reports loaded (a post-hydration
  // client update), so it never renders during server-matched hydration.
  const [hotelId, setHotelIdState] = React.useState<string | null>(readStoredHotelId)
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
      // Restore stored selection if it still exists in the list; otherwise
      // default to the first active hotel so pages aren't stuck in an empty
      // state on first load.
      const stored = readStoredHotelId()
      const match = stored && list.find((h) => h.hotel_id === stored)
      if (match) {
        setHotelIdState(match.hotel_id)
      } else if (list.length > 0) {
        // Stored id was stale (revoked/renamed hotel) or absent: fall back to
        // the first active hotel and rewrite storage so the optimistic seed
        // doesn't keep pointing pages at a hotel the user can't load.
        setHotelIdState(list[0].hotel_id)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, list[0].hotel_id)
        }
      } else {
        setHotelIdState(null)
      }
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

  const setHotelId = React.useCallback((id: string) => {
    setHotelIdState(id)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id)
    }
  }, [])

  const value: Ctx = {
    hotels,
    hotelId,
    hotelTimezone:
      hotels.find((h) => h.hotel_id === hotelId)?.timezone ?? null,
    setHotelId,
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
