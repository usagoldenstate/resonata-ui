"use client"

/**
 * The page behind the "Listen to recording" button in the sales notification
 * email.
 *
 * Public by design (proxy.ts lists /recording as unauthenticated): the email
 * goes to a shared sales mailbox whose readers have no Resonata account. The
 * signed token in the URL is the whole authorization. The backend decides
 * everything else, so an early click shows "processing" and keeps checking,
 * and a disabled or expired link shows that it is no longer available.
 */

import { use } from "react"
import { Headphones } from "lucide-react"

import { RecordingPlayer } from "@/components/call-recording-player"
import { fetchPublicSalesRecording } from "@/lib/api"

export default function SalesRecordingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <Headphones className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Call recording</h1>
        </div>
        <RecordingPlayer
          cacheKey={["public-sales-recording", token]}
          load={() => fetchPublicSalesRecording(token)}
          allowDownload={false}
        />
      </div>
    </main>
  )
}
