"use client"

import * as React from "react"

import { DemoHotelList } from "@/components/demo-hotels/demo-hotel-list"
import { DemoHotelWizard } from "@/components/demo-hotels/demo-hotel-wizard"
import { Sidebar } from "@/components/sidebar"
import { useCurrentUser } from "@/lib/current-user-context"

export default function DemoHotelsPage() {
  const { loading, isPlatformAdmin } = useCurrentUser()
  // Bumped after a successful create/update so the list re-fetches and shows
  // the new/changed hotel without a full page reload.
  const [listRefreshKey, setListRefreshKey] = React.useState(0)

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Demo Hotels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spin up mock-PMS hotels for sales and onboarding demos — no real
            PMS credentials required.
          </p>
        </div>

        {loading ? (
          <StateNotice tone="muted" message="Loading..." />
        ) : isPlatformAdmin ? (
          <div className="max-w-6xl space-y-8">
            <DemoHotelList refreshKey={listRefreshKey} />
            <DemoHotelWizard
              onCreated={() => setListRefreshKey((k) => k + 1)}
            />
          </div>
        ) : (
          <StateNotice
            tone="error"
            message="This page is only available to platform admins."
          />
        )}
      </main>
    </div>
  )
}

function StateNotice({ tone, message }: { tone: "muted" | "error"; message: string }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        tone === "error"
          ? "border-destructive/30 text-destructive"
          : "border-border text-muted-foreground"
      }`}
    >
      {message}
    </div>
  )
}
