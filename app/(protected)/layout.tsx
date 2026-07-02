"use client"

import { RedirectToSignIn, useAuth, useClerk } from "@clerk/nextjs"
import { SWRConfig } from "swr"

import { AppShellSkeleton } from "@/components/app-shell-skeleton"
import { CurrentUserProvider } from "@/lib/current-user-context"
import { HotelProvider } from "@/lib/hotel-context"
import { __setClerkTokenGetter, __setUnauthorizedHandler } from "@/lib/api"

function ClerkTokenBridge() {
  // ProtectedLayout renders this only after Clerk is loaded and the user is
  // signed in. The slot is written during render; React completes all renders
  // in the tree before any effects fire, so HotelProvider's effect cannot race
  // ahead of this bridge.
  const { getToken } = useAuth()
  const { signOut } = useClerk()
  __setClerkTokenGetter(() => getToken())
  __setUnauthorizedHandler(async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("resonata.selected_hotel_id")
    }
    await signOut({ redirectUrl: "/sign-in" })
  })
  return null
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  // Show the app's structure while Clerk's JS boots instead of a blank screen.
  if (!isLoaded) return <AppShellSkeleton />
  if (!isSignedIn) return <RedirectToSignIn />

  return (
    <SWRConfig
      value={{
        // Revisiting a page repaints instantly from cache while this
        // refetches in the background, instead of every navigation
        // re-showing a spinner.
        revalidateOnFocus: true,
        keepPreviousData: true,
        // Rapid re-renders (e.g. two widgets requesting the same key) share
        // one request instead of hitting the backend twice.
        dedupingInterval: 15_000,
      }}
    >
      <ClerkTokenBridge />
      <CurrentUserProvider>
        <HotelProvider>{children}</HotelProvider>
      </CurrentUserProvider>
    </SWRConfig>
  )
}
