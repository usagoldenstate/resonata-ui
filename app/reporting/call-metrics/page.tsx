"use client"

import { useMemo, useState } from "react"
import { Plus, TrendingDown, TrendingUp } from "lucide-react"

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
  { label: "Mon", calls: 212, booked: 52 },
  { label: "Tue", calls: 238, booked: 58 },
  { label: "Wed", calls: 246, booked: 60 },
  { label: "Thu", calls: 252, booked: 61 },
  { label: "Fri", calls: 274, booked: 67 },
  { label: "Sat", calls: 229, booked: 56 },
  { label: "Sun", calls: 196, booked: 48 },
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

const chartViewOptions = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
]

type ChartView = "hourly" | "daily" | "monthly"

export default function CallMetricsReportingPage() {
  const [timespan, setTimespan] = useState("30")
  const [chartRange, setChartRange] = useState("12")
  const [chartView, setChartView] = useState<ChartView>("monthly")
  const [showComparison, setShowComparison] = useState(false)

  const stats = useMemo(() => {
    const totalCalls = monthlyCallVolume.reduce((acc, month) => acc + month.calls, 0)
    const totalBooked = monthlyCallVolume.reduce((acc, month) => acc + month.booked, 0)
    const conversionRate = Math.round((totalBooked / totalCalls) * 1000) / 10
    const peakMonth = monthlyCallVolume.reduce((peak, month) => (month.calls > peak.calls ? month : peak), monthlyCallVolume[0])

    return {
      conversionRate,
      totalCalls,
      totalBooked,
      missed: totalCalls - totalBooked,
      peakMonth,
      maxMonthlyVolume: Math.max(...monthlyCallVolume.map((month) => month.calls)),
    }
  }, [])

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
      const peak = dailyCallVolume.reduce((top, day) => (day.calls > top.calls ? day : top), dailyCallVolume[0])
      const total = dailyCallVolume.reduce((sum, day) => sum + day.calls, 0)

      return {
        title: "Daily Call Volume",
        description: "Average calls by day of week across the selected window.",
        data: dailyCallVolume,
        barColor: "#6b7a4a",
        legend: "Avg calls per day",
        axisLabel: "Day of Week",
        yLabels: ["300", "225", "150", "75", "0"],
        metrics: [
          { label: "Peak day", value: peak.label },
          { label: "Weekly avg", value: Math.round(total / dailyCallVolume.length).toString() },
        ],
        labelEvery: 1,
        fillColumns: false,
        labelClassName: "translate-y-3",
      }
    }

    return {
      title: "Monthly Call Volume",
      description: "Total calls grouped by month - seasonality at a glance.",
      data: monthlyCallVolume.map((month) => ({
        label: month.month,
        calls: month.calls,
        booked: month.booked,
      })),
      barColor: "#6b7a4a",
      legend: "Calls per month",
      axisLabel: "Month",
      yLabels: ["2.7k", "2.0k", "1.4k", "675", "0"],
      metrics: [
        { label: "Peak", value: stats.peakMonth.month },
        { label: "Total", value: stats.totalCalls.toLocaleString() },
      ],
      labelEvery: 1,
      fillColumns: false,
      labelClassName: "",
    }
  }, [chartView, stats.peakMonth.month, stats.totalCalls])

  const chartMax = Math.max(...chartConfig.data.map((item) => item.calls))

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Call Metrics</h1>
            <p className="text-sm text-muted-foreground">
              Track booking performance and call patterns from your voice agent
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

        <section className="mb-8">
          <h2 className="text-sm font-medium text-foreground uppercase tracking-wide mb-6">
            Conversion Rate
          </h2>

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
              label="Missed Opportunities"
              value={stats.missed.toLocaleString()}
              trend="9% vs prior period"
              direction="down"
            />
          </div>

          <Button
            variant={showComparison ? "default" : "outline"}
            onClick={() => setShowComparison(!showComparison)}
            className={showComparison ? "bg-[#6b7a4a] hover:bg-[#5a6940]" : "border-border"}
          >
            <Plus className="w-4 h-4 mr-2" />
            Compare with another period
          </Button>
        </section>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
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
                <Select value={chartView} onValueChange={(value) => setChartView(value as ChartView)}>
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
                    {timespanOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="relative h-72 pl-12 pb-16">
              <div className="absolute inset-x-12 top-0 h-px bg-border" />
              <div className="absolute inset-x-12 top-[25%] h-px bg-border" />
              <div className="absolute inset-x-12 top-[50%] h-px bg-border" />
              <div className="absolute inset-x-12 top-[75%] h-px bg-border" />
              <div className="absolute inset-x-12 bottom-16 h-px bg-[#cfc8ba]" />

              <div className="absolute left-0 top-[-7px] text-[11px] text-muted-foreground">
                {chartConfig.yLabels[0]}
              </div>
              <div className="absolute left-0 top-[calc(25%-7px)] text-[11px] text-muted-foreground">
                {chartConfig.yLabels[1]}
              </div>
              <div className="absolute left-0 top-[calc(50%-7px)] text-[11px] text-muted-foreground">
                {chartConfig.yLabels[2]}
              </div>
              <div className="absolute left-1 top-[calc(75%-7px)] text-[11px] text-muted-foreground">
                {chartConfig.yLabels[3]}
              </div>
              <div className="absolute left-5 bottom-14 text-[11px] text-muted-foreground">
                {chartConfig.yLabels[4]}
              </div>
              <div className="absolute left-2 top-[-22px] text-[10px] font-medium uppercase text-muted-foreground">
                Calls
              </div>

              <div
                className="absolute left-12 right-0 top-0 bottom-16 grid"
                style={{ gridTemplateColumns: `repeat(${chartConfig.data.length}, minmax(0, 1fr))` }}
              >
                {chartConfig.data.map((item, index) => (
                  <div
                    key={item.label}
                    className={chartConfig.fillColumns || index % 2 === 0 ? "bg-[#f0eee7]" : "bg-transparent"}
                  />
                ))}
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
