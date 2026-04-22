"use client"

import { useState, useMemo } from "react"
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
import { CalendarIcon, TrendingUp, TrendingDown, GitCompareArrows, ChevronRight, DollarSign, Clock } from "lucide-react"
import { format, subDays } from "date-fns"

// Seeded random number generator for consistent server/client data
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Generate daily data for the past 90 days
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
    const avgRevenue = 180 + Math.floor(seededRandom(seed + 2) * 80)
    const upsellRate = 0.12 + seededRandom(seed + 3) * 0.08
    data.push({
      date: date,
      dateStr: format(date, "MMM d"),
      dayName: format(date, "EEE"),
      calls,
      booked,
      rate: Math.round((booked / calls) * 100 * 10) / 10,
      revenue: booked * avgRevenue,
      upsellRevenue: Math.floor(booked * avgRevenue * upsellRate)
    })
  }
  return data
}

const allDailyData = generateDailyData()

// Not booked reasons data
const notBookedReasons = [
  { reason: "Price", count: 156, percentage: 34, color: "bg-[#6b7a4a]" },
  { reason: "Availability", count: 112, percentage: 24, color: "bg-[#c4a84b]" },
  { reason: "Amenities", count: 89, percentage: 19, color: "bg-[#8b5a3c]" },
  { reason: "Policy", count: 37, percentage: 8, color: "bg-[#64748b]" },
  { reason: "Other", count: 67, percentage: 15, color: "bg-[#9ca3af]" },
]

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

function getStats(dateRange: DateRange) {
  const filteredData = allDailyData.filter(d => d.date >= dateRange.from && d.date <= dateRange.to)
  const totalCalls = filteredData.reduce((acc, d) => acc + d.calls, 0)
  const totalBooked = filteredData.reduce((acc, d) => acc + d.booked, 0)
  const avgRate = totalCalls > 0 ? Math.round((totalBooked / totalCalls) * 100 * 10) / 10 : 0
  const totalRevenue = filteredData.reduce((acc, d) => acc + d.revenue, 0)
  const totalUpsell = filteredData.reduce((acc, d) => acc + d.upsellRevenue, 0)
  return { totalCalls, totalBooked, avgRate, totalRevenue, totalUpsell, data: filteredData }
}

