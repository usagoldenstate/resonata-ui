"use client"

// Plays a call's recording. Shared by the call log and the sales inquiry
// panel. The audio is fetched as a blob through the authed proxy (the browser
// can't send the Clerk bearer on an <audio src>), cached by SWR so reopening
// plays instantly, and played with the native controls. The object URL is
// created whenever the cached blob changes and revoked on cleanup.
//
// Retention is the backend's call: recordings live in our own storage, and a
// recording that is gone (expired, deleted, or never uploaded) comes back as a
// 404 whose detail ("Recording not available") is shown as-is. There is no
// client-side age cutoff. Right after a call the file may still be uploading:
// the backend then answers 404 with reason "processing", and the player checks
// again every few seconds until the audio arrives or the backend gives a final
// answer (it stops saying "processing" once the upload window has passed).

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"

import { ApiError, fetchCallRecording } from "@/lib/api"

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

const PROCESSING_POLL_MS = 10_000
const TRANSIENT_RETRY_BASE_MS = 5_000

// The backend's "still uploading" answer: the only 4xx worth checking again.
function isProcessing(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 404) return false
  return (error.body as { reason?: unknown } | undefined)?.reason === "processing"
}

// Any other 4xx (no recording, no access) won't change on retry; only
// transient failures (5xx, network) are worth backoff retries.
function isPermanentError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

export function CallRecordingPlayer({ callId }: { callId: string }) {
  const {
    data: blob,
    isLoading,
    error,
  } = useSWR(
    ["call-recording", callId] as const,
    ([, id]) => fetchCallRecording(id),
    {
      shouldRetryOnError: (err) => isProcessing(err) || !isPermanentError(err),
      onErrorRetry: (err, _key, _config, revalidate, opts) => {
        if (isProcessing(err)) {
          // Steady polling while the upload finishes; the backend ends it.
          setTimeout(() => revalidate(opts), PROCESSING_POLL_MS)
          return
        }
        // Exponential backoff for transient failures, as SWR's default.
        const step = Math.min(opts.retryCount, 8)
        setTimeout(() => revalidate(opts), TRANSIENT_RETRY_BASE_MS * 2 ** step)
      },
    },
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

  // Checked before isLoading: each re-check has no audio yet, so SWR reports
  // it as loading, and the spinner would flash in and out between checks.
  if (isProcessing(error)) {
    return <p className="text-sm text-muted-foreground">{describeError(error)}</p>
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
    // A missing recording is an expected state, not a failure.
    const missing = error instanceof ApiError && error.status === 404
    return (
      <p className={missing ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
        {describeError(error)}
      </p>
    )
  }
  if (!url) return null
  return <audio controls src={url} className="w-full" />
}
