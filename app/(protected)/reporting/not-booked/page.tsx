"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronLeft, Loader2, TrendingDown, TrendingUp } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
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
  type NotBookedBreakdownResponse,
  type NotBookedSeasonalityRow,
  fetchNotBookedBreakdown,
  fetchNotBookedSeasonality,
} from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

// Presentation-only: the category names + counts come from the backend taxonomy;
// the UI keeps just the color mapping keyed on the stable category name.
const COLOR_BY_CATEGORY: Record<string, string> = {
  Price: "bg-[#6b7a4a]",
  Availability: "bg-[#c4a84b]",
  Amenities: "bg-[#8b5a3c]",
  Policy: "bg-[#64748b]",
  Other: "bg-[#9ca3af]",
}
const DEFAULT_COLOR = "bg-[#9ca3af]"

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

type LoadState<T> = {
  loading: boolean
  data: T | null
  error: string | null
}

const emptyState = <T,>(): LoadState<T> => ({ loading: false, data: null, error: null })

export default function NotBookedReportingPage() {
  const { hotelId, loading: hotelLoading, error: hotelError } = useHotel()
  const [timespan, setTimespan] = useState("30")
  const [selectedReason, setSelectedReason] = useState<string | null>(null)

  const range = useMemo(() => rangeForTimespan(timespan), [timespan])

  const [breakdown, setBreakdown] = useState<LoadState<NotBookedBreakdownResponse>>(() =>
    emptyState(),
  )
  const [seasonality, setSeasonality] = useState<LoadState<NotBookedSeasonalityRow[]>>(() =>
    emptyState(),
  )

  useEffect(() => {
    setSelectedReason(null)
  }, [hotelId])

  useEffect(() => {
    if (!hotelId) {
      setBreakdown(emptyState())
      return
    }

    const controller = new AbortController()
    setBreakdown({ loading: true, data: null, error: null })
    fetchNotBookedBreakdown(
      { hotel_id: hotelId, start_date: range.start, end_date: range.end },
      { signal: controller.signal },
    )
      .then((data) => setBreakdown({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setBreakdown({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [hotelId, range.start, range.end])

  useEffect(() => {
    if (!hotelId || !selectedReason) {
      setSeasonality(emptyState())
      return
    }

    const controller = new AbortController()
    const months = rangeForLastMonths(12)
    setSeasonality({ loading: true, data: null, error: null })
    fetchNotBookedSeasonality(
      { hotel_id: hotelId, start_month: months.start, end_month: months.end },
      { signal: controller.signal },
    )
      .then((data) => setSeasonality({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setSeasonality({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [hotelId, selectedReason])

  const breakdownData = breakdown.data
  const categories = useMemo(() => breakdownData?.categories ?? [], [breakdownData])
  const totalNotBooked = breakdownData?.total_not_booked ?? 0
  const isEmpty = breakdownData !== null && totalNotBooked === 0

  const topReason = useMemo(() => {
    if (categories.length === 0) return null
    return categories.reduce((top, c) => (c.count > top.count ? c : top), categories[0])
  }, [categories])

  const priorDelta = useMemo(() => {
    if (!breakdownData) return null
    const { total_not_booked: total, prior_period_total: prior } = breakdownData
    if (prior <= 0) return null
    return Math.round(((total - prior) / prior) * 100)
  }, [breakdownData])

  const selectedReasonData = useMemo(
    () => categories.find((c) => c.category === selectedReason) ?? null,
    [categories, selectedReason],
  )

  const selectedColor = selectedReason
    ? COLOR_BY_CATEGORY[selectedReason] ?? DEFAULT_COLOR
    : DEFAULT_COLOR

  const monthlyTrend = useMemo(() => {
    if (!selectedReason) return []
    return (seasonality.data ?? [])
      .filter((row) => row.category === selectedReason)
      .map((row) => ({ month: shortMonth(row.month), count: row.count }))
  }, [seasonality.data, selectedReason])

  const maxSeasonalityCount = useMemo(
    () => monthlyTrend.reduce((max, m) => Math.max(max, m.count), 0),
    [monthlyTrend],
  )

  const peakMonth = useMemo(() => {
    if (monthlyTrend.length === 0) return "--"
    return monthlyTrend.reduce((max, m) => (m.count > max.count ? m : max), monthlyTrend[0])
      .month
  }, [monthlyTrend])

  const topSubcategory = useMemo(() => {
    const subs = selectedReasonData?.subcategories ?? []
    if (subs.length === 0) return null
    return subs.reduce((top, s) => (s.count > top.count ? s : top), subs[0])
  }, [selectedReasonData])

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {selectedReason ? (
              <Button
                variant="ghost"
                onClick={() => setSelectedReason(null)}
                className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to Overview
              </Button>
            ) : null}
            <h2 className="text-2xl font-semibold text-foreground">
              {selectedReason ? `Not Booked: ${selectedReason}` : "Not Booked Reasons"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedReason
                ? `Detailed breakdown of ${selectedReason.toLowerCase()}-related issues`
                : "Analyze why guests with booking intent didn't complete bookings"}
            </p>
          </div>
          <Select value={timespan} onValueChange={setTimespan}>
            <SelectTrigger className="w-40 bg-card border-border">
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
        </div>

        {hotelLoading ? (
          <Notice tone="muted" message="Loading hotel selection..." />
        ) : hotelError ? (
          <Notice tone="error" message={hotelError} />
        ) : !hotelId ? (
          <Notice tone="muted" message="Select a hotel to view not-booked reasons." />
        ) : null}

        {breakdown.error ? <Notice tone="error" message={breakdown.error} /> : null}
        {isEmpty && !selectedReason ? (
          <Notice tone="muted" message="No not-booked calls found in this date range." />
        ) : null}

        {!selectedReason ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Total Not Booked
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {breakdown.loading ? "..." : totalNotBooked.toLocaleString()}
                  </p>
                  {priorDelta !== null ? (
                    <p
                      className={`text-xs mt-1 flex items-center gap-1 ${
                        priorDelta > 0 ? "text-[#8b5a3c]" : "text-[#6b7a4a]"
                      }`}
                    >
                      {priorDelta > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {Math.abs(priorDelta)}% vs prior period
                    </p>
                  ) : (
                    <p className="text-xs mt-1 text-muted-foreground">vs prior period</p>
                  )}
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Top Reason
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {breakdown.loading ? "..." : topReason?.count ? topReason.category : "--"}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {topReason?.count ? `${formatPercent(topReason.percentage)} of not booked` : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Addressable
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {breakdown.loading
                      ? "..."
                      : formatPercent(breakdownData?.addressable_percentage)}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">Could potentially convert</p>
                </CardContent>
              </Card>
            </div>

            {/* Reasons Breakdown */}
            <Card className="border-border">
              <CardContent className="p-5">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                  Reasons Breakdown
                </h3>

                {breakdown.loading ? (
                  <ChartState message="Loading reasons breakdown..." loading />
                ) : (
                  <>
                    <div className="space-y-3">
                      {categories.map((reason) => {
                        const color = COLOR_BY_CATEGORY[reason.category] ?? DEFAULT_COLOR
                        return (
                          <button
                            key={reason.category}
                            onClick={() => setSelectedReason(reason.category)}
                            className="w-full text-left rounded-md border border-border px-4 py-3 transition-colors hover:border-card-foreground/50 hover:bg-muted/70"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-base font-medium text-card-foreground">
                                {reason.category}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {reason.count} ({formatPercent(reason.percentage)})
                              </span>
                            </div>
                            <div className="h-4 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${color} rounded-full transition-all`}
                                style={{ width: `${reason.percentage}%` }}
                              />
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Summary Bar */}
                    <div className="mt-5 pt-4 border-t border-border">
                      <p className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-2">
                        Distribution
                      </p>
                      <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                        {categories.map((reason) => (
                          <div
                            key={reason.category}
                            className={`${COLOR_BY_CATEGORY[reason.category] ?? DEFAULT_COLOR} transition-all hover:opacity-80 cursor-pointer`}
                            style={{ width: `${reason.percentage}%` }}
                            title={`${reason.category}: ${formatPercent(reason.percentage)}`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                        {categories.map((reason) => (
                          <div key={reason.category} className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${COLOR_BY_CATEGORY[reason.category] ?? DEFAULT_COLOR}`}
                            />
                            <span className="text-xs text-muted-foreground">{reason.category}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Selected Reason Detail View */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Total Cases
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {selectedReasonData?.count ?? 0}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {formatPercent(selectedReasonData?.percentage)} of all not booked
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Peak Month
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {seasonality.loading ? "..." : peakMonth}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Highest occurrence (last 12 months)
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Top Issue
                  </p>
                  <p className="text-lg font-semibold text-card-foreground truncate">
                    {topSubcategory?.count ? topSubcategory.name : "--"}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {topSubcategory?.count
                      ? `${formatPercent(topSubcategory.percentage)} of category`
                      : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Subcategories */}
            <Card className="border-border mb-6">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                  Subcategories
                </h3>
                <div
                  className={`grid grid-cols-1 gap-x-8 gap-y-3 ${
                    (selectedReasonData?.subcategories.length ?? 0) >= 6 ? "xl:grid-cols-2" : ""
                  }`}
                >
                  {(selectedReasonData?.subcategories ?? []).map((sub) => (
                    <div key={sub.name}>
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <span className="text-base text-card-foreground">{sub.name}</span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {sub.count} ({formatPercent(sub.percentage)})
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${selectedColor} rounded-full`}
                          style={{ width: `${sub.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Seasonality */}
            <Card className="border-border mb-6">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                  Monthly Trend
                </h3>
                {seasonality.loading ? (
                  <ChartState message="Loading monthly trend..." loading />
                ) : seasonality.error ? (
                  <ChartState message={seasonality.error} error />
                ) : (
                  <div className="flex items-end gap-2 h-32">
                    {monthlyTrend.map((month, index) => (
                      <div
                        key={`${month.month}-${index}`}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div className="w-full flex flex-col items-center justify-end h-24">
                          <div
                            className={`w-full max-w-6 ${selectedColor} rounded-t relative group cursor-pointer transition-all hover:opacity-80`}
                            style={{
                              height:
                                maxSeasonalityCount > 0
                                  ? `${(month.count / maxSeasonalityCount) * 100}%`
                                  : "0%",
                            }}
                          >
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                              {month.count}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{month.month}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
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

function ChartState({
  message,
  loading = false,
  error = false,
}: {
  message: string
  loading?: boolean
  error?: boolean
}) {
  return (
    <div
      className={`flex h-32 items-center justify-center rounded-md border px-4 text-sm ${
        error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/30 text-muted-foreground"
      }`}
    >
      <span className="flex items-center gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {message}
      </span>
    </div>
  )
}

function rangeForTimespan(timespan: string): { start: string; end: string } {
  if (timespan === "year") {
    const now = new Date()
    return { start: toDateInput(new Date(now.getFullYear(), 0, 1)), end: toDateInput(now) }
  }
  const days = Number(timespan)
  return rangeForLastDays(Number.isFinite(days) && days > 0 ? days : 30)
}

function rangeForLastDays(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - days + 1)
  return { start: toDateInput(start), end: toDateInput(end) }
}

function rangeForLastMonths(months: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1)
  return { start: toMonthInput(start), end: toMonthInput(end) }
}

function toDateInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toMonthInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function shortMonth(value: string): string {
  const [year, month] = value.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short" })
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
