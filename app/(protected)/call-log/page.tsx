"use client"

import { Suspense, useEffect, useState, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Loader2, Phone, Search, X } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangeFilter, makePresets } from "@/components/date-range-filter"
import { RefreshButton } from "@/components/refresh-button"
import { Sidebar } from "@/components/sidebar"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  ApiError,
  type CallListItem,
  type CallOutcomeFilter,
  deleteCall,
  fetchCallDetail,
  fetchCallRecording,
  fetchCalls,
  fetchNotBookedTaxonomy,
} from "@/lib/api"
import { useCurrentUser } from "@/lib/current-user-context"
import { dateRangeError, formatShortDate, rangeForLastDays } from "@/lib/date-range"
import { useHotel } from "@/lib/hotel-context"

const PAGE_SIZE = 50

// "All time" is the default: the call log lists every call unless a window is
// chosen, unlike the reporting pages' rolling 30-day default.
const datePresets = makePresets(["all", "7", "30", "90"])

const outcomeFilterOptions: Array<{ value: "all" | CallOutcomeFilter; label: string }> = [
  { value: "all", label: "All outcomes" },
  { value: "booked", label: "Booked" },
  { value: "link_sent", label: "Link Sent" },
  { value: "not_booked", label: "Not Booked" },
  { value: "not_bookable", label: "Not Bookable" },
  { value: "pending", label: "Pending" },
]

const outcomeFilterValues = new Set(outcomeFilterOptions.map((o) => o.value))

// Mirrors the backend's not-booked taxonomy categories.
const notBookedReasonOptions = ["Price", "Availability", "Amenities", "Policy", "Other"]

type OutcomeLabel = "Booked" | "Link Sent" | "Not Booked" | "Not Bookable" | "Pending"

// Same precedence as the backend's outcome filter (api/router.py), so a row's
// badge always matches the filter bucket that returned it. "Booked" comes from
// the server-derived attribution flag — the classifier no longer writes
// booking_made.
function deriveOutcome(call: CallListItem): OutcomeLabel {
  if (call.booked) return "Booked"
  const analytics = call.analytics
  if (analytics?.booking_link_sent) return "Link Sent"
  if (analytics?.outcome === "not_bookable") return "Not Bookable"
  if (analytics?.status === "done") return "Not Booked"
  return "Pending"
}

function OutcomeBadge({ outcome }: { outcome: OutcomeLabel }) {
  const styles: Record<OutcomeLabel, string> = {
    Booked: "bg-[#6b7a4a]/10 text-[#6b7a4a] border border-[#6b7a4a]/20",
    "Link Sent": "bg-[#c4a84b]/10 text-[#a08930] border border-[#c4a84b]/20 whitespace-nowrap",
    "Not Booked": "bg-[#9ca3af]/10 text-[#6b7280] border border-[#9ca3af]/20 whitespace-nowrap",
    "Not Bookable": "bg-muted text-muted-foreground border border-border whitespace-nowrap",
    Pending: "bg-muted text-muted-foreground border border-border",
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[outcome]}`}>
      {outcome}
    </span>
  )
}

// Call ID cell — clicking copies the provider call id to the clipboard.
// stopPropagation keeps the click from toggling the row's transcript panel.
function CopyableCallId({ callId }: { callId: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(callId)
      setCopied(true)
      toast.success("Call ID copied")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy Call ID")
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${callId}`}
      className="group flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors max-w-[12rem]"
    >
      <span className="truncate">{callId}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 shrink-0 text-[#6b7a4a]" />
      ) : (
        <Copy className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}

