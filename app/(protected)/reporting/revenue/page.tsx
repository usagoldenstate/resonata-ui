"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Info, Loader2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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

type SummaryPreset = "7" | "14" | "30" | "custom"
type CallBasis = "bookable" | "total"

type LoadState<T> = {
  loading: boolean
  data: T | null
  error: string | null
}

const emptyState = <T,>(): LoadState<T> => ({
  loading: false,
  data: null,
  error: null,
})

type FunnelStage = {
  label: string
  value: string
  // Bar width as a percent of stage 1 (Calls received). Omitted for the payoff.
  share?: number
  // Conversion caption vs the previous stage, e.g. "33% of calls".
  sub?: string
  // The terminal revenue stage, styled as the funnel's payoff.
  payoff?: boolean
}

export default function RevenueReportingPage() {
  const { hotelId, loading: hotelLoading, error: hotelError, accessState } = useHotel()
  const [preset, setPreset] = useState<SummaryPreset>("30")
  // Bookable calls (booking intent: booked + not-booked) vs all calls. Drives
  // the funnel's first stage and the conversion-rate denominator.
  const [callBasis, setCallBasis] = useState<CallBasis>("bookable")
  const [start, setStart] = useState(() => rangeForLastDays(30).start)
  const [end, setEnd] = useState(() => rangeForLastDays(30).end)
  const [summary, setSummary] = useState<LoadState<RevenueSummary>>(() => emptyState())
  // Powers the top-of-page funnel (Calls -> Links sent), which the revenue
  // summary alone can't supply. min_duration_seconds: 0 counts every call.
  const [calls, setCalls] = useState<LoadState<CallMetricsSummary>>(() => emptyState())
  // Supplies total_not_booked so bookable calls = calls_booked + total_not_booked.
  const [notBooked, setNotBooked] = useState<LoadState<NotBookedBreakdownResponse>>(() =>
    emptyState(),
  )

  useEffect(() => {
    if (!hotelId) {
      setSummary(emptyState())
      setCalls(emptyState())
      setNotBooked(emptyState())
      return
    }

    const controller = new AbortController()
    setSummary({ loading: true, data: null, error: null })
    setCalls({ loading: true, data: null, error: null })
    setNotBooked({ loading: true, data: null, error: null })

    fetchRevenueSummary(
      { hotel_id: hotelId, start_date: start, end_date: end, basis: "projected" },
      { signal: controller.signal },
    )
      .then((data) => setSummary({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setSummary({ loading: false, data: null, error: describeError(error) })
      })

    fetchCallMetricsSummary(
      { hotel_id: hotelId, start_date: start, end_date: end, min_duration_seconds: 0 },
      { signal: controller.signal },
    )
      .then((data) => setCalls({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setCalls({ loading: false, data: null, error: describeError(error) })
      })

    fetchNotBookedBreakdown(
      { hotel_id: hotelId, start_date: start, end_date: end },
      { signal: controller.signal },
    )
      .then((data) => setNotBooked({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setNotBooked({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [hotelId, start, end])

  const data = summary.data
  const currency = data?.currency ?? "USD"
  const isEmpty = data !== null && data.booking_count === 0

  // Calls-received basis shared by the funnel's first stage and the conversion
  // rate. Bookable needs both the call summary and the not-booked breakdown.
  const callsBooked = calls.data?.calls_booked
  const bookableCalls =
    callsBooked !== undefined && notBooked.data
      ? callsBooked + notBooked.data.total_not_booked
      : undefined
  const callsReceived = callBasis === "bookable" ? bookableCalls : calls.data?.total_calls
  const callsReceivedLabel =
    callBasis === "bookable" ? "Bookable Calls Received" : "Total Calls Received"
  const callsReceivedLoading =
    calls.loading || (callBasis === "bookable" && notBooked.loading)
  const conversionRate =
    callBasis === "bookable"
      ? bookableCalls
        ? ((callsBooked ?? 0) / bookableCalls) * 100
        : undefined
      : calls.data?.conversion_rate

  const onPresetChange = (next: SummaryPreset) => {
    setPreset(next)
    if (next === "custom") return
    const range = rangeForLastDays(Number(next))
    setStart(range.start)
    setEnd(range.end)
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Revenue</h1>
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-muted-foreground">
                Projected room revenue from bookings attributed to the voice agent
              </p>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="About projected revenue"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <span className="font-medium">Projected revenue only.</span> Figures are
                  estimated from guests who completed the booking-link details the voice agent
                  sent — not confirmed payments. They do not account for cancellations, no-shows,
                  or modifications, and are not a substitute for actualized revenue in your
                  property management system.
                </TooltipContent>
              </UiTooltip>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["7", "14", "30", "custom"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={preset === option ? "default" : "outline"}
                  onClick={() => onPresetChange(option)}
                >
                  {option === "custom" ? "Custom" : `${option} days`}
                </Button>
              ))}
              <UiTooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="How date ranges are bucketed"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Date ranges use each record&apos;s creation time in the hotel&apos;s local timezone.
                </TooltipContent>
              </UiTooltip>
            </div>
            {preset === "custom" ? (
              <DateRangeInputs start={start} end={end} onStart={setStart} onEnd={setEnd} />
            ) : null}
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
            {(["bookable", "total"] as const).map((basis) => (
              <button
                key={basis}
                type="button"
                onClick={() => setCallBasis(basis)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  callBasis === basis
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {basis === "bookable" ? "Bookable Calls" : "Total Calls"}
              </button>
            ))}
          </div>
          <UiTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="What is a bookable call?"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <span className="font-medium">Bookable calls</span> are your real sales
              opportunities: every caller who wanted to book, whether or not they did. Measuring
              conversion against bookable calls shows how well the agent closes genuine leads —
              instead of being diluted by service questions, existing guests, and spam, which{" "}
              <span className="font-medium">Total Calls</span> includes.
            </TooltipContent>
          </UiTooltip>
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
                : "Select a hotel to view revenue."
            }
          />
        ) : null}

        <section className="mb-8 rounded-lg border border-border p-4">
          <div className="mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-foreground">
              Booking Funnel
            </h2>
            <p className="text-xs text-muted-foreground">
              From answered call to projected revenue · reflects the selected date range
            </p>
          </div>
          <RevenueFunnel
            metricsState={calls}
            revenueState={summary}
            callsReceived={callsReceived}
            callsReceivedLabel={callsReceivedLabel}
            callsReceivedLoading={callsReceivedLoading}
            currency={currency}
          />
        </section>

        <section className="mb-8 rounded-lg border border-border p-4">
          <div className="mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-foreground">
              Booking Performance
            </h2>
            <p className="text-xs text-muted-foreground">
              Conversion and per-booking value
            </p>
          </div>

          {data?.attribution_last_discovered_at === null ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Hotel booking sync has not completed for this hotel yet. Revenue may be incomplete
              or show as zero until the first sync finishes.
            </div>
          ) : null}

          {summary.error ? <Notice tone="error" message={summary.error} /> : null}
          {isEmpty ? (
            <Notice tone="muted" message="No attributed bookings in this date range." />
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Conversion Rate"
              value={callsReceivedLoading ? "..." : formatPercent(conversionRate)}
              hint={
                callsReceivedLoading || callsReceived === undefined || callsBooked === undefined
                  ? undefined
                  : `${formatNumber(callsBooked)} of ${formatNumber(callsReceived)} ${
                      callBasis === "bookable" ? "bookable calls" : "calls"
                    } booked`
              }
            />
            <MetricCard
              label="ADR"
              value={summary.loading ? "..." : formatAdr(data, currency)}
              hint={
                summary.loading || !data
                  ? undefined
                  : `per night across ${formatNumber(data.room_nights)} room-nights`
              }
            />
            <MetricCard
              label="Avg Booking Value"
              value={
                summary.loading
                  ? "..."
                  : data?.avg_booking_value_cents == null
                    ? "--"
                    : formatMoney(data.avg_booking_value_cents, currency)
              }
            />
          </div>

          {data?.attribution_last_discovered_at ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Hotel booking sync last completed {formatDateTime(data.attribution_last_discovered_at)}.
            </p>
          ) : null}
        </section>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="mb-6">
              <h2 className="text-sm font-medium uppercase tracking-wide text-card-foreground">
                Daily Projected Revenue
              </h2>
              <p className="text-xs text-muted-foreground">
                Bookings bucketed by creation date in the hotel timezone
              </p>
            </div>
            <RevenueTrendChart state={summary} currency={currency} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function RevenueTrendChart({
  state,
  currency,
}: {
  state: LoadState<RevenueSummary>
  currency: string
}) {
  if (state.loading) return <ChartState message="Loading revenue..." loading />
  if (state.error) return <ChartState message={state.error} error />
  if (!state.data) return <ChartState message="Revenue will load after a hotel is selected." />
  if (state.data.booking_count === 0) {
    return <ChartState message="No attributed bookings in this date range." />
  }

  const data = state.data.trend.map((row) => ({
    date: row.date,
    revenue: row.revenue_cents / 100,
    bookings: row.booking_count,
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatDateTick}
            minTickGap={20}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={76}
            tickFormatter={(value) => formatMoney(Number(value) * 100, currency)}
          />
          <Tooltip
            formatter={(value) => [formatMoney(Number(value) * 100, currency), "Projected revenue"]}
            labelFormatter={(label) => formatDateLabel(String(label))}
          />
          <Bar dataKey="revenue" name="Projected revenue" fill="#6b7a4a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-6">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold text-card-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

function RevenueFunnel({
  metricsState,
  revenueState,
  callsReceived,
  callsReceivedLabel,
  callsReceivedLoading,
  currency,
}: {
  metricsState: LoadState<CallMetricsSummary>
  revenueState: LoadState<RevenueSummary>
  callsReceived: number | undefined
  callsReceivedLabel: string
  callsReceivedLoading: boolean
  currency: string
}) {
  const loading = metricsState.loading || revenueState.loading

  // The first stage uses the selected calls-received basis (bookable or total);
  // links and bookings come from their own queries so they match the cards below.
  const linksSent = metricsState.data?.links_sent
  const bookings = revenueState.data?.booking_count
  const revenueCents = revenueState.data?.total_revenue_cents

  const stages: FunnelStage[] = [
    {
      label: callsReceivedLabel,
      value: callsReceivedLoading ? "..." : formatNumber(callsReceived),
      share: 100,
    },
    {
      label: "Booking links sent",
      value: loading ? "..." : formatNumber(linksSent),
      share: sharePercent(linksSent, callsReceived),
      sub: rateLabel(linksSent, callsReceived, "of calls"),
    },
    {
      label: "Bookings",
      value: loading ? "..." : formatNumber(bookings),
      share: sharePercent(bookings, callsReceived),
      sub: rateLabel(bookings, linksSent, "of links"),
    },
    {
      label: "Projected revenue",
      value: loading ? "..." : formatMoney(revenueCents, currency),
      payoff: true,
    },
  ]

  return (
    <div>
      {metricsState.error ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Call volume is temporarily unavailable, so the first two stages may show “--”.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={`rounded-lg border p-4 ${
              stage.payoff ? "border-[#6b7a4a]/50 bg-[#6b7a4a]/10" : "border-border bg-card"
            }`}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {stage.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">{stage.value}</p>
            <p className="mt-1 h-4 text-xs text-muted-foreground">{stage.sub ?? ""}</p>
            {stage.payoff ? null : (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#6b7a4a]"
                  style={{ width: `${loading ? 0 : stage.share ?? 0}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DateRangeInputs({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string
  end: string
  onStart: (value: string) => void
  onEnd: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Start
        <Input
          type="date"
          value={start}
          onChange={(event) => onStart(event.target.value)}
          className="h-9 w-36 bg-card text-sm text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        End
        <Input
          type="date"
          value={end}
          onChange={(event) => onEnd(event.target.value)}
          className="h-9 w-36 bg-card text-sm text-foreground"
        />
      </label>
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
      className={`flex h-80 items-center justify-center rounded-md border px-4 text-sm ${
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

function rangeForLastDays(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - days + 1)
  return { start: toDateInput(start), end: toDateInput(end) }
}

function toDateInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

function formatNumber(value: number | undefined): string {
  return value === undefined ? "--" : value.toLocaleString()
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "--" : `${value.toFixed(1)}%`
}

// Average Daily Rate = room revenue / room-nights. Distinct from Avg Booking
// Value (revenue / bookings): ADR is per night, ABV is per reservation.
function formatAdr(data: RevenueSummary | null, currency: string): string {
  if (!data || !data.room_nights) return "--"
  return formatMoney(Math.round(data.total_revenue_cents / data.room_nights), currency)
}

function sharePercent(numerator: number | undefined, denominator: number | undefined): number {
  if (!numerator || !denominator) return 0
  return Math.max(0, Math.min(100, (numerator / denominator) * 100))
}

function rateLabel(
  numerator: number | undefined,
  denominator: number | undefined,
  suffix: string,
): string | undefined {
  if (numerator === undefined || !denominator) return undefined
  // Clamp: booking_count (revenue) and the call-based stages come from
  // different queries, so a rare >100% shouldn't render in the funnel.
  const rate = Math.min(100, Math.round((numerator / denominator) * 100))
  return `${rate}% ${suffix}`
}

function formatDateTick(value: string): string {
  const [, month, day] = value.split("-")
  return `${Number(month)}/${Number(day)}`
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
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
