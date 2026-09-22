"use client"

// The one safe behaviour for every page that works one hotel at a time when
// the sidebar scope is an organization: no silent fallback to the first hotel
// (that would let someone edit the wrong property's persona or knowledge), just
// an explicit pick. Mounted by the protected layout for every route that is
// not on its portfolio allowlist, so a new page gets this for free.

import { Building2 } from "lucide-react"

import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { useHotel } from "@/lib/hotel-context"

export function SingleHotelRequired() {
  const { scopeHotels, scopeLabel, setHotelId } = useHotel()
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="app-content flex-1 p-8">
        <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-xs">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Building2 className="size-6" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-semibold text-foreground">Pick a hotel to continue</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This page works one hotel at a time. You&apos;re viewing{" "}
            <span className="font-medium text-foreground">{scopeLabel ?? "a portfolio"}</span>
            {" "}— choose which hotel to open here.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {scopeHotels.map((h) => (
              <Button
                key={h.hotel_id}
                type="button"
                variant="outline"
                onClick={() => setHotelId(h.hotel_id)}
              >
                {h.display_name}
              </Button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
