"use client"

import { useState, useMemo } from "react"
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
import { CalendarIcon, TrendingUp, TrendingDown, GitCompareArrows } from "lucide-react"
import { format, subDays } from "date-fns"

// Seeded random number generator for consistent server/client data
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Generate daily conversion data for the past 90 days
const generateDailyData = () => {
  const data = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 89; i >= 0; i--) {
    const date = subDays(today, i)
    const dayOfWeek = date.getDay()
    const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
    const baseVolume = dayOfWeek === 0 || dayOfWeek === 6 ? 55 : 38
    const variance = Math.floor(seededRandom(seed) * 20) - 10
    const calls = baseVolume + variance
    const conversionBase = 38 + Math.floor(seededRandom(seed + 1) * 12)
    const booked = Math.floor(calls * (conversionBase / 100))
    data.push({
      date: date,
      dateStr: format(date, "MMM d"),
      dayName: format(date, "EEE"),
      calls,
      booked,
      rate: Math.round((booked / calls) * 100 * 10) / 10
    })
  }
  return data
}

const allDailyData = generateDailyData()

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 2 weeks" },
  { value: "30", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
]

interface DateRange {
  from: Date
  to: Date
}

function getConversionStats(dateRange: DateRange) {
  const filteredData = allDailyData.filter(d => d.date >= dateRange.from && d.date <= dateRange.to)
  const totalCalls = filteredData.reduce((acc, d) => acc + d.calls, 0)
  const totalBooked = filteredData.reduce((acc, d) => acc + d.booked, 0)
  const avgRate = totalCalls > 0 ? Math.round((totalBooked / totalCalls) * 100 * 10) / 10 : 0
  return { totalCalls, totalBooked, avgRate, data: filteredData }
}

