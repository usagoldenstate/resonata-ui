"use client"

import { Sidebar } from "@/components/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { ChatPanel } from "@/components/reporting-chat/chat-panel"
import { useHotel } from "@/lib/hotel-context"

export default function ReportingChatPage() {
  const { hotelId, loading } = useHotel()

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex h-screen flex-1 flex-col p-8">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Ask Insights</h1>
          <p className="text-sm text-muted-foreground">
            Chat with your call data — volumes, lost bookings, guest questions, revenue.
          </p>
        </div>
        <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="h-5 w-5" />
            </div>
          ) : hotelId ? (
            <ChatPanel key={hotelId} hotelId={hotelId} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Select a hotel to start asking questions.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
