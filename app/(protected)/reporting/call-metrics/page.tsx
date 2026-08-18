"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
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

import {
  DateRangeFilter,
  DateRangeInputs,
  MonthRangeInputs,
  makePresets,
} from "@/components/date-range-filter"
import { RefreshButton } from "@/components/refresh-button"
import { Sidebar } from "@/components/sidebar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
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
import {
  dateRangeError,
  monthRangeError,
  rangeForLastDays,
  rangeForLastMonths,
} from "@/lib/date-range"
import { useHotel } from "@/lib/hotel-context"

type ChartView = "hourly" | "daily" | "monthly"

type LoadState<T> = {
  loading: boolean
  data: T | null
  error: string | null
}

const summaryPresets = makePresets(["7", "14", "30"])

// Backend caps (see api/reporting.py validators). Checking them client-side
// keeps mid-edit and out-of-range inputs from ever hitting the network.
const DAILY_RANGE_CAP_DAYS = 183
const MONTHLY_RANGE_CAP_MONTHS = 24
// Date/number inputs fire onChange per keystroke; the SWR key is derived from
// the debounced value so only the settled value triggers a fetch.
const FETCH_DEBOUNCE_MS = 400

export default function CallMetricsReportingPage() {
  const {
    hotelId,
    hotelTimezone,
    loading: hotelLoading,
    error: hotelError,
    accessState,
  } = useHotel()
  const [summaryPreset, setSummaryPreset] = useState("30")
  const [summaryStart, setSummaryStart] = useState(() => rangeForLastDays(30).start)
  const [summaryEnd, setSummaryEnd] = useState(() => rangeForLastDays(30).end)
  const [chartView, setChartView] = useState<ChartView>("hourly")
  const [dailyStart, setDailyStart] = useState(() => rangeForLastDays(30).start)
  const [dailyEnd, setDailyEnd] = useState(() => rangeForLastDays(30).end)
  const [monthlyStart, setMonthlyStart] = useState(() => rangeForLastMonths(12).start)
  const [monthlyEnd, setMonthlyEnd] = useState(() => rangeForLastMonths(12).end)

  // Immediate values drive input validation messages so typos are flagged
  // right away; debounced values drive the SWR keys below so a fetch only
  // fires once the user pauses.
  const summaryRangeError = dateRangeError(summaryStart, summaryEnd, DAILY_RANGE_CAP_DAYS)
  const dailyChartRangeError = dateRangeError(dailyStart, dailyEnd, DAILY_RANGE_CAP_DAYS)
  const monthlyChartRangeError = monthRangeError(monthlyStart, monthlyEnd, MONTHLY_RANGE_CAP_MONTHS)

  const debouncedSummaryStart = useDebouncedValue(summaryStart, FETCH_DEBOUNCE_MS)
  const debouncedSummaryEnd = useDebouncedValue(summaryEnd, FETCH_DEBOUNCE_MS)
  const debouncedDailyStart = useDebouncedValue(dailyStart, FETCH_DEBOUNCE_MS)
  const debouncedDailyEnd = useDebouncedValue(dailyEnd, FETCH_DEBOUNCE_MS)
  const debouncedMonthlyStart = useDebouncedValue(monthlyStart, FETCH_DEBOUNCE_MS)
  const debouncedMonthlyEnd = useDebouncedValue(monthlyEnd, FETCH_DEBOUNCE_MS)

  // Presets anchor to "today" in the hotel's timezone (matching how the
  // backend buckets calls), so recompute when the preset or hotel changes.
  useEffect(() => {
    if (summaryPreset === "custom") return
    const range = rangeForLastDays(Number(summaryPreset), hotelTimezone)
    setSummaryStart(range.start)
    setSummaryEnd(range.end)
  }, [hotelTimezone, summaryPreset])

  const summaryKey =
    hotelId && !dateRangeError(debouncedSummaryStart, debouncedSummaryEnd, DAILY_RANGE_CAP_DAYS)
      ? (["call-metrics-summary", hotelId, debouncedSummaryStart, debouncedSummaryEnd] as const)
      : null
  const {
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryErrorRaw,
    mutate: refreshSummary,
  } = useSWR(summaryKey, ([, hid, start, end]) =>
    fetchCallMetricsSummary({
      hotel_id: hid,
      start_date: start,
      end_date: end,
    }),
  )
  const summary: LoadState<CallMetricsSummary> = {
    loading: summaryLoading,
    data: summaryData ?? null,
    error: summaryErrorRaw ? describeError(summaryErrorRaw) : null,
  }

  const hourlyKey =
    hotelId && chartView === "hourly" ? (["call-metrics-hourly", hotelId] as const) : null
  const {
    data: hourlyData,
    isLoading: hourlyLoading,
    error: hourlyErrorRaw,
    mutate: refreshHourly,
  } = useSWR(hourlyKey, ([, hid]) => fetchCallMetricsHourly({ hotel_id: hid }))
  const hourly: LoadState<CallMetricsHourlyResponse> = {
    loading: hourlyLoading,
    data: hourlyData ?? null,
    error: hourlyErrorRaw ? describeError(hourlyErrorRaw) : null,
  }

  const dailyKey =
    hotelId &&
    chartView === "daily" &&
    !dateRangeError(debouncedDailyStart, debouncedDailyEnd, DAILY_RANGE_CAP_DAYS)
      ? (["call-metrics-daily", hotelId, debouncedDailyStart, debouncedDailyEnd] as const)
      : null
  const {
    data: dailyData,
    isLoading: dailyLoading,
    error: dailyErrorRaw,
    mutate: refreshDaily,
  } = useSWR(dailyKey, ([, hid, start, end]) =>
    fetchCallMetricsDaily({
      hotel_id: hid,
      start_date: start,
      end_date: end,
    }),
  )
  const daily: LoadState<CallMetricsDailyRow[]> = {
    loading: dailyLoading,
    data: dailyData ?? null,
    error: dailyErrorRaw ? describeError(dailyErrorRaw) : null,
  }

  const monthlyKey =
    hotelId &&
    chartView === "monthly" &&
    !monthRangeError(debouncedMonthlyStart, debouncedMonthlyEnd, MONTHLY_RANGE_CAP_MONTHS)
      ? (["call-metrics-monthly", hotelId, debouncedMonthlyStart, debouncedMonthlyEnd] as const)
      : null
  const {
    data: monthlyData,
    isLoading: monthlyLoading,
    error: monthlyErrorRaw,
    mutate: refreshMonthly,
  } = useSWR(monthlyKey, ([, hid, start, end]) =>
    fetchCallMetricsMonthly({
      hotel_id: hid,
      start_month: start,
      end_month: end,
    }),
  )
  const monthly: LoadState<CallMetricsMonthlyRow[]> = {
    loading: monthlyLoading,
    data: monthlyData ?? null,
    error: monthlyErrorRaw ? describeError(monthlyErrorRaw) : null,
  }

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    const chartRefresh =
      chartView === "hourly" ? refreshHourly : chartView === "daily" ? refreshDaily : refreshMonthly
    try {
      await Promise.all([refreshSummary(), chartRefresh()])
    } finally {
      setRefreshing(false)
    }
  }

  const summaryEmpty = summaryData !== null && summaryData !== undefined && summaryData.total_calls === 0

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
          <div className="flex items-end gap-3">
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
                : "Select a hotel to view call metrics."
            }
          />
        ) : null}

        <section className="mb-10">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                Conversion Metrics
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Based on call creation date in the hotel timezone
              </p>
            </div>
            <DateRangeFilter
              variant="toolbar"
              presets={summaryPresets}
              timespan={summaryPreset}
              range={{ start: summaryStart, end: summaryEnd }}
              customStart={summaryStart}
              customEnd={summaryEnd}
              rangeError={summaryPreset === "custom" ? summaryRangeError : null}
              onSelectTimespan={setSummaryPreset}
              onCustomStart={setSummaryStart}
              onCustomEnd={setSummaryEnd}
            />
          </div>

          {summary.data?.attribution_last_discovered_at === null ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Hotel booking sync has not completed for this hotel yet. Call volume is live; booked and conversion metrics may be incomplete.
            </div>
          ) : null}

          {summary.error ? <Notice tone="error" message={summary.error} /> : null}
          {summaryEmpty ? <Notice tone="muted" message="No calls found in this date range." /> : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Call Volume"
              value={summary.loading ? "..." : formatNumber(summaryData?.total_calls)}
            />
            <MetricCard
              label="Total Call Minutes"
              value={summary.loading ? "..." : formatMinutes(summaryData?.total_call_seconds)}
              hint={
                summary.loading || !summaryData || summaryData.total_call_seconds === 0
                  ? undefined
                  : formatHoursHint(summaryData.total_call_seconds)
              }
            />
            <MetricCard
              label="Avg Call Duration"
              value={
                summary.loading
                  ? "..."
                  : formatAvgDuration(summaryData?.total_call_seconds, summaryData?.total_calls)
              }
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

        <section>
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                  Call Volume
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
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
                    error={dailyChartRangeError}
                  />
                ) : null}
                {chartView === "monthly" ? (
                  <MonthRangeInputs
                    start={monthlyStart}
                    end={monthlyEnd}
                    onStart={setMonthlyStart}
                    onEnd={setMonthlyEnd}
                    error={monthlyChartRangeError}
                  />
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl bg-card p-6">
            {chartView === "hourly" ? <HourlyChart state={hourly} /> : null}
            {chartView === "daily" ? <DailyChart state={daily} /> : null}
            {chartView === "monthly" ? <MonthlyChart state={monthly} /> : null}
            </div>
        </section>
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
            <Bar dataKey="avg_calls" name="Avg calls" fill="#e8622c" radius={[4, 4, 0, 0]} />
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
            stroke="#e8622c"
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
          <Bar dataKey="calls" name="Calls" fill="#e8622c" radius={[4, 4, 0, 0]} />
          <Bar dataKey="booked" name="Booked" fill="#c8aa5a" radius={[4, 4, 0, 0]} />
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
    <div className="rounded-2xl bg-card px-5 py-5">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        {label}
      </p>
      <p className="text-3xl font-extrabold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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

function formatNumber(value: number | undefined): string {
  return value === undefined ? "--" : value.toLocaleString()
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "--" : `${value.toFixed(1)}%`
}

function formatMinutes(seconds: number | undefined): string {
  if (seconds === undefined) return "--"
  return `${Math.round(seconds / 60).toLocaleString()} min`
}

function formatHoursHint(seconds: number): string {
  return `≈ ${(seconds / 3600).toFixed(1)} hrs handled`
}

function formatAvgDuration(
  totalSeconds: number | undefined,
  totalCalls: number | undefined,
): string {
  if (totalSeconds === undefined || !totalCalls) return "--"
  const avg = Math.round(totalSeconds / totalCalls)
  if (avg < 60) return `${avg}s`
  const minutes = Math.floor(avg / 60)
  const remainder = avg % 60
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`
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
    // FastAPI validation errors carry detail as [{loc, msg, type}, ...].
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) =>
          typeof (item as { msg?: unknown } | null)?.msg === "string"
            ? (item as { msg: string }).msg
            : null,
        )
        .filter((msg): msg is string => msg !== null)
      if (messages.length > 0) return messages.join("; ")
    }
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