export default function ConversionRateReportingPage() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [primaryTimespan, setPrimaryTimespan] = useState("30")
  const [primaryDateRange, setPrimaryDateRange] = useState<DateRange>({
    from: subDays(today, 30),
    to: today
  })
  const [primaryCalendarOpen, setPrimaryCalendarOpen] = useState(false)
  const [primaryTempRange, setPrimaryTempRange] = useState<{ from?: Date; to?: Date }>({
    from: primaryDateRange.from,
    to: primaryDateRange.to
  })

  const [showComparison, setShowComparison] = useState(false)
  const [comparisonTimespan, setComparisonTimespan] = useState("30")
  const [comparisonDateRange, setComparisonDateRange] = useState<DateRange>({
    from: subDays(today, 60),
    to: subDays(today, 31)
  })
  const [comparisonCalendarOpen, setComparisonCalendarOpen] = useState(false)
  const [comparisonTempRange, setComparisonTempRange] = useState<{ from?: Date; to?: Date }>({
    from: comparisonDateRange.from,
    to: comparisonDateRange.to
  })

  const handlePrimaryTimespanChange = (value: string) => {
    setPrimaryTimespan(value)
    if (value !== "custom") {
      const days = parseInt(value)
      setPrimaryDateRange({
        from: subDays(today, days),
        to: today
      })
    }
  }

  const handleComparisonTimespanChange = (value: string) => {
    setComparisonTimespan(value)
    if (value !== "custom") {
      const days = parseInt(value)
      const primaryDays = parseInt(primaryTimespan) || 30
      setComparisonDateRange({
        from: subDays(today, primaryDays + days),
        to: subDays(today, primaryDays + 1)
      })
    }
  }

  const primaryStats = useMemo(() => getConversionStats(primaryDateRange), [primaryDateRange])
  const comparisonStats = useMemo(() => getConversionStats(comparisonDateRange), [comparisonDateRange])

  const rateDiff = showComparison ? (primaryStats.avgRate - comparisonStats.avgRate).toFixed(1) : null

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Conversion Rate</h2>
            <p className="text-sm text-muted-foreground">Analyze booking conversion trends</p>
          </div>
          <Button
            variant={showComparison ? "default" : "outline"}
            onClick={() => setShowComparison(!showComparison)}
            className={showComparison ? "bg-[#6b7a4a] hover:bg-[#5a6940]" : "border-border"}
          >
            <GitCompareArrows className="w-4 h-4 mr-2" />
            Compare Periods
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Conversion Rate
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{primaryStats.avgRate}%</p>
              {showComparison && rateDiff && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${parseFloat(rateDiff) >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
                  {parseFloat(rateDiff) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(parseFloat(rateDiff))}% vs comparison
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Total Calls
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{primaryStats.totalCalls.toLocaleString()}</p>
              <p className="text-xs mt-1 text-muted-foreground">
                In selected period
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Total Booked
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{primaryStats.totalBooked.toLocaleString()}</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Successful conversions
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Missed Opportunities
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{(primaryStats.totalCalls - primaryStats.totalBooked).toLocaleString()}</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Calls not converted
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Primary Period */}
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide">
                  Primary Period
                </h3>
                <div className="flex items-center gap-2">
                  <Select value={primaryTimespan} onValueChange={handlePrimaryTimespanChange}>
                    <SelectTrigger className="h-8 w-auto text-xs border-border">
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
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                          <CalendarIcon className="w-3 h-3" />
                          {format(primaryDateRange.from, "MMM d")} - {format(primaryDateRange.to, "MMM d")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={primaryTempRange}
                          onSelect={(range) => {
                            setPrimaryTempRange(range || {})
                            if (range?.from && range?.to) {
                              setPrimaryDateRange({ from: range.from, to: range.to })
                              setPrimaryCalendarOpen(false)
                            }
                          }}
                          numberOfMonths={2}
                          disabled={(date) => date > new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              {/* Conversion Circle */}
              <div className="text-center py-4">
                <div className="relative w-32 h-32 mx-auto mb-3">
                  <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-muted"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${primaryStats.avgRate * 2.51} 251`}
                      className="text-[#6b7a4a]"
                      stroke="currentColor"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-semibold text-card-foreground">{primaryStats.avgRate}%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {primaryStats.totalBooked} of {primaryStats.totalCalls} calls converted
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Period */}
          {showComparison && (
            <Card className="border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide">
                    Comparison Period
                  </h3>
                  <div className="flex items-center gap-2">
                    <Select value={comparisonTimespan} onValueChange={handleComparisonTimespanChange}>
                      <SelectTrigger className="h-8 w-auto text-xs border-border">
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
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                            <CalendarIcon className="w-3 h-3" />
                            {format(comparisonDateRange.from, "MMM d")} - {format(comparisonDateRange.to, "MMM d")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            selected={comparisonTempRange}
                            onSelect={(range) => {
                              setComparisonTempRange(range || {})
                              if (range?.from && range?.to) {
                                setComparisonDateRange({ from: range.from, to: range.to })
                                setComparisonCalendarOpen(false)
                              }
                            }}
                            numberOfMonths={2}
                            disabled={(date) => date > new Date()}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>

                {/* Comparison Circle */}
                <div className="text-center py-4">
                  <div className="relative w-32 h-32 mx-auto mb-3">
                    <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        className="text-muted"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${comparisonStats.avgRate * 2.51} 251`}
                        className="text-[#c4a84b]"
                        stroke="currentColor"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-semibold text-card-foreground">{comparisonStats.avgRate}%</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {comparisonStats.totalBooked} of {comparisonStats.totalCalls} calls converted
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!showComparison && (
            <Card className="border-border border-dashed">
              <CardContent className="p-6 flex items-center justify-center h-full">
                <div className="text-center">
                  <GitCompareArrows className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Enable comparison to analyze trends</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowComparison(true)}
                    className="mt-3 border-border"
                  >
                    Compare Periods
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Daily Trend Chart */}
        <Card className="border-border">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
              Daily Conversion Trend
            </h3>
            <p className="text-xs text-muted-foreground mb-6">
              Conversion rate over the past 30 days
            </p>
            
            <div className="flex items-end gap-1 h-40">
              {primaryStats.data.slice(-30).map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center justify-end h-32">
                    <div 
                      className="w-full max-w-4 bg-[#6b7a4a] rounded-t relative group cursor-pointer transition-all hover:bg-[#6b7a4a]/80"
                      style={{ height: `${(day.rate / 60) * 100}%` }}
                    >
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {day.dateStr}: {day.rate}%
                      </div>
                    </div>
                  </div>
                  {i % 5 === 0 && (
                    <span className="text-[9px] text-muted-foreground">{day.dateStr}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
