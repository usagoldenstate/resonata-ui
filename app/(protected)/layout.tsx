"use client"

import { RedirectToSignIn, useAuth, useClerk } from "@clerk/nextjs"

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
  if (!isLoaded) return null
  if (!isSignedIn) return <RedirectToSignIn />

  return (
    <>
      <ClerkTokenBridge />
      <CurrentUserProvider>
        <HotelProvider>{children}</HotelProvider>
      </CurrentUserProvider>
    </>
  )
}
