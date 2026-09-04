"use client"

import { Sidebar } from "@/components/sidebar"
import { useHotel } from "@/lib/hotel-context"
import { HotelLoadError, NoHotelAccess } from "@/components/hotel-access-state"
import { RateMappingTab } from "@/components/knowledge-base/rate-mapping-tab"

export default function RateMappingPage() {
  const { hotelId, hotels, loading: hotelLoading, accessState, refresh } =
    useHotel()
  const hotel = hotels.find((h) => h.hotel_id === hotelId)

  if (hotelLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Loading hotels…
        </div>
      </div>
    )
  }

  if (!hotelId) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        {accessState === "error" ? (
          <HotelLoadError onRetry={refresh} />
        ) : (
          <NoHotelAccess />
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b border-border px-8 py-4 flex items-center gap-3 shrink-0">
          <h1 className="text-xl font-bold text-foreground">
            {hotel?.display_name ?? "Rate Mapping"}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/30">
          <RateMappingTab hotelId={hotelId} />
        </div>
      </div>
    </div>
  )
}
