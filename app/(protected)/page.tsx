"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { DateRangeFilter } from "@/components/date-range-filter"
import { RefreshButton } from "@/components/refresh-button"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/sidebar"
import {
  AlertTriangle,
  ArrowUpRight,
  PhoneCall,
  BookOpen,
  ChevronRight,
  Clock,
  DollarSign,
  GitCompareArrows,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import {
  ApiError,
  type CallMetricsSummary,
  type NotBookedBreakdownResponse,
  type RevenueSummary,
  fetchCallMetricsSummary,
  fetchNotBookedBreakdown,
  fetchRevenueSummary,
} from "@/lib/api"
import {
  type DateRange,
  dateRangeError,
  isAllTime,
  precedingRange,
  rangeForLastDays,
  rangeForTimespan,
  shiftDateInput,
} from "@/lib/date-range"
import { useHotel } from "@/lib/hotel-context"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

// Presentation-only color mapping, keyed on the backend taxonomy category name.
// Mirrors the Not Booked reporting page so the dashboard tile matches the detail view.
const COLOR_BY_CATEGORY: Record<string, string> = {
  Price: "bg-primary",
  Availability: "bg-warning",
  Amenities: "bg-destructive",
  Policy: "bg-[#64748b]",
  Other: "bg-[#9ca3af]",
}
const DEFAULT_COLOR = "bg-[#9ca3af]"

// The primary picker uses the app-wide DATE_RANGE_PRESETS. Comparison presets
// are windows immediately preceding the primary range, not windows ending
// today, so they're a separate list and their labels say so.
const comparisonPresets = [
  { value: "7", label: "7 days prior", pill: "7 days prior" },
  { value: "14", label: "14 days prior", pill: "14 days prior" },
  { value: "30", label: "30 days prior", pill: "30 days prior" },
]

// The summary endpoints cap explicit ranges at 366 inclusive days server-side
// (all time sends no dates and is uncapped), so custom ranges check the same.
const MAX_RANGE_DAYS = 366
const FETCH_DEBOUNCE_MS = 400

// The three reporting endpoints that power the overview tiles. Each may be null
// independently so one failing endpoint doesn't blank the whole dashboard.
type DashboardData = {
  calls: CallMetricsSummary | null
  revenue: RevenueSummary | null
  notBooked: NotBookedBreakdownResponse | null
}

type LoadState = {
  loading: boolean
  data: DashboardData | null
  error: string | null
}

// Bookable calls = calls that had booking intent, whether they ended up booked
// or not (links_sent + total_not_booked). links_sent already covers every
// booked call (a booking requires a link send first), so adding calls_booked
// on top would double count; total_not_booked separately covers intent calls
// that never got a link. Total calls includes non-bookable ones. Returns
// undefined until both source endpoints have loaded.
function callVolumeValue(
  data: DashboardData | null,
  type: "bookable" | "total",
): number | undefined {
  if (!data) return undefined
  if (type === "total") return data.calls?.total_calls
  if (data.calls == null || data.notBooked == null) return undefined
  return data.calls.links_sent + data.notBooked.total_not_booked
}

// Conversion among bookable calls: booked / (booked + not-booked), as a percent.
// Undefined until both source endpoints have loaded.
function bookableConversionRate(data: DashboardData | null): number | undefined {
  const booked = data?.calls?.calls_booked
  const bookable = callVolumeValue(data, "bookable")
  if (booked === undefined || bookable === undefined || bookable === 0) return undefined
  return (booked / bookable) * 100
}

async function loadDashboard(
  hotelId: string,
  start: string,
  end: string,
): Promise<{ data: DashboardData; error: string | null }> {
  const [calls, revenue, notBooked] = await Promise.allSettled([
    fetchCallMetricsSummary({ hotel_id: hotelId, start_date: start, end_date: end, min_duration_seconds: 0 }),
    fetchRevenueSummary({ hotel_id: hotelId, start_date: start, end_date: end, basis: "projected" }),
    fetchNotBookedBreakdown({ hotel_id: hotelId, start_date: start, end_date: end }),
  ])

  const data: DashboardData = {
    calls: calls.status === "fulfilled" ? calls.value : null,
    revenue: revenue.status === "fulfilled" ? revenue.value : null,
    notBooked: notBooked.status === "fulfilled" ? notBooked.value : null,
  }

  // Surface an error banner only when every section failed; otherwise the tiles
  // render whatever loaded and show "--" for the rest.
  const allFailed = !data.calls && !data.revenue && !data.notBooked
  const firstRejection = [calls, revenue, notBooked].find(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  )
  const error = allFailed && firstRejection ? describeError(firstRejection.reason) : null

  return { data, error }
}

export default function Dashboard() {
  const {
    hotelId,
    hotelTimezone,
    loading: hotelLoading,
    error: hotelError,
    accessState,
  } = useHotel()

  const [primaryTimespan, setPrimaryTimespan] = useState("30")
  // Only the custom range is stored; preset ranges are derived per render so
  // "today" tracks the hotel's timezone once the hotel list has loaded.
  const [primaryCustom, setPrimaryCustom] = useState<DateRange>(() => rangeForLastDays(30))
  const debouncedPrimaryStart = useDebouncedValue(primaryCustom.start, FETCH_DEBOUNCE_MS)
  const debouncedPrimaryEnd = useDebouncedValue(primaryCustom.end, FETCH_DEBOUNCE_MS)

  const [showComparison, setShowComparison] = useState(false)
  const [callVolumeType, setCallVolumeType] = useState<"bookable" | "total">("bookable")
  const [comparisonTimespan, setComparisonTimespan] = useState("custom")
  const [comparisonCustom, setComparisonCustom] = useState<DateRange>(() =>
    precedingRange(rangeForLastDays(30)),
  )
  const debouncedComparisonStart = useDebouncedValue(comparisonCustom.start, FETCH_DEBOUNCE_MS)
  const debouncedComparisonEnd = useDebouncedValue(comparisonCustom.end, FETCH_DEBOUNCE_MS)

  // Custom mode reads the debounced inputs so mid-edit values don't re-fetch.
  const primaryRange = useMemo<DateRange>(
    () =>
      primaryTimespan === "custom"
        ? { start: debouncedPrimaryStart, end: debouncedPrimaryEnd }
        : rangeForTimespan(primaryTimespan, hotelTimezone),
    [primaryTimespan, debouncedPrimaryStart, debouncedPrimaryEnd, hotelTimezone],
  )
  // All time has no preceding window to compare against.
  const comparisonAvailable = !isAllTime(primaryTimespan)

  // Comparison presets are the `days`-long window ending the day before the
  // primary window starts, derived per render so they track the primary range.
  const comparisonRange = useMemo<DateRange>(() => {
    if (comparisonTimespan === "custom") {
      return { start: debouncedComparisonStart, end: debouncedComparisonEnd }
    }
    const days = Number(comparisonTimespan)
    const end = shiftDateInput(primaryRange.start, -1)
    return { start: shiftDateInput(end, -(days - 1)), end }
  }, [comparisonTimespan, debouncedComparisonStart, debouncedComparisonEnd, primaryRange.start])

  // Immediate (un-debounced) validation flags a bad range as the user types;
  // the debounced variant gates the fetches below.
  const primaryRangeError =
    primaryTimespan === "custom"
      ? dateRangeError(primaryCustom.start, primaryCustom.end, MAX_RANGE_DAYS)
      : null
  const debouncedPrimaryRangeError =
    primaryTimespan === "custom"
      ? dateRangeError(debouncedPrimaryStart, debouncedPrimaryEnd, MAX_RANGE_DAYS)
      : null
  const comparisonRangeError =
    comparisonTimespan === "custom"
      ? dateRangeError(comparisonCustom.start, comparisonCustom.end, MAX_RANGE_DAYS)
      : null
  const debouncedComparisonRangeError =
    comparisonTimespan === "custom"
      ? dateRangeError(debouncedComparisonStart, debouncedComparisonEnd, MAX_RANGE_DAYS)
      : null

  const selectPrimaryTimespan = (value: string) => {
    // Seed the custom inputs from the window the user was already viewing.
    if (value === "custom" && primaryTimespan !== "custom") {
      setPrimaryCustom(primaryRange)
    }
    if (isAllTime(value)) setShowComparison(false)
    setPrimaryTimespan(value)
  }

  const selectComparisonTimespan = (value: string) => {
    if (value === "custom" && comparisonTimespan !== "custom") {
      setComparisonCustom(comparisonRange)
    }
    setComparisonTimespan(value)
  }

  // Default the comparison to the same-length window immediately preceding the
  // primary range. We surface it as a custom range so the exact preceding
  // dates are shown on the trigger.
  const handleToggleComparison = () => {
    const next = !showComparison
    setShowComparison(next)
    if (next) {
      setComparisonTimespan("custom")
      setComparisonCustom(precedingRange(primaryRange))
    }
  }

  const {
    data: primaryResult,
    isLoading: primaryLoadingRaw,
    mutate: refreshPrimary,
  } = useSWR(
    hotelId && !debouncedPrimaryRangeError
      ? (["dashboard", hotelId, primaryRange.start, primaryRange.end] as const)
      : null,
    ([, hid, start, end]) => loadDashboard(hid, start, end),
  )
  const primary: LoadState = {
    loading: primaryLoadingRaw,
    data: primaryResult?.data ?? null,
    error: primaryResult?.error ?? null,
  }

  const {
    data: comparisonResult,
    isLoading: comparisonLoadingRaw,
    mutate: refreshComparison,
  } = useSWR(
    hotelId && showComparison && !debouncedComparisonRangeError
      ? (["dashboard", hotelId, comparisonRange.start, comparisonRange.end] as const)
      : null,
    ([, hid, start, end]) => loadDashboard(hid, start, end),
  )
  const comparison: LoadState = {
    loading: comparisonLoadingRaw,
    data: comparisonResult?.data ?? null,
    error: comparisonResult?.error ?? null,
  }

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshPrimary(), showComparison ? refreshComparison() : Promise.resolve()])
    } finally {
      setRefreshing(false)
    }
  }

  const primaryData = primary.data
  const comparisonData = comparison.data
  const currency = primaryData?.revenue?.currency ?? "USD"

  // Call volume tile
  const callVolume = callVolumeValue(primaryData, callVolumeType)
  const totalSeconds = primaryData?.calls?.total_call_seconds
  const callsDiff =
    showComparison && comparisonData
      ? percentChange(callVolume, callVolumeValue(comparisonData, callVolumeType))
      : null

  // Conversion tile — uses the bookable-calls basis (booked / bookable), matching
  // the Revenue page default, so booked + not-booked sum to 100%.
  const avgRate = bookableConversionRate(primaryData)
  const booked = primaryData?.calls?.calls_booked
  const notBookedCalls = primaryData?.notBooked?.total_not_booked
  const comparisonRate = bookableConversionRate(comparisonData)
  const rateDiff =
    showComparison && avgRate !== undefined && comparisonRate !== undefined
      ? avgRate - comparisonRate
      : null

  // Not booked tile
  const notBookedCategories = primaryData?.notBooked?.categories ?? []
  const totalNotBooked = primaryData?.notBooked?.total_not_booked

  // Revenue tile
  const revenueCents = primaryData?.revenue?.total_revenue_cents
  const adrCents = adr(primaryData?.revenue ?? null)
  const revenueDiff =
    showComparison && comparisonData
      ? percentChange(revenueCents, comparisonData.revenue?.total_revenue_cents)
      : null

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="app-content flex-1 p-8">
        {/* Header */}
        <div className="dashboard-intro flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <p className="app-eyebrow mb-3">Performance overview</p>
            <h1 className="text-2xl font-semibold text-foreground">Your hotel, at a glance.</h1>
            <p className="text-sm text-muted-foreground">Turn everyday conversations into a clearer picture of your business.</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <DateRangeFilter
                variant="header"
                timespan={primaryTimespan}
                range={primaryRange}
                customStart={primaryCustom.start}
                customEnd={primaryCustom.end}
                rangeError={primaryRangeError}
                onSelectTimespan={selectPrimaryTimespan}
                onCustomStart={(value) => setPrimaryCustom((prev) => ({ ...prev, start: value }))}
                onCustomEnd={(value) => setPrimaryCustom((prev) => ({ ...prev, end: value }))}
              />
              {showComparison ? (
                <>
                  <span className="text-sm text-muted-foreground">vs</span>
                  <DateRangeFilter
                    variant="header"
                    presets={comparisonPresets}
                    timespan={comparisonTimespan}
                    range={comparisonRange}
                    customStart={comparisonCustom.start}
                    customEnd={comparisonCustom.end}
                    rangeError={comparisonRangeError}
                    onSelectTimespan={selectComparisonTimespan}
                    onCustomStart={(value) =>
                      setComparisonCustom((prev) => ({ ...prev, start: value }))
                    }
                    onCustomEnd={(value) =>
                      setComparisonCustom((prev) => ({ ...prev, end: value }))
                    }
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              aria-pressed={showComparison}
              variant={showComparison ? "default" : "outline"}
              onClick={handleToggleComparison}
              disabled={!comparisonAvailable}
              title={comparisonAvailable ? undefined : "Pick a dated range to compare periods"}
              className={showComparison ? "bg-foreground text-background hover:bg-foreground/90" : "border-border"}
            >
              <GitCompareArrows className="w-4 h-4 mr-2" />
              Compare Periods
            </Button>
            <RefreshButton onRefresh={handleRefresh} refreshing={refreshing} />
          </div>
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
                : "Select a hotel to view the dashboard."
            }
          />
        ) : primary.error ? (
          <Notice tone="error" message={primary.error} />
        ) : null}

        {/* Main Grid - 2x2 */}
        <div className="dashboard-grid grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Call Volume Section */}
          <Card className="metric-card border-border hover:border-primary/35 hover:shadow-md transition-[border-color,box-shadow] duration-200 group h-full py-0">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <Link href="/reporting/call-volume" className="flex-1">
                  <h3 className="text-lg font-semibold text-card-foreground">Call Volume</h3>
                  <p className="text-xs text-muted-foreground">Daily call trends and patterns</p>
                </Link>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border" onClick={(e) => e.preventDefault()}>
                    <button
                      aria-pressed={callVolumeType === "bookable"}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCallVolumeType("bookable") }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        callVolumeType === "bookable"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Bookable Calls
                    </button>
                    <button
                      aria-pressed={callVolumeType === "total"}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCallVolumeType("total") }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        callVolumeType === "total"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Total Calls
                    </button>
                  </div>
                  <Link href="/reporting/call-volume" aria-label="View call volume report">
                    <ChevronRight className="size-8 rounded-full border border-border p-1.5 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors" />
                  </Link>
                </div>
              </div>

              <Link href="/reporting/call-volume" className="block">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="metric-value text-4xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatNumber(callVolume)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {callVolumeType === "bookable" ? "bookable calls" : "calls"}
                  </span>
                  {callsDiff !== null && (
                    <span className={`text-sm flex items-center gap-1 ${callsDiff >= 0 ? "text-primary" : "text-destructive"}`}>
                      {callsDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(callsDiff).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Total call time for the selected period */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-card-foreground leading-tight">
                      {primary.loading ? "..." : formatMinutes(totalSeconds)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total call time
                      {!primary.loading && totalSeconds ? ` · ${formatHoursHint(totalSeconds)}` : ""}
                    </p>
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Conversion Rate Section */}
          <Link href="/reporting/revenue" className="block">
            <Card className="metric-card border-border hover:border-primary/35 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer group h-full py-0">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Conversion Rate</h3>
                    <p className="text-xs text-muted-foreground">Booking success metrics</p>
                  </div>
                  <ChevronRight className="size-8 rounded-full border border-border p-1.5 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors" />
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="metric-value text-4xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatPercent(avgRate)}
                  </span>
                  <span className="text-sm text-muted-foreground">avg rate</span>
                  {rateDiff !== null && (
                    <span className={`text-sm flex items-center gap-1 ${rateDiff >= 0 ? "text-primary" : "text-destructive"}`}>
                      {rateDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(rateDiff).toFixed(1)}pp
                    </span>
                  )}
                </div>

                {/* Comparison bars */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Booked</span>
                    <div className="flex-1 bg-muted rounded-full h-3">
                      <div
                        className="bg-primary h-3 rounded-full transition-all"
                        style={{ width: `${avgRate ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{formatNumber(booked)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Not Booked</span>
                    <div className="flex-1 bg-muted rounded-full h-3">
                      <div
                        className="bg-destructive h-3 rounded-full transition-all"
                        style={{ width: `${avgRate === undefined ? 0 : 100 - avgRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{formatNumber(notBookedCalls)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Not Booked Reasons Section */}
          <Link href="/reporting/not-booked" className="block">
            <Card className="metric-card border-border hover:border-primary/35 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer group h-full py-0">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Not Booked Reasons</h3>
                    <p className="text-xs text-muted-foreground">Why guests did not book</p>
                  </div>
                  <ChevronRight className="size-8 rounded-full border border-border p-1.5 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors" />
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="metric-value text-4xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatNumber(totalNotBooked)}
                  </span>
                  <span className="text-sm text-muted-foreground">total not booked</span>
                </div>

                {/* Reasons breakdown */}
                {notBookedCategories.length > 0 ? (
                  <div className="space-y-2">
                    {notBookedCategories.map((reason) => {
                      const color = COLOR_BY_CATEGORY[reason.category] ?? DEFAULT_COLOR
                      return (
                        <div key={reason.category} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${color}`} />
                          <span className="text-xs text-muted-foreground flex-1">{reason.category}</span>
                          <div className="w-20 bg-muted rounded-full h-2">
                            <div
                              className={`${color} h-2 rounded-full`}
                              style={{ width: `${reason.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-8 text-right">{formatPercent(reason.percentage)}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {primary.loading ? "Loading..." : "No not-booked calls in this date range."}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* Projected Revenue Section */}
          <Link href="/reporting/revenue" className="block">
            <Card className="metric-card border-border hover:border-primary/35 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer group h-full py-0">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Projected Revenue</h3>
                    <p className="text-xs text-muted-foreground">Projected room revenue from bookings</p>
                  </div>
                  <ChevronRight className="size-8 rounded-full border border-border p-1.5 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors" />
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="metric-value text-4xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatMoney(revenueCents, currency)}
                  </span>
                  <span className="text-sm text-muted-foreground">total revenue</span>
                  {revenueDiff !== null && (
                    <span className={`text-sm flex items-center gap-1 ${revenueDiff >= 0 ? "text-primary" : "text-destructive"}`}>
                      {revenueDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(revenueDiff).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* ADR */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-card-foreground leading-tight">
                      {primary.loading ? "..." : formatMoney(adrCents, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">ADR · average daily rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
        <section aria-label="Workspace shortcuts" className="mt-7 flex flex-col gap-6 rounded-2xl bg-[#0e0e10] p-6 text-[#f7f6f2] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f69468]">From insight to action</p>
            <h2 className="text-lg font-bold tracking-tight">Make every conversation count.</h2>
            <p className="mt-1 text-sm text-[#b6b4ae]">Explore the calls behind your numbers, or fine-tune what your agent knows.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/call-log" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-[#0e0e10] hover:bg-[#fdeee4]"><PhoneCall className="size-3.5" /> View call log <ArrowUpRight className="size-3.5" /></Link>
            <Link href="/knowledge-base" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-xs font-bold hover:bg-white/10"><BookOpen className="size-3.5" /> Knowledge base</Link>
          </div>
        </section>
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
    <div className={`mb-6 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${classes}`}>
      {tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4" /> : null}
      <span>{message}</span>
    </div>
  )
}

function percentChange(current: number | undefined, prior: number | undefined): number | null {
  if (current === undefined || prior === undefined || prior === 0) return null
  return ((current - prior) / prior) * 100
}

// Average Daily Rate in cents per night, computed server-side over
// night-bearing bookings only (rows with revenue but no stay dates would
// overstate a client-side total/room_nights quotient).
function adr(data: RevenueSummary | null): number | undefined {
  return data?.adr_cents ?? undefined
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "--" : value.toLocaleString()
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "--" : `${value.toFixed(1)}%`
}

function formatMoney(cents: number | undefined, currency: string): string {
  if (cents === undefined) return "--"
  const amount = cents / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
}

function formatMinutes(seconds: number | undefined): string {
  if (seconds === undefined) return "--"
  return `${Math.round(seconds / 60).toLocaleString()} min`
}

function formatHoursHint(seconds: number): string {
  return `≈ ${(seconds / 3600).toFixed(1)} hrs`
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
