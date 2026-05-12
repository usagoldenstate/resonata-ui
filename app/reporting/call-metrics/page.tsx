"use client"

import { useMemo, useState } from "react"
import { Plus, TrendingDown, TrendingUp, X } from "lucide-react"

import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const monthlyCallVolume = [
  { month: "Jan", calls: 620, booked: 151 },
  { month: "Feb", calls: 540, booked: 131 },
  { month: "Mar", calls: 910, booked: 221 },
  { month: "Apr", calls: 1260, booked: 306 },
  { month: "May", calls: 1510, booked: 367 },
  { month: "Jun", calls: 1820, booked: 442 },
  { month: "Jul", calls: 2105, booked: 512 },
  { month: "Aug", calls: 1960, booked: 476 },
  { month: "Sep", calls: 1450, booked: 352 },
  { month: "Oct", calls: 1110, booked: 270 },
  { month: "Nov", calls: 760, booked: 185 },
  { month: "Dec", calls: 674, booked: 164 },
]

const dailyCallVolume = [
  { label: "6", day: "Mon", calls: 348, booked: 85 },
  { label: "7", day: "Tue", calls: 382, booked: 93 },
  { label: "8", day: "Wed", calls: 590, booked: 143 },
  { label: "9", day: "Thu", calls: 602, booked: 146 },
  { label: "10", day: "Fri", calls: 488, booked: 119 },
  { label: "11", day: "Sat", calls: 472, booked: 115 },
  { label: "12", day: "Sun", calls: 586, booked: 142 },
  { label: "13", day: "Mon", calls: 456, booked: 111 },
  { label: "14", day: "Tue", calls: 468, booked: 114 },
  { label: "15", day: "Wed", calls: 675, booked: 164 },
  { label: "16", day: "Thu", calls: 704, booked: 171 },
  { label: "17", day: "Fri", calls: 512, booked: 124 },
  { label: "18", day: "Sat", calls: 402, booked: 98 },
  { label: "19", day: "Sun", calls: 515, booked: 125 },
  { label: "20", day: "Mon", calls: 428, booked: 104 },
  { label: "21", day: "Tue", calls: 378, booked: 92 },
  { label: "22", day: "Wed", calls: 552, booked: 134 },
  { label: "23", day: "Thu", calls: 698, booked: 170 },
  { label: "24", day: "Fri", calls: 612, booked: 149 },
  { label: "25", day: "Sat", calls: 508, booked: 123 },
  { label: "26", day: "Sun", calls: 620, booked: 151 },
  { label: "27", day: "Mon", calls: 535, booked: 130 },
  { label: "28", day: "Tue", calls: 390, booked: 95 },
  { label: "29", day: "Wed", calls: 418, booked: 102 },
  { label: "30", day: "Thu", calls: 556, booked: 135 },
  { label: "31", day: "Fri", calls: 563, booked: 137 },
  { label: "1", day: "Sat", calls: 455, booked: 111 },
  { label: "2", day: "Sun", calls: 588, booked: 143 },
  { label: "3", day: "Mon", calls: 596, booked: 145 },
  { label: "4", day: "Tue", calls: 488, booked: 119 },
]

const hourlyCallVolume = [
  { label: "12am", calls: 12 },
  { label: "1am", calls: 7 },
  { label: "2am", calls: 4 },
  { label: "3am", calls: 2 },
  { label: "4am", calls: 1 },
  { label: "5am", calls: 8 },
  { label: "6am", calls: 27 },
  { label: "7am", calls: 72 },
  { label: "8am", calls: 126 },
  { label: "9am", calls: 178 },
  { label: "10am", calls: 212 },
  { label: "11am", calls: 225 },
  { label: "12pm", calls: 198 },
  { label: "1pm", calls: 182 },
  { label: "2pm", calls: 204 },
  { label: "3pm", calls: 196 },
  { label: "4pm", calls: 160 },
  { label: "5pm", calls: 132 },
  { label: "6pm", calls: 102 },
  { label: "7pm", calls: 81 },
  { label: "8pm", calls: 63 },
  { label: "9pm", calls: 47 },
  { label: "10pm", calls: 30 },
  { label: "11pm", calls: 18 },
]

const timespanOptions = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "12", label: "Last 12 months" },
  { value: "year", label: "This year" },
]

const dailyRangeOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last month" },
]

const hourlyRangeOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
]

const monthlyRangeOptions = [
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" },
]

const chartViewOptions = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
]

type ChartView = "hourly" | "daily" | "monthly"
type ComparisonPeriod = "previous" | "lastYear" | "lastQuarter"

const getPreviousPeriodLabel = (timespan: string) => {
  if (timespan === "90") return "Previous 90 days"
  if (timespan === "12") return "Previous 12 months"
  if (timespan === "year") return "Previous year"

  return "Previous 30 days"
}

const getComparisonDateLabel = (period: ComparisonPeriod, timespan: string) => {
  if (period === "lastYear") return "Same period last year"
  if (period === "lastQuarter") return "Same period last quarter"

  return getPreviousPeriodLabel(timespan)
}

export default function CallMetricsReportingPage() {
  const [timespan, setTimespan] = useState("30")
  const [chartRange, setChartRange] = useState("12")
  const [chartView, setChartView] = useState<ChartView>("monthly")
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("previous")

  const stats = useMemo(() => {
    const totalCalls = monthlyCallVolume.reduce((acc, month) => acc + month.calls, 0)
    const totalBooked = monthlyCallVolume.reduce((acc, month) => acc + month.booked, 0)
    const conversionRate = Math.round((totalBooked / totalCalls) * 1000) / 10
    return {
      conversionRate,
      totalCalls,
      totalBooked,
      transferRate: 12.8,
    }
  }, [])

  const comparisonStats = useMemo(() => {
    const multiplier = comparisonPeriod === "lastYear" ? 0.82 : comparisonPeriod === "lastQuarter" ? 0.9 : 0.89
    const bookedMultiplier = comparisonPeriod === "lastYear" ? 0.76 : comparisonPeriod === "lastQuarter" ? 0.86 : 0.8

    return {
      conversionRate: Math.max(0, Math.round((stats.conversionRate - (comparisonPeriod === "lastYear" ? 3.6 : comparisonPeriod === "lastQuarter" ? 1.8 : 2.4)) * 10) / 10),
      totalCalls: Math.round(stats.totalCalls * multiplier),
      totalBooked: Math.round(stats.totalBooked * bookedMultiplier),
      transferRate: Math.max(0, Math.round((stats.transferRate - (comparisonPeriod === "lastYear" ? 1.5 : comparisonPeriod === "lastQuarter" ? 0.9 : 1.2)) * 10) / 10),
    }
  }, [comparisonPeriod, stats])

  const comparisonOptions = [
    { value: "previous", label: getPreviousPeriodLabel(timespan) },
    { value: "lastYear", label: "Same period last year" },
    { value: "lastQuarter", label: "Same period last quarter" },
  ]
  const comparisonDateLabel = getComparisonDateLabel(comparisonPeriod, timespan)
  const chartRangeOptions = chartView === "daily" ? dailyRangeOptions : chartView === "monthly" ? monthlyRangeOptions : hourlyRangeOptions

  const handleChartViewChange = (value: ChartView) => {
    setChartView(value)
    setChartRange(value === "daily" ? "30" : value === "monthly" ? "12" : "30")
  }

  const chartConfig = useMemo(() => {
    if (chartView === "hourly") {
      const peak = hourlyCallVolume.reduce((top, hour) => (hour.calls > top.calls ? hour : top), hourlyCallVolume[0])
      const quietest = hourlyCallVolume.reduce((low, hour) => (hour.calls < low.calls ? hour : low), hourlyCallVolume[0])

      return {
        title: "Hourly Call Volume",
        description: "Average calls per hour across the selected window.",
        data: hourlyCallVolume,
        barColor: "#c8aa5a",
        legend: "Avg calls per hour",
        axisLabel: "Hour of Day",
        yLabels: ["300", "225", "150", "75", "0"],
        metrics: [
          { label: "Peak hour", value: peak.label },
          { label: "Quietest", value: quietest.label },
        ],
        labelEvery: 3,
        fillColumns: true,
        labelClassName: "",
      }
    }

    if (chartView === "daily") {
      const days = chartRange === "7" || chartRange === "14" ? Number(chartRange) : 30
      const dailyData = dailyCallVolume.slice(-days)
      const peak = dailyData.reduce((top, day) => (day.calls > top.calls ? day : top), dailyData[0])
      const total = dailyData.reduce((sum, day) => sum + day.calls, 0)
      const labelEvery = days === 30 ? 5 : days === 14 ? 2 : 1

      return {
        title: "Daily Call Volume",
        description: "Total calls per day across the selected window.",
        data: dailyData,
        barColor: "#6b7a4a",
        legend: "Calls per day",
        axisLabel: "Date",
        yLabels: ["900", "675", "450", "225", "0"],
        metrics: [
          { label: "Peak", value: peak.day },
          { label: "Avg / day", value: Math.round(total / dailyData.length).toString() },
        ],
        labelEvery,
        fillColumns: false,
        labelClassName: "",
      }
    }

    const monthlyData = monthlyCallVolume
      .slice(chartRange === "6" ? -6 : chartRange === "ytd" ? 0 : -12)
      .map((month) => ({
        label: month.month,
        calls: month.calls,
        booked: month.booked,
      }))
    const peakMonth = monthlyData.reduce((peak, month) => (month.calls > peak.calls ? month : peak), monthlyData[0])
    const totalCalls = monthlyData.reduce((total, month) => total + month.calls, 0)

    return {
      title: "Monthly Call Volume",
      description: "Total calls grouped by month - seasonality at a glance.",
      data: monthlyData,
      barColor: "#9ca3af",
      legend: "Calls per month",
      axisLabel: "Month",
      yLabels: ["2.7k", "2.0k", "1.4k", "675", "0"],
      metrics: [
        { label: "Peak", value: peakMonth.label },
        { label: "Total", value: totalCalls.toLocaleString() },
      ],
      labelEvery: 1,
      fillColumns: false,
      labelClassName: "",
    }
  }, [chartRange, chartView])

  const chartMax = Math.max(...chartConfig.data.map((item) => item.calls))

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Call Metrics</h1>
            <p className="text-sm text-muted-foreground">
              Track booking performance and call patterns from your voice agent
            </p>
          </div>
        </div>

        <section className="mb-8">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-foreground uppercase tracking-wide">
                  Conversion Metrics
                </h2>
                <p className="text-xs text-muted-foreground">
                  Updates when the date range changes
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
              <MetricCard
                label="Conversion Rate"
                value={`${stats.conversionRate}%`}
                trend="2.4pp vs prior period"
                direction="up"
              />
              <MetricCard
                label="Total Call Volume"
                value={stats.totalCalls.toLocaleString()}
                trend="12% vs prior period"
                direction="up"
              />
              <MetricCard
                label="Calls Booked"
                value={stats.totalBooked.toLocaleString()}
                trend="18% vs prior period"
                direction="up"
              />
              <MetricCard
                label="Transfer Rate"
                value={`${stats.transferRate}%`}
                trend="1.2pp vs prior period"
                direction="down"
              />
            </div>

            {!showComparison ? (
              <Button
                variant="outline"
                onClick={() => setShowComparison(true)}
                className="border-border"
              >
                <Plus className="w-4 h-4 mr-2" />
                Compare with another period
              </Button>
            ) : null}

            {showComparison ? (
              <div className="relative mt-6 rounded-lg border border-border bg-card p-5 pt-12 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowComparison(false)}
                  aria-label="Remove comparison"
                  className="absolute right-4 top-4 h-7 w-7 text-card-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>

                <div className="mb-5 flex justify-end">
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <span className="text-sm font-medium text-muted-foreground">Comparing with:</span>
                    <Select value={comparisonPeriod} onValueChange={(value) => setComparisonPeriod(value as ComparisonPeriod)}>
                      <SelectTrigger className="h-10 w-56 bg-card border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {comparisonOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <ComparisonMetricCard
                    label="Conversion Rate"
                    value={`${comparisonStats.conversionRate}%`}
                    period={comparisonDateLabel}
                  />
                  <ComparisonMetricCard
                    label="Total Call Volume"
                    value={comparisonStats.totalCalls.toLocaleString()}
                    period={comparisonDateLabel}
                  />
                  <ComparisonMetricCard
                    label="Calls Booked"
                    value={comparisonStats.totalBooked.toLocaleString()}
                    period={comparisonDateLabel}
                  />
                  <ComparisonMetricCard
                    label="Transfer Rate"
                    value={`${comparisonStats.transferRate}%`}
                    period={comparisonDateLabel}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-12">
              <div>
                <h2 className="text-sm font-medium text-card-foreground uppercase tracking-wide">
                  {chartConfig.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {chartConfig.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {chartConfig.metrics.map((metric, index) => (
                  <div key={metric.label} className="flex items-center gap-3">
                    {index > 0 && <span className="h-4 w-px bg-border" />}
                    <span>
                      {metric.label}: <span className="text-card-foreground">{metric.value}</span>
                    </span>
                  </div>
                ))}
                <Select value={chartView} onValueChange={(value) => handleChartViewChange(value as ChartView)}>
                  <SelectTrigger className="h-9 w-32 bg-card border-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chartViewOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={chartRange} onValueChange={setChartRange}>
                  <SelectTrigger className="h-9 w-40 bg-card border-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chartRangeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="relative h-72 pl-12 pb-16 mt-2">
              <div className="absolute inset-x-12 top-0 h-px bg-border" />
              <div className="absolute inset-x-12 top-[25%] h-px bg-border" />
              <div className="absolute inset-x-12 top-[50%] h-px bg-border" />
              <div className="absolute inset-x-12 top-[75%] h-px bg-border" />
              <div className="absolute inset-x-12 bottom-16 h-px bg-[#cfc8ba]" />

              <div className="absolute left-0 top-0 bottom-16 flex flex-col justify-between text-[11px] text-muted-foreground">
                {chartConfig.yLabels.map((label) => (
                  <span key={label} className="min-w-8 text-right leading-none">
                    {label}
                  </span>
                ))}
              </div>
              <div className="absolute left-2 top-[-22px] text-[10px] font-medium uppercase text-muted-foreground">
                Calls
              </div>

              <div
                className="absolute left-12 right-0 top-0 bottom-16 z-10 grid items-end gap-4 pr-4"
                style={{ gridTemplateColumns: `repeat(${chartConfig.data.length}, minmax(0, 1fr))` }}
              >
                {chartConfig.data.map((item, index) => (
                  <div key={item.label} className="flex h-full items-end">
                    <div
                      className="group relative w-full rounded-t transition-opacity hover:opacity-85"
                      style={{
                        height: `${(item.calls / chartMax) * 72}%`,
                        backgroundColor: chartConfig.barColor,
                      }}
                    >
                      <div className="absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-card-foreground px-2 py-1 text-xs text-white group-hover:block">
                        {item.calls.toLocaleString()} calls
                        {"booked" in item && item.booked
                          ? ` · ${item.booked.toLocaleString()} booked`
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="absolute left-12 right-0 bottom-7 grid gap-4 pr-4"
                style={{ gridTemplateColumns: `repeat(${chartConfig.data.length}, minmax(0, 1fr))` }}
              >
                {chartConfig.data.map((item, index) => (
                  <span
                    key={item.label}
                    className={`text-center text-xs text-muted-foreground ${chartConfig.labelClassName}`}
                  >
                    {index % chartConfig.labelEvery === 0 ? item.label : ""}
                  </span>
                ))}
              </div>

              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase text-muted-foreground">
                {chartConfig.axisLabel}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-4">
              <span className="h-3 w-3 rounded" style={{ backgroundColor: chartConfig.barColor }} />
              <span className="text-xs text-muted-foreground">{chartConfig.legend}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function ComparisonMetricCard({
  label,
  value,
  period,
}: {
  label: string
  value: string
  period: string
}) {
  return (
    <Card className="border-dashed border-border bg-card">
      <CardContent className="p-6">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold text-muted-foreground">{value}</p>
        <p className="mt-2 text-sm text-muted-foreground">{period}</p>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  label,
  value,
  trend,
  direction,
}: {
  label: string
  value: string
  trend: string
  direction: "up" | "down"
}) {
  const positive = direction === "up"

  return (
    <Card className="border-border">
      <CardContent className="p-6">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold text-card-foreground">{value}</p>
        <p className={`mt-2 flex items-center gap-1 text-xs ${positive ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend}
        </p>
      </CardContent>
    </Card>
  )
}
