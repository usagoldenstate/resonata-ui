"use client"

import { Sidebar } from "@/components/sidebar"
import { useHotel } from "@/lib/hotel-context"
import { HotelLoadError, NoHotelAccess } from "@/components/hotel-access-state"
import { RoomMappingTab } from "@/components/knowledge-base/room-mapping-tab"

export default function RoomMappingPage() {
  const { hotelId, hotels, loading: hotelLoading, accessState, refresh } =
    useHotel()
  const hotel = hotels.find((h) => h.hotel_id === hotelId)

  if (hotelLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="app-content flex-1 flex items-center justify-center text-sm text-muted-foreground">
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
      <div className="app-content flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="app-page-header bg-card border-b border-border px-8 py-4 flex items-center gap-3 shrink-0">
<div>
              <p className="app-eyebrow mb-2">Agent workspace</p>
              <h1 className="text-xl font-bold text-foreground">Room mapping</h1>
              <p className="text-sm text-muted-foreground">Connect your room types so guests always get the right options.</p>
              <p className="text-xs text-muted-foreground">{hotel?.display_name}</p>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/30">
          <RoomMappingTab hotelId={hotelId} />
        </div>
      </div>
    </div>
  )
}