export default function Dashboard() {
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
  const [callVolumeType, setCallVolumeType] = useState<"total" | "lead">("total")
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

  const primaryStats = useMemo(() => getStats(primaryDateRange), [primaryDateRange])
  const comparisonStats = useMemo(() => getStats(comparisonDateRange), [comparisonDateRange])

  const callsDiff = showComparison ? ((primaryStats.totalCalls - comparisonStats.totalCalls) / comparisonStats.totalCalls * 100).toFixed(1) : null
  const rateDiff = showComparison ? (primaryStats.avgRate - comparisonStats.avgRate).toFixed(1) : null
  const revenueDiff = showComparison ? ((primaryStats.totalRevenue - comparisonStats.totalRevenue) / comparisonStats.totalRevenue * 100).toFixed(1) : null

  const maxCalls = Math.max(...primaryStats.data.map(d => d.calls), ...(showComparison ? comparisonStats.data.map(d => d.calls) : [0]))

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
              onClick={() => setShowComparison(!showComparison)}
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
                      setPrimaryTempRange(range || {})
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
                        setComparisonTempRange(range || {})
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
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCallVolumeType("total") }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        callVolumeType === "total" 
                          ? "bg-background text-foreground shadow-sm" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Total Calls
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCallVolumeType("lead") }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        callVolumeType === "lead" 
                          ? "bg-background text-foreground shadow-sm" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Lead Calls
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
                    {callVolumeType === "total" 
                      ? primaryStats.totalCalls.toLocaleString() 
                      : Math.round(primaryStats.totalCalls * 0.72).toLocaleString()
                    }
                  </span>
                  <span className="text-sm text-muted-foreground">{callVolumeType === "total" ? "calls" : "leads"}</span>
                  {callsDiff && (
                    <span className={`text-sm flex items-center gap-1 ${parseFloat(callsDiff) >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
                      {parseFloat(callsDiff) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(parseFloat(callsDiff))}%
                    </span>
                  )}
                </div>

                {/* Mini Chart */}
                <div className="flex items-end gap-1 h-16">
                  {primaryStats.data.slice(-14).map((day, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-[#6b7a4a]/20 group-hover:bg-[#6b7a4a]/30 rounded-t transition-colors"
                      style={{ height: `${((callVolumeType === "total" ? day.calls : Math.round(day.calls * 0.72)) / maxCalls) * 100}%` }}
                    />
                  ))}
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
                  <span className="text-3xl font-semibold text-card-foreground">{primaryStats.avgRate}%</span>
                  <span className="text-sm text-muted-foreground">avg rate</span>
                  {rateDiff && (
                    <span className={`text-sm flex items-center gap-1 ${parseFloat(rateDiff) >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
                      {parseFloat(rateDiff) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(parseFloat(rateDiff))}pp
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
                        style={{ width: `${primaryStats.avgRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{primaryStats.totalBooked}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Not Booked</span>
                    <div className="flex-1 bg-muted rounded-full h-3">
                      <div 
                        className="bg-[#8b5a3c] h-3 rounded-full transition-all"
                        style={{ width: `${100 - primaryStats.avgRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{primaryStats.totalCalls - primaryStats.totalBooked}</span>
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
                  <span className="text-3xl font-semibold text-card-foreground">{notBookedReasons.reduce((acc, r) => acc + r.count, 0)}</span>
                  <span className="text-sm text-muted-foreground">total not booked</span>
                </div>

                {/* Reasons breakdown */}
                <div className="space-y-2">
                  {notBookedReasons.map((reason) => (
                    <div key={reason.reason} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${reason.color}`} />
                      <span className="text-xs text-muted-foreground flex-1">{reason.reason}</span>
                      <div className="w-20 bg-muted rounded-full h-2">
                        <div 
                          className={`${reason.color} h-2 rounded-full`}
                          style={{ width: `${reason.percentage}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{reason.percentage}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Revenue Section */}
          <Link href="/reporting/revenue" className="block">
            <Card className="border-border hover:border-[#6b7a4a]/50 hover:shadow-md transition-all cursor-pointer group h-full">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Revenue</h3>
                    <p className="text-xs text-muted-foreground">Room and upsell performance</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#6b7a4a] transition-colors" />
                </div>
                
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-semibold text-card-foreground">${((primaryStats.totalRevenue + primaryStats.totalUpsell) / 1000).toFixed(1)}k</span>
                  <span className="text-sm text-muted-foreground">total revenue</span>
                  {revenueDiff && (
                    <span className={`text-sm flex items-center gap-1 ${parseFloat(revenueDiff) >= 0 ? "text-[#6b7a4a]" : "text-[#8b5a3c]"}`}>
                      {parseFloat(revenueDiff) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(parseFloat(revenueDiff))}%
                    </span>
                  )}
                </div>

                {/* Revenue breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-[#6b7a4a]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-card-foreground">Room Revenue</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className="bg-[#6b7a4a] h-2 rounded-full"
                            style={{ width: `${(primaryStats.totalRevenue / (primaryStats.totalRevenue + primaryStats.totalUpsell)) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">${(primaryStats.totalRevenue / 1000).toFixed(1)}k</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#c4a84b]/10 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-[#c4a84b]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-card-foreground">Upsell Revenue</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className="bg-[#c4a84b] h-2 rounded-full"
                            style={{ width: `${(primaryStats.totalUpsell / (primaryStats.totalRevenue + primaryStats.totalUpsell)) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">${(primaryStats.totalUpsell / 1000).toFixed(1)}k</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Booking Lead Time Section */}
          <Link href="/reporting/lead-time" className="block col-span-2">
            <Card className="border-border hover:border-[#6b7a4a]/50 hover:shadow-md transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">Booking Lead Time</h3>
                    <p className="text-xs text-muted-foreground">How far in advance guests inquire before their stay date</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#6b7a4a] transition-colors" />
                </div>
                
                <div className="grid grid-cols-4 gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[#6b7a4a]" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-card-foreground">18 days</p>
                      <p className="text-xs text-muted-foreground">Avg Lead Time</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[#6b7a4a]" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-card-foreground">12 days</p>
                      <p className="text-xs text-muted-foreground">Median Lead Time</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#c4a84b]/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-[#c4a84b]" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-card-foreground">31%</p>
                      <p className="text-xs text-muted-foreground">Same-Week Bookings</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#8b5a3c]/10 flex items-center justify-center">
                      <CalendarIcon className="w-5 h-5 text-[#8b5a3c]" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-card-foreground">14%</p>
                      <p className="text-xs text-muted-foreground">60+ Day Bookings</p>
                    </div>
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
