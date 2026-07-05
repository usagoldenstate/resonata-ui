"use client"

// SSE client + shared types for the reporting insights chat
// (POST /api/v1/reporting/chat). Wire protocol documented in the backend at
// services/reporting_chat/service.py — keep the event union in sync with it.

import { apiStream } from "./api"

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string }

export type ChatRequestBody = {
  message: string
  history: ChatHistoryMessage[]
}

export type ChatMetaPayload = {
  model: string
  remaining_messages: number
  remaining_deep_scans: number
  soft_warning: boolean
}

export type ChatToolStartPayload = {
  tool_use_id: string
  name: string
  input: Record<string, unknown>
}

export type ChatToolResultPayload = {
  tool_use_id: string
  name: string
  ok: boolean
  elapsed_ms: number
  data: unknown
  error: string | null
  truncated: boolean
}

export type ChatScanProgressPayload = {
  scanned: number
  total: number
  matched: number
}

export type ChatUsagePayload = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  deep_scan_input_tokens: number
  deep_scan_output_tokens: number
}

export type ChatDonePayload = {
  stop_reason: string | null
  iterations: number
  usage: ChatUsagePayload
  remaining_messages: number
  remaining_deep_scans: number
}

export type ChatErrorPayload = { code: string; message: string }

export type ChatSseEvent =
  | { event: "meta"; data: ChatMetaPayload }
  | { event: "text_delta"; data: { text: string } }
  | { event: "tool_start"; data: ChatToolStartPayload }
  | { event: "tool_result"; data: ChatToolResultPayload }
  | { event: "scan_progress"; data: ChatScanProgressPayload }
  | { event: "done"; data: ChatDonePayload }
  | { event: "error"; data: ChatErrorPayload }

const KNOWN_EVENTS = new Set([
  "meta",
  "text_delta",
  "tool_start",
  "tool_result",
  "scan_progress",
  "done",
  "error",
])

// Async generator over the chat SSE stream. Throws ApiError for pre-stream
// failures (401/404/422/429); once streaming, terminal failures arrive as an
// `error` event. A stream that ends without done/error means the connection
// dropped — the caller handles that case.
export async function* streamReportingChat(
  hotelId: string,
  body: ChatRequestBody,
  signal?: AbortSignal,
): AsyncGenerator<ChatSseEvent> {
  const res = await apiStream(
    `/api/v1/reporting/chat?hotel_id=${encodeURIComponent(hotelId)}`,
    { body, signal },
  )
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separator: number
      while ((separator = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        if (!frame.trim() || frame.startsWith(":")) continue // ping / keepalive
        const eventName = /^event: (.+)$/m.exec(frame)?.[1]
        const dataRaw = /^data: (.+)$/m.exec(frame)?.[1]
        if (!eventName || dataRaw === undefined || !KNOWN_EVENTS.has(eventName)) continue
        yield { event: eventName, data: JSON.parse(dataRaw) } as ChatSseEvent
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ---------------------------------------------------------------------------
// UI state model shared by the chat components

export type ToolActivity = {
  id: string
  name: string
  input: Record<string, unknown>
  status: "running" | "ok" | "error"
  elapsedMs?: number
  data?: unknown
  error?: string
  truncated?: boolean
}

export type ChatTurn = {
  id: string
  role: "user" | "assistant"
  text: string
  status: "streaming" | "done" | "error"
  tools: ToolActivity[]
  scan?: ChatScanProgressPayload
  errorMessage?: string
}
