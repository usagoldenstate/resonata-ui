"use client"

// Plays a call's recording. Shared by the call log and the sales inquiry
// panel. The audio is fetched as a blob through the authed proxy (the browser
// can't send the Clerk bearer on an <audio src>), cached by SWR so reopening
// plays instantly, and played with the native controls. The object URL is
// created whenever the cached blob changes and revoked on cleanup.

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"

import { ApiError, fetchCallRecording } from "@/lib/api"

// Vapi only keeps call audio for 14 days; past that the fetch fails upstream,
// so older calls show the retention notice instead of requesting the audio.
export const RECORDING_RETENTION_DAYS = 14

function parseUtc(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`)
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function CallRecordingPlayer({ callId, createdAt }: { callId: string; createdAt: string }) {
  const expired =
    Date.now() - parseUtc(createdAt).getTime() > RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const {
    data: blob,
    isLoading,
    error,
  } = useSWR(expired ? null : (["call-recording", callId] as const), ([, id]) =>
    fetchCallRecording(id),
  )
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (expired) {
    return (
      <p className="text-sm text-muted-foreground">
        {`Recordings are only stored for ${RECORDING_RETENTION_DAYS} days, so this call's recording is no longer available.`}
      </p>
    )
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading recording…
      </div>
    )
  }
  if (error) {
    return <p className="text-sm text-destructive">{describeError(error)}</p>
  }
  if (!url) return null
  return <audio controls src={url} className="w-full" />
}
