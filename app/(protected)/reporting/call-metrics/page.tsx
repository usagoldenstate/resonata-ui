"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarDays, Loader2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ApiError,
  type CallMetricsDailyRow,
  type CallMetricsHourlyResponse,
  type CallMetricsMonthlyRow,
  type CallMetricsSummary,
  fetchCallMetricsDaily,
  fetchCallMetricsHourly,
  fetchCallMetricsMonthly,
  fetchCallMetricsSummary,
} from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

type ChartView = "hourly" | "daily" | "monthly"
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

export default function CallMetricsReportingPage() {
  const { hotelId, loading: hotelLoading, error: hotelError } = useHotel()
  const [summaryPreset, setSummaryPreset] = useState<SummaryPreset>("7")
  const [summaryStart, setSummaryStart] = useState(() => rangeForLastDays(7).start)
  const [summaryEnd, setSummaryEnd] = useState(() => rangeForLastDays(7).end)
  const [chartView, setChartView] = useState<ChartView>("hourly")
  const [dailyStart, setDailyStart] = useState(() => rangeForLastDays(30).start)
  const [dailyEnd, setDailyEnd] = useState(() => rangeForLastDays(30).end)
  const [monthlyStart, setMonthlyStart] = useState(() => rangeForLastMonths(12).start)
  const [monthlyEnd, setMonthlyEnd] = useState(() => rangeForLastMonths(12).end)
  const [minDuration, setMinDuration] = useState("0")

  const minDurationSeconds = useMemo(() => {
    const parsed = Number.parseInt(minDuration, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [minDuration])

  const [summary, setSummary] = useState<LoadState<CallMetricsSummary>>(() => emptyState())
  const [hourly, setHourly] = useState<LoadState<CallMetricsHourlyResponse>>(() => emptyState())
  const [daily, setDaily] = useState<LoadState<CallMetricsDailyRow[]>>(() => emptyState())
  const [monthly, setMonthly] = useState<LoadState<CallMetricsMonthlyRow[]>>(() => emptyState())

  useEffect(() => {
    if (!hotelId) {
      setSummary(emptyState())
      return
    }

    const controller = new AbortController()
    setSummary({ loading: true, data: null, error: null })
    fetchCallMetricsSummary(
      {
        hotel_id: hotelId,
        start_date: summaryStart,
        end_date: summaryEnd,
        min_duration_seconds: minDurationSeconds,
      },
      { signal: controller.signal },
    )
      .then((data) => setSummary({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setSummary({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [hotelId, minDurationSeconds, summaryEnd, summaryStart])

  useEffect(() => {
    if (!hotelId || chartView !== "hourly") return

    const controller = new AbortController()
    setHourly({ loading: true, data: null, error: null })
    fetchCallMetricsHourly(
      { hotel_id: hotelId, min_duration_seconds: minDurationSeconds },
      { signal: controller.signal },
    )
      .then((data) => setHourly({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setHourly({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [chartView, hotelId, minDurationSeconds])

  useEffect(() => {
    if (!hotelId || chartView !== "daily") return

    const controller = new AbortController()
    setDaily({ loading: true, data: null, error: null })
    fetchCallMetricsDaily(
      {
        hotel_id: hotelId,
        start_date: dailyStart,
        end_date: dailyEnd,
        min_duration_seconds: minDurationSeconds,
      },
      { signal: controller.signal },
    )
      .then((data) => setDaily({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setDaily({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [chartView, dailyEnd, dailyStart, hotelId, minDurationSeconds])

  useEffect(() => {
    if (!hotelId || chartView !== "monthly") return

    const controller = new AbortController()
    setMonthly({ loading: true, data: null, error: null })
    fetchCallMetricsMonthly(
      {
        hotel_id: hotelId,
        start_month: monthlyStart,
        end_month: monthlyEnd,
        min_duration_seconds: minDurationSeconds,
      },
      { signal: controller.signal },
    )
      .then((data) => setMonthly({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setMonthly({ loading: false, data: null, error: describeError(error) })
      })

    return () => controller.abort()
  }, [chartView, hotelId, minDurationSeconds, monthlyEnd, monthlyStart])

  const summaryData = summary.data
  const summaryEmpty = summaryData !== null && summaryData.total_calls === 0

  const onPresetChange = (preset: SummaryPreset) => {
    setSummaryPreset(preset)
    if (preset === "custom") return
    const range = rangeForLastDays(Number(preset))
    setSummaryStart(range.start)
    setSummaryEnd(range.end)
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Call Metrics</h1>
            <p className="text-sm text-muted-foreground">
              Track booking conversion and call patterns from live voice-agent records
            </p>
          </div>
          <label className="flex w-48 flex-col gap-1 text-xs text-muted-foreground">
            Min duration
            <Input
              type="number"
              min={0}
              value={minDuration}
              onChange={(event) => setMinDuration(event.target.value)}
              className="h-9 bg-card text-sm text-foreground"
            />
          </label>
        </div>

        {hotelLoading ? (
          <Notice tone="muted" message="Loading hotel selection..." />
        ) : hotelError ? (
          <Notice tone="error" message={hotelError} />
        ) : !hotelId ? (
          <Notice tone="muted" message="Select a hotel to view call metrics." />
        ) : null}

        <section className="mb-8 rounded-lg border border-border p-4">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wide text-foreground">
                Conversion Metrics
              </h2>
              <p className="text-xs text-muted-foreground">
                Based on call creation date in the hotel timezone
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-2">
                {(["7", "14", "30", "custom"] as const).map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={summaryPreset === preset ? "default" : "outline"}
                    onClick={() => onPresetChange(preset)}
                  >
                    {preset === "custom" ? "Custom" : `${preset} days`}
                  </Button>
                ))}
              </div>
              {summaryPreset === "custom" ? (
                <DateRangeInputs
                  start={summaryStart}
                  end={summaryEnd}
                  onStart={setSummaryStart}
                  onEnd={setSummaryEnd}
                />
              ) : null}
            </div>
          </div>

          {summary.data?.attribution_last_discovered_at === null ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Hotel booking sync has not completed for this hotel yet. Call volume is live; booked and conversion metrics may be incomplete.
            </div>
          ) : null}

          {summary.error ? <Notice tone="error" message={summary.error} /> : null}
          {summaryEmpty ? <Notice tone="muted" message="No calls found in this date range." /> : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Conversion Rate"
              value={summary.loading ? "..." : formatPercent(summaryData?.conversion_rate)}
            />
            <MetricCard
              label="Total Call Volume"
              value={summary.loading ? "..." : formatNumber(summaryData?.total_calls)}
            />
            <MetricCard
              label="Calls Booked"
              value={summary.loading ? "..." : formatNumber(summaryData?.calls_booked)}
            />
            <MetricCard
              label="Customer Satisfaction Score"
              value={
                summary.loading
                  ? "..."
                  : formatPercent(summaryData?.csat_score ?? undefined)
              }
            />
          </div>

          {summary.data?.attribution_last_discovered_at ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Hotel booking sync last completed {formatDateTime(summary.data.attribution_last_discovered_at)}.
            </p>
          ) : null}
        </section>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wide text-card-foreground">
                  Call Volume
                </h2>
                <p className="text-xs text-muted-foreground">
                  Hourly averages, daily totals, and monthly seasonality
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Select value={chartView} onValueChange={(value) => setChartView(value as ChartView)}>
                  <SelectTrigger className="h-9 w-32 bg-card border-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                {chartView === "hourly" ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Last 30 completed hotel-local days
                  </div>
                ) : null}
                {chartView === "daily" ? (
                  <DateRangeInputs
                    start={dailyStart}
                    end={dailyEnd}
                    onStart={setDailyStart}
                    onEnd={setDailyEnd}
                  />
                ) : null}
                {chartView === "monthly" ? (
                  <MonthRangeInputs
                    start={monthlyStart}
                    end={monthlyEnd}
                    onStart={setMonthlyStart}
                    onEnd={setMonthlyEnd}
                  />
                ) : null}
              </div>
            </div>

            {chartView === "hourly" ? <HourlyChart state={hourly} /> : null}
            {chartView === "daily" ? <DailyChart state={daily} /> : null}
            {chartView === "monthly" ? <MonthlyChart state={monthly} /> : null}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function HourlyChart({ state }: { state: LoadState<CallMetricsHourlyResponse> }) {
  if (state.loading) return <ChartState message="Loading hourly volume..." loading />
  if (state.error) return <ChartState message={state.error} error />
  if (!state.data) return <ChartState message="Hourly volume will load after a hotel is selected." />

  const data = state.data.hours.map((row) => ({
    hour: row.hour,
    label: formatHour(row.hour),
    calls: row.calls,
    avg_calls: row.avg_calls,
  }))
  const hasCalls = data.some((row) => row.calls > 0)
  if (!hasCalls) {
    return <ChartState message="No calls found in the last 30 completed hotel-local days." />
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          Coverage days: <span className="text-card-foreground">{state.data.coverage_days}</span>
        </span>
        <span>
          Peak hour: <span className="text-card-foreground">{peakHourlyLabel(data)}</span>
        </span>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" interval={2} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} allowDecimals />
            <Tooltip
              formatter={(value, name) => [
                name === "avg_calls" ? Number(value).toFixed(2) : value,
                name === "avg_calls" ? "Avg calls" : "Calls",
              ]}
              labelFormatter={(label) => `Hour: ${label}`}
            />
            <Bar dataKey="avg_calls" name="Avg calls" fill="#6b7a4a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function DailyChart({ state }: { state: LoadState<CallMetricsDailyRow[]> }) {
  if (state.loading) return <ChartState message="Loading daily volume..." loading />
  if (state.error) return <ChartState message={state.error} error />
  if (!state.data) return <ChartState message="Daily volume will load when selected." />
  if (!state.data.some((row) => row.calls > 0 || row.booked > 0)) {
    return <ChartState message="No calls found in this daily range." />
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={state.data} margin={{ top: 12, right: 24, left: 0, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatDateTick}
            minTickGap={20}
          />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip labelFormatter={(label) => formatDateLabel(String(label))} />
          <Legend />
          <Line
            type="monotone"
            dataKey="calls"
            name="Calls"
            stroke="#6b7a4a"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="booked"
            name="Booked"
            stroke="#c8aa5a"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MonthlyChart({ state }: { state: LoadState<CallMetricsMonthlyRow[]> }) {
  if (state.loading) return <ChartState message="Loading monthly volume..." loading />
  if (state.error) return <ChartState message={state.error} error />
  if (!state.data) return <ChartState message="Monthly volume will load when selected." />
  if (!state.data.some((row) => row.calls > 0 || row.booked > 0)) {
    return <ChartState message="No calls found in this monthly range." />
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={state.data} margin={{ top: 12, right: 24, left: 0, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatMonthTick}
            minTickGap={14}
          />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip labelFormatter={(label) => formatMonthLabel(String(label))} />
          <Legend />
          <Bar dataKey="calls" name="Calls" fill="#6b7a4a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="booked" name="Booked" fill="#c8aa5a" radius={[4, 4, 0, 0]} />
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

function MonthRangeInputs({
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
          type="month"
          value={start}
          onChange={(event) => onStart(event.target.value)}
          className="h-9 w-36 bg-card text-sm text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        End
        <Input
          type="month"
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

function formatNumber(value: number | undefined): string {
  return value === undefined ? "--" : value.toLocaleString()
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "--" : `${value.toFixed(1)}%`
}

function formatHour(hour: number): string {
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}${hour < 12 ? "am" : "pm"}`
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

function formatMonthTick(value: string): string {
  const [, month] = value.split("-").map(Number)
  return new Date(2026, month - 1, 1).toLocaleDateString(undefined, { month: "short" })
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
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

function peakHourlyLabel(data: Array<{ label: string; calls: number }>): string {
  const peak = data.reduce((top, row) => (row.calls > top.calls ? row : top), data[0])
  return peak.label
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