// Backend datetimes are naive UTC (no zone suffix) — pin them to UTC so the
// browser renders them in the viewer's local time instead of misreading them.
function parseUtc(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`)
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—"
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// Caller ID is stored E.164. Pretty-print US/Canada (+1) numbers as
// (AAA) BBB-CCCC; leave any other country's number as-is. Null = the caller
// withheld/blocked their number (or the row was erased).
function formatCallerPhone(e164: string | null): string {
  if (!e164) return "—"
  const us = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  if (us) return `(${us[1]}) ${us[2]}-${us[3]}`
  return e164
}

type TranscriptTurn = { speaker: "Agent" | "Guest" | "System"; text: string }

// The backend stores transcripts as "User: ..." / "Assistant: ..." lines
// (voice/realtime/transcript.py::render). Unprefixed lines are continuations
// of the previous turn.
function parseTranscript(raw: string | null): TranscriptTurn[] {
  if (!raw) return []
  const turns: TranscriptTurn[] = []
  for (const line of raw.split("\n")) {
    const match = line.match(/^(User|Assistant):\s?(.*)$/)
    if (match) {
      turns.push({ speaker: match[1] === "User" ? "Guest" : "Agent", text: match[2] })
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += `\n${line}`
    } else if (line.trim()) {
      turns.push({ speaker: "System", text: line })
    }
  }
  return turns
}

type TranscriptState = {
  loading: boolean
  turns: TranscriptTurn[] | null
  error: string | null
  hasRecording: boolean
}

// Self-contained recording player: fetches the audio blob through the authed
// proxy (cached by SWR, so re-expanding a row plays instantly without
// refetching) and plays it with the native <audio> controls. The object URL
// is local — created whenever the cached blob changes and revoked on cleanup,
// so it's freed both when the blob changes and when the row collapses and
// this unmounts.
function CallRecordingPlayer({ callId }: { callId: string }) {
  const {
    data: blob,
    isLoading,
    error,
  } = useSWR(["call-recording", callId] as const, ([, id]) => fetchCallRecording(id))
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

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

// useSearchParams requires a Suspense boundary during prerender, so the page
// component just wraps the real one.
export default function CallLogPage() {
  return (
    <Suspense fallback={null}>
      <CallLogPageInner />
    </Suspense>
  )
}

function CallLogPageInner() {
  const { hotelId, hotels, hotelTimezone, loading: hotelLoading, accessState } = useHotel()
  const hotelName = hotels.find((h) => h.hotel_id === hotelId)?.display_name
  const { isPlatformAdmin } = useCurrentUser()

  // Filters can arrive via URL params (drill-through from the Not Booked
  // Reasons page); they seed the initial state only.
  const searchParams = useSearchParams()
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | CallOutcomeFilter>(() => {
    const param = searchParams.get("outcome")
    return param && outcomeFilterValues.has(param as CallOutcomeFilter)
      ? (param as CallOutcomeFilter)
      : "all"
  })
  const [notBookedReasonFilter, setNotBookedReasonFilter] = useState(
    () => searchParams.get("not_booked_reason") ?? "all",
  )
  const [notBookedSubcategoryFilter, setNotBookedSubcategoryFilter] = useState(
    () => searchParams.get("not_booked_subcategory") ?? "all",
  )
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("date_from") ?? "")
  const [dateTo, setDateTo] = useState(() => searchParams.get("date_to") ?? "")
  // Drill-through URLs carry explicit dates, so they land in custom mode;
  // otherwise the log starts unfiltered ("All time").
  const [dateTimespan, setDateTimespan] = useState(() =>
    searchParams.get("date_from") || searchParams.get("date_to") ? "custom" : "all",
  )
  const [callIdSearch, setCallIdSearch] = useState(() => searchParams.get("call_id") ?? "")
  const [offset, setOffset] = useState(0)

  // Debounce the Call ID box so we query once the user pauses, not per keystroke.
  const debouncedCallId = useDebouncedValue(callIdSearch, 300)

  const selectDateTimespan = (value: string) => {
    if (value === "all") {
      setDateFrom("")
      setDateTo("")
    } else if (value !== "custom") {
      const range = rangeForLastDays(Number(value), hotelTimezone)
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

  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Subcategory options come from the backend taxonomy (same source the
  // reporting pages use), scoped to the selected category. Non-fatal on
  // failure — the dropdown just stays empty, so the error is ignored.
  const { data: taxonomy } = useSWR(
    hotelId ? (["call-log-taxonomy", hotelId] as const) : null,
    ([, hid]) => fetchNotBookedTaxonomy({ hotel_id: hid }).then((response) => response.categories),
  )
  const subcategoryOptions =
    (taxonomy ?? []).find((c) => c.name === notBookedReasonFilter)?.subcategories ?? []

  // Any filter or hotel change restarts pagination from the first page.
  useEffect(() => {
    setOffset(0)
    setExpandedRow(null)
  }, [hotelId, outcomeFilter, notBookedReasonFilter, notBookedSubcategoryFilter, dateFrom, dateTo, debouncedCallId])

  const listKey = hotelId
    ? ([
        "call-log",
        hotelId,
        offset,
        outcomeFilter,
        notBookedReasonFilter,
        notBookedSubcategoryFilter,
        dateFrom,
        dateTo,
        debouncedCallId,
      ] as const)
    : null
  const {
    data: page,
    isValidating: loading,
    error: errorRaw,
    mutate: refreshCalls,
  } = useSWR(listKey, ([, hid, off, outcome, reason, subcategory, from, to, callId]) =>
    fetchCalls({
      hotel_id: hid,
      limit: PAGE_SIZE,
      offset: off,
      outcome: outcome === "all" ? undefined : outcome,
      not_booked_reason: reason === "all" ? undefined : reason,
      not_booked_subcategory: subcategory === "all" ? undefined : subcategory,
      date_from: from || undefined,
      date_to: to || undefined,
      call_id: callId.trim() || undefined,
    }),
  )
  const error = errorRaw ? describeError(errorRaw) : null

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshCalls()
    } finally {
      setRefreshing(false)
    }
  }

  // Cached per call id, so re-expanding a previously viewed row (even after
  // navigating away and back) shows the transcript instantly.
  const {
    data: transcriptDetail,
    isLoading: transcriptLoading,
    error: transcriptErrorRaw,
  } = useSWR(expandedRow ? (["call-transcript", expandedRow] as const) : null, ([, id]) =>
    fetchCallDetail(id),
  )
  const transcriptForExpandedRow: TranscriptState | null = expandedRow
    ? {
        loading: transcriptLoading,
        turns: transcriptDetail ? parseTranscript(transcriptDetail.transcript) : null,
        error: transcriptErrorRaw ? describeError(transcriptErrorRaw) : null,
        hasRecording: transcriptDetail?.has_recording ?? false,
      }
    : null

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id))
  }

  // Deletion is a two-step flow: the row's "x" only stages the call here
  // (opening the confirmation dialog); the actual DELETE fires from the
  // dialog's confirm action.
  const [pendingDelete, setPendingDelete] = useState<CallListItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const call = pendingDelete
    setPendingDelete(null)
    setDeletingId(call.id)
    try {
      await deleteCall(call.id)
      setExpandedRow((prev) => (prev === call.id ? null : prev))
      toast.success("Call deleted")
      await refreshCalls()
    } catch (err) {
      toast.error(describeError(err))
    } finally {
      setDeletingId(null)
    }
  }

  const items = page?.items ?? []
  const total = page?.total ?? 0
  const hasFilters =
    outcomeFilter !== "all" ||
    notBookedReasonFilter !== "all" ||
    notBookedSubcategoryFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    callIdSearch.trim() !== ""

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Call Log</h2>
            {hotelName && (
              <p className="text-sm text-muted-foreground mt-1">{hotelName}</p>
            )}
          </div>
          <RefreshButton onRefresh={handleRefresh} refreshing={refreshing} />
        </div>

        {/* Stats Summary */}
        <div className="flex flex-wrap gap-4 mb-6">
          <Card className="border-border flex-shrink-0">
            <CardContent className="p-4 pr-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-card-foreground">{total}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasFilters ? "Matching Calls" : "Total Calls"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={callIdSearch}
              onChange={(e) => setCallIdSearch(e.target.value)}
              placeholder="Search by Call ID"
              className="w-64 bg-card border-border pl-9 pr-8 text-sm"
            />
            {callIdSearch && (
              <button
                type="button"
                onClick={() => setCallIdSearch("")}
                title="Clear Call ID search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select
            value={outcomeFilter}
            onValueChange={(value) => setOutcomeFilter(value as "all" | CallOutcomeFilter)}
          >
            <SelectTrigger className="w-44 bg-card border-border">
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              {outcomeFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={notBookedReasonFilter}
            onValueChange={(value) => {
              setNotBookedReasonFilter(value)
              setNotBookedSubcategoryFilter("all")
            }}
          >
            <SelectTrigger className="w-52 bg-card border-border">
              <SelectValue placeholder="Not booked reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Not booked reasons</SelectItem>
              {notBookedReasonOptions.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {notBookedReasonFilter !== "all" && subcategoryOptions.length > 0 && (
            <Select
              value={notBookedSubcategoryFilter}
              onValueChange={setNotBookedSubcategoryFilter}
            >
              <SelectTrigger className="w-64 bg-card border-border">
                <SelectValue placeholder="All subcategories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subcategories</SelectItem>
                {subcategoryOptions.map((sub) => (
                  <SelectItem key={sub} value={sub}>
                    {sub}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Call-date range */}
          <DateRangeFilter
            variant="toolbar"
            presets={datePresets}
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
                setOutcomeFilter("all")
                setNotBookedReasonFilter("all")
                setNotBookedSubcategoryFilter("all")
                setDateFrom("")
                setDateTo("")
                setDateTimespan("all")
                setCallIdSearch("")
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Calls Table */}
        <Card className="border-border">
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="p-4 font-medium">Call Date</th>
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">Caller</th>
                  <th className="p-4 font-medium">Call ID</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Outcome</th>
                  <th className="p-4 font-medium">Not Booked Reason</th>
                  <th className="p-4 font-medium">Notes</th>
                  {isPlatformAdmin && (
                    <th className="p-4 font-medium">
                      <span className="sr-only">Delete</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((call) => {
                  const startedAt = parseUtc(call.created_at)
                  const outcome = deriveOutcome(call)
                  const transcript = expandedRow === call.id ? transcriptForExpandedRow : null
                  return (
                    <Fragment key={call.id}>
                      <tr
                        onClick={() => toggleRow(call.id)}
                        className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${expandedRow === call.id ? "bg-muted/30" : ""}`}
                      >
                        <td className="p-4 font-medium text-card-foreground">
                          <div className="flex items-center gap-2">
                            {expandedRow === call.id ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                            {startedAt.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {startedAt.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="p-4 text-card-foreground tabular-nums whitespace-nowrap">
                          {formatCallerPhone(call.caller_phone_e164)}
                        </td>
                        <td className="p-4">
                          <CopyableCallId callId={call.provider_call_id} />
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {formatDuration(call.duration_seconds)}
                        </td>
                        <td className="p-4">
                          <OutcomeBadge outcome={outcome} />
                        </td>
                        <td className="p-4">
                          {call.analytics?.not_booked_reason_category ? (
                            <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {call.analytics.not_booked_reason_category}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground max-w-xs truncate">
                          {call.summary ?? "—"}
                        </td>
                        {isPlatformAdmin && (
                          <td className="p-4">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete call ${call.provider_call_id}`}
                              title="Delete call"
                              disabled={deletingId !== null}
                              onClick={(e) => {
                                // The row's own click expands the transcript.
                                e.stopPropagation()
                                setPendingDelete(call)
                              }}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              {deletingId === call.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                            </Button>
                          </td>
                        )}
                      </tr>
                      {expandedRow === call.id && (
                        <tr key={`${call.id}-transcript`} className="bg-muted/20">
                          <td colSpan={isPlatformAdmin ? 9 : 8} className="p-0">
                            <div className="p-6 border-b border-border">
                              {transcript?.hasRecording && (
                                <div className="mb-6">
                                  <h4 className="text-sm font-semibold text-foreground mb-3">
                                    Recording
                                  </h4>
                                  <CallRecordingPlayer callId={call.id} />
                                </div>
                              )}
                              <h4 className="text-sm font-semibold text-foreground mb-4">
                                Call Transcript
                              </h4>
                              {transcript?.loading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Loading transcript…
                                </div>
                              ) : transcript?.error ? (
                                <p className="text-sm text-destructive">{transcript.error}</p>
                              ) : transcript?.turns && transcript.turns.length > 0 ? (
                                <div className="space-y-3 max-h-80 overflow-y-auto">
                                  {transcript.turns.map((line, idx) => (
                                    <div key={idx} className="flex gap-3">
                                      <span
                                        className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${
                                          line.speaker === "Agent"
                                            ? "bg-[#6b7a4a]/10 text-[#6b7a4a]"
                                            : line.speaker === "Guest"
                                              ? "bg-[#c4a84b]/10 text-[#a08930]"
                                              : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {line.speaker}
                                      </span>
                                      <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-line">
                                        {line.text}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No transcript available for this call.
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
                Loading calls…
              </div>
            ) : error ? (
              <div className="p-8 text-center text-destructive">{error}</div>
            ) : !hotelId ? (
              <div className="p-8 text-center text-muted-foreground">
                {accessState === "no-access"
                  ? "Your account isn't set up for any hotels yet. Contact Resonata to have your account configured."
                  : "Select a hotel to view its calls."}
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {hasFilters ? "No calls found matching your criteria." : "No calls yet."}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            {total > 0
              ? `Showing ${offset + 1}–${offset + items.length} of ${total} calls`
              : "Showing 0 calls"}
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

        {/* Delete confirmation — one shared dialog; the "x" buttons only stage
            a call into pendingDelete, so deletion always passes through here. */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this call?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete && (
                  <>
                    This permanently deletes the call from{" "}
                    {parseUtc(pendingDelete.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    (Call ID{" "}
                    <span className="font-mono text-xs">{pendingDelete.provider_call_id}</span>
                    ), including its transcript, recording, analytics, and survey
                    responses. This cannot be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void confirmDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete call
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
