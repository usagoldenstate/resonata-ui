"use client"

import { Fragment, useEffect, useState } from "react"
import useSWR from "swr"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangeFilter } from "@/components/date-range-filter"
import { RefreshButton } from "@/components/refresh-button"
import { Sidebar } from "@/components/sidebar"
import {
  ApiError,
  type ChatChannel,
  type ChatMessage,
  fetchChatConversation,
  fetchChatConversations,
} from "@/lib/api"
import { dateRangeError, formatShortDate, rangeForTimespan } from "@/lib/date-range"
import { useHotel } from "@/lib/hotel-context"

const PAGE_SIZE = 50

const channelFilterOptions: Array<{ value: "all" | ChatChannel; label: string }> = [
  { value: "all", label: "All channels" },
  { value: "web", label: "Website" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook_comment", label: "Facebook comments" },
  { value: "instagram_comment", label: "Instagram comments" },
]

const channelBadges: Record<ChatChannel, { label: string; className: string }> = {
  web: { label: "Website", className: "bg-muted text-muted-foreground" },
  messenger: { label: "Messenger", className: "bg-primary/10 text-primary" },
  instagram: { label: "Instagram", className: "bg-primary/10 text-primary" },
  facebook_comment: { label: "Facebook comment", className: "bg-warning/10 text-warning" },
  instagram_comment: { label: "Instagram comment", className: "bg-warning/10 text-warning" },
}

function ChannelBadge({ channel }: { channel: ChatChannel }) {
  const badge = channelBadges[channel]
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  )
}

// Backend datetimes are naive UTC (no zone suffix) — pin them to UTC so the
// browser renders them in the hotel's time instead of misreading them.
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

// A short note under a message the guest never saw, or the agent never
// answered. On an agent message "failed" means it was not delivered; on a
// guest message "skipped" means the agent chose not to reply (staff took over,
// or a public comment it left alone) and "failed" means it could not answer.
function messageNote(message: ChatMessage): string | null {
  if (message.role === "assistant") return message.status === "failed" ? "not delivered" : null
  if (message.status === "skipped") return "no reply"
  if (message.status === "failed") return "could not answer"
  return null
}

