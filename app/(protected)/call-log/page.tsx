"use client"

import { Suspense, useEffect, useState, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Loader2, Phone } from "lucide-react"
import { toast } from "sonner"
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
import { Sidebar } from "@/components/sidebar"
import {
  ApiError,
  type CallListItem,
  type CallListPage,
  type CallOutcomeFilter,
  type NotBookedTaxonomyCategory,
  fetchCallDetail,
  fetchCallRecording,
  fetchCalls,
  fetchNotBookedTaxonomy,
} from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

const PAGE_SIZE = 50

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
// proxy, plays it with the native <audio> controls, and revokes the object URL on
// unmount. The expanded row is conditionally rendered, so collapsing it unmounts
// this and frees the blob.
function CallRecordingPlayer({ callId }: { callId: string }) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; error: string | null }>({
    url: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setState({ url: null, loading: true, error: null })
    fetchCallRecording(callId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return
        setState({ url: null, loading: false, error: describeError(err) })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [callId])

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading recording…
      </div>
    )
  }
  if (state.error) {
    return <p className="text-sm text-destructive">{state.error}</p>
  }
  if (!state.url) return null
  return <audio controls src={state.url} className="w-full" />
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
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
  const { hotelId, hotels, loading: hotelLoading, accessState } = useHotel()
  const hotelName = hotels.find((h) => h.hotel_id === hotelId)?.display_name

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
  const [offset, setOffset] = useState(0)

  const [page, setPage] = useState<CallListPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptState>>({})

  // Subcategory options come from the backend taxonomy (same source the
  // reporting pages use), scoped to the selected category.
  const [taxonomy, setTaxonomy] = useState<NotBookedTaxonomyCategory[]>([])
  useEffect(() => {
    if (!hotelId) {
      setTaxonomy([])
      return
    }
    const controller = new AbortController()
    fetchNotBookedTaxonomy({ hotel_id: hotelId }, { signal: controller.signal })
      .then((data) => setTaxonomy(data.categories))
      .catch((err: unknown) => {
        if (isAbortError(err)) return
        // Non-fatal: the subcategory dropdown just stays empty.
        setTaxonomy([])
      })
    return () => controller.abort()
  }, [hotelId])

  const subcategoryOptions =
    taxonomy.find((c) => c.name === notBookedReasonFilter)?.subcategories ?? []

  // Any filter or hotel change restarts pagination from the first page.
  useEffect(() => {
    setOffset(0)
    setExpandedRow(null)
  }, [hotelId, outcomeFilter, notBookedReasonFilter, notBookedSubcategoryFilter, dateFrom, dateTo])

  useEffect(() => {
    if (!hotelId) {
      setPage(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchCalls(
      {
        hotel_id: hotelId,
        limit: PAGE_SIZE,
        offset,
        outcome: outcomeFilter === "all" ? undefined : outcomeFilter,
        not_booked_reason:
          notBookedReasonFilter === "all" ? undefined : notBookedReasonFilter,
        not_booked_subcategory:
          notBookedSubcategoryFilter === "all" ? undefined : notBookedSubcategoryFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        setPage(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return
        setError(describeError(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [
    hotelId,
    offset,
    outcomeFilter,
    notBookedReasonFilter,
    notBookedSubcategoryFilter,
    dateFrom,
    dateTo,
  ])

  const toggleRow = (id: string) => {
    const next = expandedRow === id ? null : id
    setExpandedRow(next)
    if (next && !transcripts[next]) {
      setTranscripts((prev) => ({
        ...prev,
        [next]: { loading: true, turns: null, error: null, hasRecording: false },
      }))
      fetchCallDetail(next)
        .then((detail) =>
          setTranscripts((prev) => ({
            ...prev,
            [next]: {
              loading: false,
              turns: parseTranscript(detail.transcript),
              error: null,
              hasRecording: detail.has_recording,
            },
          })),
        )
        .catch((err: unknown) =>
          setTranscripts((prev) => ({
            ...prev,
            [next]: { loading: false, turns: null, error: describeError(err), hasRecording: false },
          })),
        )
    }
  }

  const items = page?.items ?? []
  const total = page?.total ?? 0
  const hasFilters =
    outcomeFilter !== "all" ||
    notBookedReasonFilter !== "all" ||
    notBookedSubcategoryFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== ""

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
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 bg-card border-border text-sm"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 bg-card border-border text-sm"
            />
          </div>

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
                  <th className="p-4 font-medium">Call ID</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Outcome</th>
                  <th className="p-4 font-medium">Not Booked Reason</th>
                  <th className="p-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((call) => {
                  const startedAt = parseUtc(call.created_at)
                  const outcome = deriveOutcome(call)
                  const transcript = transcripts[call.id]
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
                      </tr>
                      {expandedRow === call.id && (
                        <tr key={`${call.id}-transcript`} className="bg-muted/20">
                          <td colSpan={7} className="p-0">
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
      </main>
    </div>
  )
}
