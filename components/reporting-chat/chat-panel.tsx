"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { MessageSquareText, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import {
  type ChatSseEvent,
  type ChatTurn,
  type ChatScanProgressPayload,
  type ToolActivity,
  streamReportingChat,
} from "@/lib/reporting-chat"
import { ChatInput } from "./chat-input"
import { ChatMessage } from "./chat-message"

const SUGGESTIONS = [
  "How did we do over the last 30 days?",
  "What are the top reasons callers didn't book?",
  "What do callers ask that our knowledge base can't answer?",
  "Do the booking links we send actually convert?",
]

type State = {
  turns: ChatTurn[]
  streaming: boolean
  remainingMessages: number | null
  softWarning: boolean
}

type Action =
  | { type: "send"; userId: string; assistantId: string; text: string }
  | { type: "sse"; assistantId: string; event: ChatSseEvent }
  | { type: "finish"; assistantId: string; error?: string }

const initialState: State = {
  turns: [],
  streaming: false,
  remainingMessages: null,
  softWarning: false,
}

function updateTurn(turns: ChatTurn[], id: string, patch: (turn: ChatTurn) => ChatTurn): ChatTurn[] {
  return turns.map((turn) => (turn.id === id ? patch(turn) : turn))
}

function applySse(state: State, assistantId: string, sse: ChatSseEvent): State {
  switch (sse.event) {
    case "meta":
      return {
        ...state,
        remainingMessages: sse.data.remaining_messages,
        softWarning: sse.data.soft_warning,
      }
    case "text_delta":
      return {
        ...state,
        turns: updateTurn(state.turns, assistantId, (turn) => ({
          ...turn,
          text: turn.text + sse.data.text,
        })),
      }
    case "tool_start": {
      const activity: ToolActivity = {
        id: sse.data.tool_use_id,
        name: sse.data.name,
        input: sse.data.input,
        status: "running",
      }
      return {
        ...state,
        turns: updateTurn(state.turns, assistantId, (turn) => ({
          ...turn,
          tools: [...turn.tools, activity],
        })),
      }
    }
    case "tool_result":
      return {
        ...state,
        turns: updateTurn(state.turns, assistantId, (turn) => ({
          ...turn,
          tools: turn.tools.map((tool) =>
            tool.id === sse.data.tool_use_id
              ? {
                  ...tool,
                  status: sse.data.ok ? "ok" : "error",
                  elapsedMs: sse.data.elapsed_ms,
                  data: sse.data.data ?? undefined,
                  error: sse.data.error ?? undefined,
                  truncated: sse.data.truncated,
                }
              : tool,
          ),
        })),
      }
    case "scan_progress": {
      const scan: ChatScanProgressPayload = sse.data
      return {
        ...state,
        turns: updateTurn(state.turns, assistantId, (turn) => ({ ...turn, scan })),
      }
    }
    case "done":
      return {
        ...state,
        remainingMessages: sse.data.remaining_messages,
        turns: updateTurn(state.turns, assistantId, (turn) => ({ ...turn, status: "done" })),
      }
    case "error":
      return {
        ...state,
        turns: updateTurn(state.turns, assistantId, (turn) => ({
          ...turn,
          status: "error",
          errorMessage: sse.data.message,
        })),
      }
    default:
      return state
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "send":
      return {
        ...state,
        streaming: true,
        turns: [
          ...state.turns,
          { id: action.userId, role: "user", text: action.text, status: "done", tools: [] },
          { id: action.assistantId, role: "assistant", text: "", status: "streaming", tools: [] },
        ],
      }
    case "sse":
      return applySse(state, action.assistantId, action.event)
    case "finish":
      return {
        ...state,
        streaming: false,
        turns: updateTurn(state.turns, action.assistantId, (turn) =>
          turn.status === "streaming"
            ? { ...turn, status: "error", errorMessage: action.error ?? "Response interrupted." }
            : turn,
        ),
      }
    default:
      return state
  }
}

function describeApiError(error: ApiError): string {
  const detail = (error.body as { detail?: { message?: string } | string } | undefined)?.detail
  if (typeof detail === "string") return detail
  if (detail?.message) return detail.message
  if (error.status === 429) return "You've reached this month's included insights questions."
  if (error.status === 404) return "Insights chat isn't enabled for this hotel yet."
  return "Couldn't reach the insights service — please try again."
}

export function ChatPanel({ hotelId }: { hotelId: string }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [state.turns])

  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      const userId = `u-${++idRef.current}`
      const assistantId = `a-${idRef.current}`
      // Only completed exchanges go into history (mirrors the backend cap).
      const history = state.turns
        .filter((turn) => turn.status === "done" && turn.text)
        .slice(-30)
        .map((turn) => ({ role: turn.role, content: turn.text }))
      dispatch({ type: "send", userId, assistantId, text })

      const controller = new AbortController()
      abortRef.current = controller
      let sawTerminal = false
      try {
        for await (const event of streamReportingChat(hotelId, { message: text, history }, controller.signal)) {
          dispatch({ type: "sse", assistantId, event })
          if (event.event === "done" || event.event === "error") sawTerminal = true
        }
        dispatch({
          type: "finish",
          assistantId,
          error: sawTerminal ? undefined : "Connection lost — the answer may be incomplete.",
        })
      } catch (error) {
        if (controller.signal.aborted) {
          dispatch({ type: "finish", assistantId, error: "Stopped." })
          return
        }
        const message =
          error instanceof ApiError ? describeApiError(error) : "Something went wrong — please try again."
        if (error instanceof ApiError && error.status === 429) toast.error(message)
        dispatch({ type: "finish", assistantId, error: message })
      } finally {
        abortRef.current = null
      }
    },
    [hotelId, state.turns],
  )

  const empty = state.turns.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {state.softWarning && state.remainingMessages !== null && (
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="outline" className="border-amber-400/50 text-amber-600">
            {state.remainingMessages} questions left this month
          </Badge>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-insights/10">
              <MessageSquareText className="h-6 w-6 text-brand-insights" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Ask anything about your calls</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Answers come straight from your call data — every number is pulled live, and claims
                link back to the calls behind them.
              </p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal py-1.5 text-xs font-normal"
                  onClick={() => send(suggestion)}
                >
                  <Sparkles className="mr-1 h-3 w-3 text-brand-insights" />
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-4">
            {state.turns.map((turn) => (
              <ChatMessage key={turn.id} turn={turn} />
            ))}
          </div>
        )}
      </div>

      <div className="pt-3">
        <ChatInput
          disabled={!hotelId}
          streaming={state.streaming}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
        />
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Answers are generated from your reporting data. Numbers match your dashboards.
        </p>
      </div>
    </div>
  )
}
