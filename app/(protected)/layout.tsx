"use client"

import { useEffect } from "react"
import { RedirectToSignIn, useAuth, useClerk } from "@clerk/nextjs"
import { usePathname, useRouter } from "next/navigation"
import { SWRConfig } from "swr"

import { AppShellSkeleton } from "@/components/app-shell-skeleton"
import { SingleHotelRequired } from "@/components/single-hotel-required"
import { CurrentUserProvider } from "@/lib/current-user-context"
import { HotelProvider, useHotel } from "@/lib/hotel-context"
import { homeRouteFor, lineRequiredFor } from "@/lib/product-lines"
import { __setClerkTokenGetter, __setUnauthorizedHandler } from "@/lib/api"

// Routes that render a whole organization at once (rows carry a hotel badge).
// Everything else works one hotel at a time and gets the shared "pick a hotel"
// prompt while the scope is an organization — including the dashboard, dev
// pages and any page added later.
const PORTFOLIO_ROUTES = new Set(["/call-log", "/sales-inquiries"])

function ScopeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { scope } = useHotel()
  if (scope?.kind === "org" && !PORTFOLIO_ROUTES.has(pathname)) {
    return <SingleHotelRequired />
  }
  return <>{children}</>
}

// Pages tied to one product line (reservation reports, room mapping, sales
// inquiries) are off-limits to a scope that doesn't have that line — hiding
// the nav item is not enough, since the page still opens by URL or bookmark.
// A blocked page redirects to the scope's home: sales inquiries for a
// sales-only hotel (which is also where its "/" lands), the dashboard
// otherwise. While the hotel list is still loading, a line-specific page shows
// the skeleton instead of briefly rendering reports a sales-only hotel never
// has.
function LineGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { scopeLines, loading } = useHotel()
  const needed = lineRequiredFor(pathname)
  const blocked = needed !== null && scopeLines !== null && !scopeLines[needed]
  const home = scopeLines ? homeRouteFor(scopeLines) : "/"
  useEffect(() => {
    if (blocked) router.replace(home)
  }, [blocked, home, router])
  if (blocked || (needed !== null && scopeLines === null && loading)) {
    return <AppShellSkeleton />
  }
  return <>{children}</>
}

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
      window.localStorage.removeItem("resonata.hotel_scope")
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
        <HotelProvider>
          <ScopeGate>
            <LineGate>{children}</LineGate>
          </ScopeGate>
        </HotelProvider>
      </CurrentUserProvider>
    </SWRConfig>
  )
}
