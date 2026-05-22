"use client"

import * as React from "react"

import { fetchCurrentUser, type CurrentUser } from "./api"

type CurrentUserContextValue = {
  user: CurrentUser | null
  loading: boolean
  error: string | null
  isPlatformAdmin: boolean
  refresh: () => Promise<void>
}

const CurrentUserContext = React.createContext<CurrentUserContextValue | null>(null)

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUser(await fetchCurrentUser())
    } catch (e) {
      setUser(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const value = React.useMemo<CurrentUserContextValue>(
    () => ({
      user,
      loading,
      error,
      isPlatformAdmin: user?.role === "platform_admin",
      refresh,
    }),
    [error, loading, refresh, user],
  )

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = React.useContext(CurrentUserContext)
  if (ctx === null) {
    throw new Error("useCurrentUser() must be used inside <CurrentUserProvider>")
  }
  return ctx
}
