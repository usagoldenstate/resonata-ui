"use client"

import { useHotel } from "@/lib/hotel-context"
import { SalesFlowBuilder } from "@/components/sales-flow-builder"
import { HotelLoadError, NoHotelAccess } from "@/components/hotel-access-state"

export default function SalesScriptPage() {
  const {hotelId,hotels,loading,accessState,refresh}=useHotel()
  if (loading) return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Loading your workspace…</div>
  if (!hotelId) return accessState==="error"?<HotelLoadError onRetry={refresh}/>:<NoHotelAccess/>
  return <SalesFlowBuilder key={hotelId} hotelId={hotelId} hotelName={hotels.find(h=>h.hotel_id===hotelId)?.display_name??hotelId}/>
}
