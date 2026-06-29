"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
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
import { ApiError, type RevenueSummary, fetchRevenueSummary } from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

type SummaryPreset = "7" | "14" | "30" | "custom"

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

export default function RevenueReportingPage() {
  const { hotelId, loading: hotelLoading, error: hotelError, accessState } = useHotel()
  const [preset, setPreset] = useState<SummaryPreset>("30")
  const [start, setStart] = useState(() => rangeForLastDays(30).start)
  const [end, setEnd] = useState(() => rangeForLastDays(30).end)
  const [summary, setSummary] = useState<LoadState<RevenueSummary>>(() => emptyState())

  useEffect(() => {
    if (!hotelId) {
      setSummary(emptyState())
      return
    }

    const controller = new AbortController()
    setSummary({ loading: true, data: null, error: null })
    fetchRevenueSummary(
      { hotel_id: hotelId, start_date: start, end_date: end, basis: "projected" },
      { signal: controller.signal },
    )
      .then((data) => setSummary({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setSummary({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [hotelId, start, end])

  const data = summary.data
  const currency = data?.currency ?? "USD"
  const isEmpty = data !== null && data.booking_count === 0

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
            <p className="text-sm text-muted-foreground">
              Projected room revenue from bookings attributed to the voice agent
            </p>
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
                : "Select a hotel to view revenue."
            }
          />
        ) : null}

        <section className="mb-8 rounded-lg border border-border p-4">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wide text-foreground">
                Projected Revenue
              </h2>
              <p className="text-xs text-muted-foreground">
                Pre-tax room estimate (excludes taxes, fees &amp; extras) · based on booking
                creation date in the hotel timezone
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-2">
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
              </div>
              {preset === "custom" ? (
                <DateRangeInputs start={start} end={end} onStart={setStart} onEnd={setEnd} />
              ) : null}
            </div>
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Projected Room Revenue"
              value={summary.loading ? "..." : formatMoney(data?.total_revenue_cents, currency)}
            />
            <MetricCard
              label="Bookings"
              value={summary.loading ? "..." : formatNumber(data?.booking_count)}
            />
            <MetricCard
              label="Room-nights"
              value={summary.loading ? "..." : formatNumber(data?.room_nights)}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-6">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold text-card-foreground">{value}</p>
      </CardContent>
    </Card>
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