function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-3 max-h-80 overflow-y-auto">
      {messages.map((message) => {
        const note = messageNote(message)
        return (
          <div key={message.id} className="flex gap-3">
            <span
              className={`text-xs font-medium px-2 py-1 rounded shrink-0 self-start ${
                message.role === "assistant" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
              }`}
            >
              {message.role === "assistant" ? "Agent" : "Guest"}
            </span>
            <div>
              {message.text === null ? (
                <p className="text-sm italic text-muted-foreground">Removed</p>
              ) : (
                <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-line">{message.text}</p>
              )}
              {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ChatConversationsPage() {
  const { hotelId, hotelTimezone, scopeLabel, loading: hotelLoading, accessState } = useHotel()

  const [channelFilter, setChannelFilter] = useState<"all" | ChatChannel>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  // "All time" is the default: the list shows every conversation unless a
  // window is chosen.
  const [dateTimespan, setDateTimespan] = useState("all")
  const [offset, setOffset] = useState(0)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const selectDateTimespan = (value: string) => {
    // Presets resolve to concrete dates ("All time" to empty ones, which the
    // request omits); custom keeps whatever the inputs hold.
    if (value !== "custom") {
      const range = rangeForTimespan(value, hotelTimezone)
      setDateFrom(range.start)
      setDateTo(range.end)
    }
    setDateTimespan(value)
  }

  // Custom ranges may be open-ended (only a from or only a to date), so
  // validate only when both ends are set and derive a label for the partials.
  const dateFilterError =
    dateTimespan === "custom" && dateFrom && dateTo ? dateRangeError(dateFrom, dateTo) : null
  const dateFilterLabel =
    dateTimespan === "custom" && !(dateFrom && dateTo)
      ? dateFrom
        ? `From ${formatShortDate(dateFrom)}`
        : dateTo
          ? `Until ${formatShortDate(dateTo)}`
          : "Custom range"
      : undefined

  // Any filter or hotel change restarts pagination from the first page.
  useEffect(() => {
    setOffset(0)
    setExpandedRow(null)
  }, [hotelId, channelFilter, dateFrom, dateTo])

  const {
    data: page,
    isValidating: loading,
    error: errorRaw,
    mutate: refreshList,
  } = useSWR(
    hotelId && !dateFilterError
      ? (["chat-conversations", hotelId, offset, channelFilter, dateFrom, dateTo] as const)
      : null,
    ([, id, off, channel, from, to]) =>
      fetchChatConversations({
        hotel_id: id,
        limit: PAGE_SIZE,
        offset: off,
        channel: channel === "all" ? undefined : channel,
        date_from: from || undefined,
        date_to: to || undefined,
      }),
  )
  const error = errorRaw ? describeError(errorRaw) : null

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshList()
    } finally {
      setRefreshing(false)
    }
  }

  // Cached per conversation id, so re-expanding a row shows the transcript
  // instantly.
  const {
    data: detail,
    isLoading: detailLoading,
    error: detailErrorRaw,
  } = useSWR(expandedRow ? (["chat-conversation", expandedRow] as const) : null, ([, id]) =>
    fetchChatConversation(id),
  )

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id))
  }

  const items = page?.items ?? []
  const total = page?.total ?? 0
  const hasFilters = channelFilter !== "all" || dateFrom !== "" || dateTo !== ""

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="app-content flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="app-eyebrow mb-2">Conversations</p>
            <h1 className="text-2xl font-semibold text-foreground">Chat conversations</h1>
            <p className="text-sm text-muted-foreground">
              Guest chats from the website, Messenger, Instagram and public comments.
            </p>
            {scopeLabel && (
              <p className="text-sm text-muted-foreground mt-1">{scopeLabel}</p>
            )}
          </div>
          <RefreshButton onRefresh={handleRefresh} refreshing={refreshing} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Select
            value={channelFilter}
            onValueChange={(value) => setChannelFilter(value as "all" | ChatChannel)}
          >
            <SelectTrigger className="w-52 bg-card border-border" aria-label="Channel">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              {channelFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangeFilter
            variant="toolbar"
            timespan={dateTimespan}
            range={{ start: dateFrom, end: dateTo }}
            customStart={dateFrom}
            customEnd={dateTo}
            rangeError={dateFilterError}
            label={dateFilterLabel}
            onSelectTimespan={selectDateTimespan}
            onCustomStart={setDateFrom}
            onCustomEnd={setDateTo}
          />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setChannelFilter("all")
                setDateFrom("")
                setDateTo("")
                setDateTimespan("all")
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Conversations Table */}
        <Card className="overflow-hidden border-border py-0">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full">
              <thead className="bg-muted/50 [&_th]:whitespace-nowrap">
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="p-4 font-medium">Started</th>
                  <th className="p-4 font-medium">Channel</th>
                  <th className="p-4 font-medium">Guest</th>
                  <th className="p-4 font-medium">First message</th>
                  <th className="p-4 font-medium">Messages</th>
                  <th className="p-4 font-medium">Links sent</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((conversation) => {
                  const startedAt = parseUtc(conversation.created_at)
                  const expanded = expandedRow === conversation.id
                  return (
                    <Fragment key={conversation.id}>
                      <tr
                        onClick={() => toggleRow(conversation.id)}
                        className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${expanded ? "bg-muted/30" : ""}`}
                      >
                        <td className="p-4 whitespace-nowrap font-medium text-card-foreground">
                          <div className="flex items-center gap-2">
                            {expanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                            {startedAt.toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: hotelTimezone || undefined,
                            })}
                          </div>
                        </td>
                        <td className="p-4">
                          <ChannelBadge channel={conversation.channel} />
                        </td>
                        <td className="p-4 whitespace-nowrap text-card-foreground">
                          {conversation.guest_name || "Guest"}
                        </td>
                        <td className="p-4 text-muted-foreground max-w-xs">
                          <p className="truncate">{conversation.preview || "—"}</p>
                        </td>
                        <td className="p-4 text-muted-foreground tabular-nums">
                          {conversation.guest_message_count}
                        </td>
                        <td className="p-4 text-muted-foreground tabular-nums">
                          {conversation.links_sent}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={6} className="p-0">
                            <div className="p-6 border-b border-border">
                              <h4 className="text-sm font-semibold text-foreground mb-4">
                                Conversation
                              </h4>
                              {detailLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Loading conversation…
                                </div>
                              ) : detailErrorRaw ? (
                                <p className="text-sm text-destructive">{describeError(detailErrorRaw)}</p>
                              ) : detail && detail.messages.length > 0 ? (
                                <ChatTranscript messages={detail.messages} />
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No messages in this conversation.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>

            {loading || hotelLoading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading conversations…
              </div>
            ) : error ? (
              <div className="p-8 text-center text-destructive">{error}</div>
            ) : !hotelId ? (
              <div className="p-8 text-center text-muted-foreground">
                {accessState === "no-access"
                  ? "Your account isn't set up for any hotels yet. Contact Resonata to have your account configured."
                  : "Select a hotel to view its chat conversations."}
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {hasFilters
                  ? "No conversations found matching your criteria."
                  : "No chat conversations yet."}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex flex-wrap gap-3 items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            {total > 0
              ? `Showing ${(offset + 1).toLocaleString()}–${(offset + items.length).toLocaleString()} of ${total.toLocaleString()} conversations`
              : "Showing 0 conversations"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
