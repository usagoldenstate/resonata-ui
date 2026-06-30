"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Sidebar } from "@/components/sidebar"
import {
  AlertTriangle,
  CalendarIcon,
  ChevronRight,
  Clock,
  DollarSign,
  GitCompareArrows,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { differenceInCalendarDays, format, subDays } from "date-fns"

import {
  ApiError,
  type CallMetricsSummary,
  type NotBookedBreakdownResponse,
  type RevenueSummary,
  fetchCallMetricsSummary,
  fetchNotBookedBreakdown,
  fetchRevenueSummary,
} from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

// Presentation-only color mapping, keyed on the backend taxonomy category name.
// Mirrors the Not Booked reporting page so the dashboard tile matches the detail view.
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
  { value: "14", label: "Last 2 weeks" },
  { value: "30", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
]

interface DashboardDateRange {
  from: Date
  to: Date
}

type CalendarRange = {
  from: Date | undefined
  to?: Date
}

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

const emptyState = (): LoadState => ({ loading: false, data: null, error: null })

// Bookable calls = calls that had booking intent, whether they ended up booked
// or not (calls_booked + total_not_booked). Total calls includes non-bookable
// ones. Returns undefined until both source endpoints have loaded.
function callVolumeValue(
  data: DashboardData | null,
  type: "bookable" | "total",
): number | undefined {
  if (!data) return undefined
  if (type === "total") return data.calls?.total_calls
  if (data.calls == null || data.notBooked == null) return undefined
  return data.calls.calls_booked + data.notBooked.total_not_booked
}

async function loadDashboard(
  hotelId: string,
  start: string,
  end: string,
  signal: AbortSignal,
): Promise<{ data: DashboardData; error: string | null }> {
  const [calls, revenue, notBooked] = await Promise.allSettled([
    fetchCallMetricsSummary(
      { hotel_id: hotelId, start_date: start, end_date: end, min_duration_seconds: 0 },
      { signal },
    ),
    fetchRevenueSummary(
      { hotel_id: hotelId, start_date: start, end_date: end, basis: "projected" },
      { signal },
    ),
    fetchNotBookedBreakdown(
      { hotel_id: hotelId, start_date: start, end_date: end },
      { signal },
    ),
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
    (r): r is PromiseRejectedResult => r.status === "rejected" && !isAbortError(r.reason),
  )
  const error = allFailed && firstRejection ? describeError(firstRejection.reason) : null

  return { data, error }
}

export default function Dashboard() {
  const { hotelId, loading: hotelLoading, error: hotelError, accessState } = useHotel()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [primaryTimespan, setPrimaryTimespan] = useState("30")
  const [primaryDateRange, setPrimaryDateRange] = useState<DashboardDateRange>(() => ({
    from: subDays(today, 29),
    to: today,
  }))
  const [primaryCalendarOpen, setPrimaryCalendarOpen] = useState(false)
  const [primaryTempRange, setPrimaryTempRange] = useState<CalendarRange>({
    from: primaryDateRange.from,
    to: primaryDateRange.to,
  })

  const [showComparison, setShowComparison] = useState(false)
  const [callVolumeType, setCallVolumeType] = useState<"bookable" | "total">("bookable")
  const [comparisonTimespan, setComparisonTimespan] = useState("30")
  const [comparisonDateRange, setComparisonDateRange] = useState<DashboardDateRange>(() => ({
    from: subDays(today, 59),
    to: subDays(today, 30),
  }))
  const [comparisonCalendarOpen, setComparisonCalendarOpen] = useState(false)
  const [comparisonTempRange, setComparisonTempRange] = useState<CalendarRange>({
    from: comparisonDateRange.from,
    to: comparisonDateRange.to,
  })

  const [primary, setPrimary] = useState<LoadState>(() => emptyState())
  const [comparison, setComparison] = useState<LoadState>(() => emptyState())

  const handlePrimaryTimespanChange = (value: string) => {
    setPrimaryTimespan(value)
    if (value !== "custom") {
      const days = parseInt(value)
      // Inclusive of today, so a 30-day window spans today-29 .. today. Matches
      // rangeForLastDays() on the reporting pages so totals line up exactly.
      setPrimaryDateRange({ from: subDays(today, days - 1), to: today })
    }
  }

  // Default the comparison to the same-length window immediately preceding the
  // primary range. We surface it as a "Custom range" so the exact preceding
  // dates are shown — a preset like "Last 7 days" would point at today, not the
  // window before the primary.
  const handleToggleComparison = () => {
    const next = !showComparison
    setShowComparison(next)
    if (next) {
      const preceding = precedingRange(primaryDateRange)
      setComparisonTimespan("custom")
      setComparisonDateRange(preceding)
      setComparisonTempRange({ from: preceding.from, to: preceding.to })
    }
  }

  const handleComparisonTimespanChange = (value: string) => {
    setComparisonTimespan(value)
    if (value !== "custom") {
      const days = parseInt(value)
      const primaryDays = parseInt(primaryTimespan) || 30
      // The `days`-long window ending the day before the primary window starts.
      setComparisonDateRange({
        from: subDays(today, primaryDays + days - 1),
        to: subDays(today, primaryDays),
      })
    }
  }

  const primaryStart = toDateInput(primaryDateRange.from)
  const primaryEnd = toDateInput(primaryDateRange.to)
  const comparisonStart = toDateInput(comparisonDateRange.from)
  const comparisonEnd = toDateInput(comparisonDateRange.to)

  useEffect(() => {
    if (!hotelId) {
      setPrimary(emptyState())
      return
    }
    const controller = new AbortController()
    setPrimary({ loading: true, data: null, error: null })
    loadDashboard(hotelId, primaryStart, primaryEnd, controller.signal).then(
      ({ data, error }) => {
        if (controller.signal.aborted) return
        setPrimary({ loading: false, data, error })
      },
    )
    return () => controller.abort()
  }, [hotelId, primaryStart, primaryEnd])

  useEffect(() => {
    if (!hotelId || !showComparison) {
      setComparison(emptyState())
      return
    }
    const controller = new AbortController()
    setComparison({ loading: true, data: null, error: null })
    loadDashboard(hotelId, comparisonStart, comparisonEnd, controller.signal).then(
      ({ data, error }) => {
        if (controller.signal.aborted) return
        setComparison({ loading: false, data, error })
      },
    )
    return () => controller.abort()
  }, [hotelId, showComparison, comparisonStart, comparisonEnd])

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

  // Conversion tile
  const avgRate = primaryData?.calls?.conversion_rate
  const totalCalls = primaryData?.calls?.total_calls
  const booked = primaryData?.calls?.calls_booked
  const notBookedCalls =
    totalCalls !== undefined && booked !== undefined ? totalCalls - booked : undefined
  const rateDiff =
    showComparison && comparisonData && avgRate !== undefined
      ? avgRate - (comparisonData.calls?.conversion_rate ?? 0)
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
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
            <p className="text-sm text-muted-foreground">Click any section to view detailed analytics</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant={showComparison ? "default" : "outline"}
              onClick={handleToggleComparison}
              className={showComparison ? "bg-[#6b7a4a] hover:bg-[#5a6940]" : "border-border"}
            >
              <GitCompareArrows className="w-4 h-4 mr-2" />
              Compare Periods
            </Button>
          </div>
        </div>

        {/* Date Range Selectors */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Primary:</span>
            <Select value={primaryTimespan} onValueChange={handlePrimaryTimespanChange}>
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
            {primaryTimespan === "custom" && (
              <Popover open={primaryCalendarOpen} onOpenChange={setPrimaryCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-border">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(primaryDateRange.from, "MMM d")} - {format(primaryDateRange.to, "MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={primaryTempRange}
                    onSelect={(range) => {
                      setPrimaryTempRange(range || { from: undefined })
                      if (range?.from && range?.to) {
                        setPrimaryDateRange({ from: range.from, to: range.to })
                        setPrimaryCalendarOpen(false)
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          {showComparison && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Compare to:</span>
              <Select value={comparisonTimespan} onValueChange={handleComparisonTimespanChange}>
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
              {comparisonTimespan === "custom" && (
                <Popover open={comparisonCalendarOpen} onOpenChange={setComparisonCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="border-border">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {format(comparisonDateRange.from, "MMM d")} - {format(comparisonDateRange.to, "MMM d")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={comparisonTempRange}
                      onSelect={(range) => {
                        setComparisonTempRange(range || { from: undefined })
                        if (range?.from && range?.to) {
                          setComparisonDateRange({ from: range.from, to: range.to })
                          setComparisonCalendarOpen(false)
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}
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
        <div className="grid grid-cols-2 gap-6">
          {/* Call Volume Section */}
          <Card className="border-border hover:border-[#6b7a4a]/50 hover:shadow-md transition-all group h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Link href="/reporting/call-volume" className="flex-1">
                  <h3 className="text-lg font-semibold text-card-foreground">Call Volume</h3>
                  <p className="text-xs text-muted-foreground">Daily call trends and patterns</p>
                </Link>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border" onClick={(e) => e.preventDefault()}>
                    <button
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
                  <Link href="/reporting/call-volume">
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#6b7a4a] transition-colors" />
                  </Link>
                </div>
              </div>

              <Link href="/reporting/call-volume" className="block">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatNumber(callVolume)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {callVolumeType === "bookable" ? "bookable calls" : "calls"}
                  </span>
                  {callsDiff !== null && (
                    <span className={`text-sm flex items-center gap-1 ${callsDiff >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
                      {callsDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(callsDiff).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Total call time for the selected period */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-[#6b7a4a]" />
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
          <Link href="/reporting/conversion-rate" className="block">
            <Card className="border-border hover:border-[#6b7a4a]/50 hover:shadow-md transition-all cursor-pointer group h-full">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Conversion Rate</h3>
                    <p className="text-xs text-muted-foreground">Booking success metrics</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#6b7a4a] transition-colors" />
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatPercent(avgRate)}
                  </span>
                  <span className="text-sm text-muted-foreground">avg rate</span>
                  {rateDiff !== null && (
                    <span className={`text-sm flex items-center gap-1 ${rateDiff >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
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
                        className="bg-[#6b7a4a] h-3 rounded-full transition-all"
                        style={{ width: `${avgRate ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{formatNumber(booked)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Not Booked</span>
                    <div className="flex-1 bg-muted rounded-full h-3">
                      <div
                        className="bg-[#8b5a3c] h-3 rounded-full transition-all"
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
            <Card className="border-border hover:border-[#6b7a4a]/50 hover:shadow-md transition-all cursor-pointer group h-full">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Not Booked Reasons</h3>
                    <p className="text-xs text-muted-foreground">Why guests did not book</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#6b7a4a] transition-colors" />
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-semibold text-card-foreground">
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
            <Card className="border-border hover:border-[#6b7a4a]/50 hover:shadow-md transition-all cursor-pointer group h-full">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Projected Revenue</h3>
                    <p className="text-xs text-muted-foreground">Projected room revenue from bookings</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#6b7a4a] transition-colors" />
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-semibold text-card-foreground">
                    {primary.loading ? "..." : formatMoney(revenueCents, currency)}
                  </span>
                  <span className="text-sm text-muted-foreground">total revenue</span>
                  {revenueDiff !== null && (
                    <span className={`text-sm flex items-center gap-1 ${revenueDiff >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
                      {revenueDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(revenueDiff).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* ADR */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-[#6b7a4a]" />
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

// The same-length window ending the day before `range` begins, e.g. for a
// 7-day primary range this is the 7 days immediately before it.
function precedingRange(range: DashboardDateRange): DashboardDateRange {
  const lengthDays = differenceInCalendarDays(range.to, range.from) + 1
  const to = subDays(range.from, 1)
  const from = subDays(to, lengthDays - 1)
  return { from, to }
}

function toDateInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function percentChange(current: number | undefined, prior: number | undefined): number | null {
  if (current === undefined || prior === undefined || prior === 0) return null
  return ((current - prior) / prior) * 100
}

// Average Daily Rate = room revenue / room-nights. Returns cents per night.
function adr(data: RevenueSummary | null): number | undefined {
  if (!data || !data.room_nights) return undefined
  return Math.round(data.total_revenue_cents / data.room_nights)
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
