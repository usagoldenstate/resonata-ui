"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  MessageSquare,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { RefreshButton } from "@/components/refresh-button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"
import { ApiError, type FaqResponse, fetchFaqs } from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

// Presentation-only: stable color per category name (matches the backend's
// FAQ_CATEGORIES closed set). Unknown names fall back to a neutral tone.
const CATEGORY_BADGE: Record<string, string> = {
  Pricing: "bg-[#c4a84b]/10 text-[#a08930]",
  Booking: "bg-[#6b7a4a]/10 text-[#6b7a4a]",
  Policies: "bg-[#8b5a3c]/10 text-[#8b5a3c]",
  Amenities: "bg-blue-500/10 text-blue-600",
  Services: "bg-purple-500/10 text-purple-600",
  Other: "bg-muted text-muted-foreground",
}
const DEFAULT_BADGE = "bg-muted text-muted-foreground"

const GAPS_PER_PAGE = 5
const QUESTIONS_PER_PAGE = 20

type LoadState<T> = {
  loading: boolean
  data: T | null
  error: string | null
}

export default function FAQsPage() {
  const {
    hotelId,
    hotels,
    loading: hotelLoading,
    error: hotelError,
    accessState,
  } = useHotel()

  const [timespan, setTimespan] = useState("30")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [sortOrder, setSortOrder] = useState<"most" | "least">("most")
  const [gapsPage, setGapsPage] = useState(0)
  const [questionsPage, setQuestionsPage] = useState(0)

  const range = useMemo(() => rangeForTimespan(timespan), [timespan])

  // Reset the category filter when the hotel changes — its category set differs.
  useEffect(() => {
    setCategoryFilter("All")
  }, [hotelId])

  // Reset coverage-gaps pagination whenever the underlying data window changes.
  useEffect(() => {
    setGapsPage(0)
  }, [hotelId, range.start, range.end])

  // Reset question-list pagination whenever the filtered/sorted set changes.
  useEffect(() => {
    setQuestionsPage(0)
  }, [hotelId, range.start, range.end, searchQuery, categoryFilter, sortOrder])

  const {
    data: faqsData,
    isLoading: faqsLoading,
    error: faqsErrorRaw,
    mutate: refreshFaqs,
  } = useSWR(
    hotelId ? (["faqs", hotelId, range.start, range.end] as const) : null,
    ([, hid, start, end]) => fetchFaqs({ hotel_id: hid, start_date: start, end_date: end }),
  )
  const faqs: LoadState<FaqResponse> = {
    loading: faqsLoading,
    data: faqsData ?? null,
    error: faqsErrorRaw ? describeError(faqsErrorRaw) : null,
  }

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshFaqs()
    } finally {
      setRefreshing(false)
    }
  }

  const data = faqs.data
  const hotelName = hotels.find((h) => h.hotel_id === hotelId)?.display_name ?? null

  // Categories that actually appear, for the filter dropdown.
  const categoryOptions = useMemo(() => {
    const present = (data?.categories ?? []).filter((c) => c.count > 0).map((c) => c.category)
    return ["All", ...present]
  }, [data])

  // The full list is already sorted desc by the backend; the top question
  // highlight uses that (most-asked) regardless of the user's sort choice.
  const topQuestion = data?.questions[0] ?? null

  const visibleQuestions = useMemo(() => {
    const all = data?.questions ?? []
    const q = searchQuery.trim().toLowerCase()
    const filtered = all.filter((item) => {
      const matchesSearch = q === "" || item.question.toLowerCase().includes(q)
      const matchesCategory = categoryFilter === "All" || item.category === categoryFilter
      return matchesSearch && matchesCategory
    })
    // Backend order is count desc; reverse for "least common first".
    return sortOrder === "most" ? filtered : [...filtered].reverse()
  }, [data, searchQuery, categoryFilter, sortOrder])

  const priorDelta = useMemo(() => {
    if (!data || data.prior_period_total <= 0) return null
    return Math.round(
      ((data.total_questions - data.prior_period_total) / data.prior_period_total) * 100,
    )
  }, [data])

  const coverageGaps = data?.coverage_gaps ?? []
  const totalGapPages = Math.max(1, Math.ceil(coverageGaps.length / GAPS_PER_PAGE))
  // Clamp in case the list shrank (e.g. a shorter timespan) below the current page.
  const safeGapsPage = Math.min(gapsPage, totalGapPages - 1)
  const pagedGaps = coverageGaps.slice(
    safeGapsPage * GAPS_PER_PAGE,
    safeGapsPage * GAPS_PER_PAGE + GAPS_PER_PAGE,
  )
  const totalQuestionPages = Math.max(1, Math.ceil(visibleQuestions.length / QUESTIONS_PER_PAGE))
  // Clamp in case the filtered list shrank below the current page.
  const safeQuestionsPage = Math.min(questionsPage, totalQuestionPages - 1)
  const questionsPageStart = safeQuestionsPage * QUESTIONS_PER_PAGE
  const pagedQuestions = visibleQuestions.slice(
    questionsPageStart,
    questionsPageStart + QUESTIONS_PER_PAGE,
  )

  const isEmpty = data !== null && data.total_questions === 0

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Frequently Asked Questions</h2>
            <div className="flex items-center gap-1 mt-1">
              <Select value={timespan} onValueChange={setTimespan}>
                <SelectTrigger className="h-auto p-0 border-0 bg-transparent shadow-none text-sm text-muted-foreground hover:text-foreground focus:ring-0 w-auto gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timespanOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hotelName ? (
                <span className="text-sm text-muted-foreground">· {hotelName}</span>
              ) : null}
            </div>
          </div>
          <RefreshButton onRefresh={handleRefresh} refreshing={refreshing} />
        </div>

        {hotelLoading ? (
          <Notice tone="muted" message="Loading hotel selection..." />
        ) : hotelError ? (
          <Notice tone="error" message={hotelError} />
        ) : !hotelId ? (
          <Notice
            tone="muted"
            message={
              accessState === "no-access"
                ? "Your account isn't set up for any hotels yet. Contact Resonata to have your account configured."
                : "Select a hotel to view guest questions."
            }
          />
        ) : null}

        {faqs.error ? <Notice tone="error" message={faqs.error} /> : null}
        {faqs.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading guest questions...
          </div>
        ) : null}
        {isEmpty ? (
          <Notice
            tone="muted"
            message="No guest questions recorded in this date range yet. Questions appear here once calls are analyzed."
          />
        ) : null}

        {data && data.total_questions > 0 ? (
          <>
            {/* Top Question Highlight */}
            {topQuestion ? (
              <Card className="border-border bg-[#6b7a4a]/5 mb-6">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#6b7a4a] flex items-center justify-center flex-shrink-0">
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-[#6b7a4a] uppercase tracking-wide">
                          Most Asked Question
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {topQuestion.count.toLocaleString()}{" "}
                          {topQuestion.count === 1 ? "mention" : "mentions"}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-card-foreground">
                        {topQuestion.question}
                      </h3>
                      <span
                        className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${
                          CATEGORY_BADGE[topQuestion.category] ?? DEFAULT_BADGE
                        }`}
                      >
                        {topQuestion.category}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Stats Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6 max-w-xl">
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-[#6b7a4a]" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-card-foreground">
                        {data.unique_questions.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Unique Questions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                      <span className="text-[#6b7a4a] font-semibold text-sm">#</span>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-card-foreground">
                        {data.total_questions.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        Total Mentions
                        {priorDelta !== null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              priorDelta > 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"
                            }`}
                          >
                            {priorDelta > 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {Math.abs(priorDelta)}% vs prior
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Category breakdown */}
            <Card className="border-border mb-6">
              <CardContent className="p-5">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                  Questions by Category
                </h3>
                <div className="space-y-3">
                  {data.categories
                    .filter((c) => c.count > 0)
                    .map((c) => (
                      <button
                        key={c.category}
                        type="button"
                        onClick={() =>
                          setCategoryFilter((prev) =>
                            prev === c.category ? "All" : c.category,
                          )
                        }
                        className={`w-full text-left rounded-md border px-4 py-3 transition-colors hover:border-card-foreground/50 hover:bg-muted/70 ${
                          categoryFilter === c.category ? "border-card-foreground/50 bg-muted/50" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-base font-medium text-card-foreground">
                            {c.category}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {c.count} ({formatPercent(c.percentage)})
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#6b7a4a] rounded-full transition-all"
                            style={{ width: `${c.percentage}%` }}
                          />
                        </div>
                      </button>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Coverage gaps — the actionable "what couldn't we answer?" signal */}
            {coverageGaps.length > 0 ? (
              <Card className="border-border mb-6">
                <CardContent className="p-5">
                  <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
                    Service &amp; Amenity Gaps
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    What guests asked for that the hotel couldn&apos;t provide.
                  </p>
                  <div className="space-y-2">
                    {pagedGaps.map((gap) => (
                      <div
                        key={gap.label}
                        className="flex items-center justify-between rounded-md border border-border px-4 py-2.5"
                      >
                        <span className="text-sm text-card-foreground">{gap.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {gap.count} {gap.count === 1 ? "request" : "requests"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {coverageGaps.length > GAPS_PER_PAGE ? (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Showing {safeGapsPage * GAPS_PER_PAGE + 1}–
                        {Math.min((safeGapsPage + 1) * GAPS_PER_PAGE, coverageGaps.length)} of{" "}
                        {coverageGaps.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setGapsPage((p) => Math.max(0, p - 1))}
                          disabled={safeGapsPage === 0}
                          aria-label="Previous page"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="px-1 text-xs text-muted-foreground">
                          {safeGapsPage + 1} / {totalGapPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setGapsPage((p) => Math.min(totalGapPages - 1, p + 1))}
                          disabled={safeGapsPage >= totalGapPages - 1}
                          aria-label="Next page"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-card border-border"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sortOrder}
                onValueChange={(value: "most" | "least") => setSortOrder(value)}
              >
                <SelectTrigger className="w-48 bg-card border-border">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="most">Most Common First</SelectItem>
                  <SelectItem value="least">Least Common First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* FAQ List */}
            <Card className="border-border">
              <CardContent className="p-0">
                {visibleQuestions.length === 0 ? (
                  <div className="p-5 text-sm text-muted-foreground">
                    No questions match your filters.
                  </div>
                ) : (
                  <>
                  <div className="divide-y divide-border">
                    {pagedQuestions.map((item, index) => {
                      const globalIndex = questionsPageStart + index
                      const rank =
                        sortOrder === "most"
                          ? globalIndex + 1
                          : visibleQuestions.length - globalIndex
                      return (
                        <div
                          key={`${item.question}-${globalIndex}`}
                          className="p-5 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[#6b7a4a]/10">
                              <span className="text-sm font-semibold text-[#6b7a4a]">{rank}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <h3 className="font-medium text-card-foreground">
                                  {item.question}
                                </h3>
                                <span
                                  className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                                    CATEGORY_BADGE[item.category] ?? DEFAULT_BADGE
                                  }`}
                                >
                                  {item.category}
                                </span>
                              </div>
                              <div className="flex items-center gap-6 text-xs">
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-card-foreground">
                                    {item.count.toLocaleString()}
                                  </span>{" "}
                                  {item.count === 1 ? "mention" : "mentions"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {visibleQuestions.length > QUESTIONS_PER_PAGE ? (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Showing {questionsPageStart + 1}–
                        {Math.min(questionsPageStart + QUESTIONS_PER_PAGE, visibleQuestions.length)} of{" "}
                        {visibleQuestions.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQuestionsPage((p) => Math.max(0, p - 1))}
                          disabled={safeQuestionsPage === 0}
                          aria-label="Previous page"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="px-1 text-xs text-muted-foreground">
                          {safeQuestionsPage + 1} / {totalQuestionPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuestionsPage((p) => Math.min(totalQuestionPages - 1, p + 1))
                          }
                          disabled={safeQuestionsPage >= totalQuestionPages - 1}
                          aria-label="Next page"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  )
}

function Notice({ tone, message }: { tone: "muted" | "error"; message: string }) {
  const classes =
    tone === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-border bg-muted/40 text-muted-foreground"
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${classes}`}>
      {tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4" /> : null}
      <span>{message}</span>
    </div>
  )
}

function rangeForTimespan(timespan: string): { start: string; end: string } {
  if (timespan === "year") {
    const now = new Date()
    return { start: toDateInput(new Date(now.getFullYear(), 0, 1)), end: toDateInput(now) }
  }
  const days = Number(timespan)
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - safeDays + 1)
  return { start: toDateInput(start), end: toDateInput(end) }
}

function toDateInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return "--"
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
