"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"
import { TrendingUp, TrendingDown } from "lucide-react"

// Monthly call volume for seasonality
const monthlyCallVolume = [
  { month: "Jan", calls: 892, booked: 356 },
  { month: "Feb", calls: 756, booked: 302 },
  { month: "Mar", calls: 1024, booked: 420 },
  { month: "Apr", calls: 1284, booked: 527 },
  { month: "May", calls: 1456, booked: 612 },
  { month: "Jun", calls: 1823, booked: 765 },
  { month: "Jul", calls: 2105, booked: 884 },
  { month: "Aug", calls: 2034, booked: 854 },
  { month: "Sep", calls: 1567, booked: 658 },
  { month: "Oct", calls: 1234, booked: 506 },
  { month: "Nov", calls: 978, booked: 401 },
  { month: "Dec", calls: 1456, booked: 597 },
]

// Weekly distribution
const weeklyDistribution = [
  { day: "Mon", calls: 145, percentage: 12 },
  { day: "Tue", calls: 168, percentage: 14 },
  { day: "Wed", calls: 178, percentage: 15 },
  { day: "Thu", calls: 182, percentage: 15 },
  { day: "Fri", calls: 195, percentage: 16 },
  { day: "Sat", calls: 178, percentage: 15 },
  { day: "Sun", calls: 154, percentage: 13 },
]

// Hourly distribution
const hourlyDistribution = [
  { hour: "8AM", calls: 45 },
  { hour: "9AM", calls: 78 },
  { hour: "10AM", calls: 112 },
  { hour: "11AM", calls: 134 },
  { hour: "12PM", calls: 98 },
  { hour: "1PM", calls: 87 },
  { hour: "2PM", calls: 102 },
  { hour: "3PM", calls: 118 },
  { hour: "4PM", calls: 95 },
  { hour: "5PM", calls: 67 },
  { hour: "6PM", calls: 45 },
  { hour: "7PM", calls: 23 },
]

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

export default function CallVolumeReportingPage() {
  const [timespan, setTimespan] = useState("30")
  const [callVolumeType, setCallVolumeType] = useState<"total" | "lead">("total")

  const totalCalls = monthlyCallVolume.reduce((acc, m) => acc + m.calls, 0)
  const totalBooked = monthlyCallVolume.reduce((acc, m) => acc + m.booked, 0)
  const maxMonthlyVolume = Math.max(...monthlyCallVolume.map(m => m.calls))
  const maxWeeklyVolume = Math.max(...weeklyDistribution.map(d => d.calls))
  const maxHourlyVolume = Math.max(...hourlyDistribution.map(h => h.calls))

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Call Volume</h2>
            <p className="text-sm text-muted-foreground">Analyze call patterns and seasonality</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
              <button
                onClick={() => setCallVolumeType("total")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  callVolumeType === "total" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Total Calls
              </button>
              <button
                onClick={() => setCallVolumeType("lead")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  callVolumeType === "lead" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Lead Calls
              </button>
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
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {callVolumeType === "total" ? "Total Calls" : "Lead Calls"}
              </p>
              <p className="text-2xl font-semibold text-card-foreground">
                {callVolumeType === "total" ? totalCalls.toLocaleString() : Math.round(totalCalls * 0.72).toLocaleString()}
              </p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <TrendingUp className="w-3 h-3" /> 12% vs prior period
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Average Daily
              </p>
              <p className="text-2xl font-semibold text-card-foreground">
                {callVolumeType === "total" ? Math.round(totalCalls / 365) : Math.round((totalCalls * 0.72) / 365)}
              </p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <TrendingUp className="w-3 h-3" /> 8% vs prior period
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Peak Month
              </p>
              <p className="text-2xl font-semibold text-card-foreground">July</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {callVolumeType === "total" ? "2,105" : Math.round(2105 * 0.72).toLocaleString()} {callVolumeType === "total" ? "calls" : "leads"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Peak Hour
              </p>
              <p className="text-2xl font-semibold text-card-foreground">11 AM</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {callVolumeType === "total" ? "134" : Math.round(134 * 0.72)} avg {callVolumeType === "total" ? "calls" : "leads"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Seasonality Chart */}
        <Card className="border-border mb-6">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
              Monthly Call Volume
            </h3>
            <p className="text-xs text-muted-foreground mb-6">
              Seasonality pattern throughout the year
            </p>
            
            <div className="flex items-end gap-2 h-56 mb-4">
              {monthlyCallVolume.map((month) => (
                <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center justify-end h-48">
                    <div 
                      className="w-full max-w-10 bg-[#6b7a4a]/20 rounded-t relative group cursor-pointer transition-all hover:bg-[#6b7a4a]/30"
                      style={{ height: `${(month.calls / maxMonthlyVolume) * 100}%` }}
                    >
                      <div 
                        className="absolute bottom-0 w-full bg-[#6b7a4a] rounded-t transition-all"
                        style={{ height: `${(month.booked / month.calls) * 100}%` }}
                      />
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {callVolumeType === "total" ? month.calls : Math.round(month.calls * 0.72)} {callVolumeType === "total" ? "calls" : "leads"} · {month.booked} booked
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{month.month}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-6 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#6b7a4a]/20" />
                <span className="text-xs text-muted-foreground">{callVolumeType === "total" ? "Total Calls" : "Lead Calls"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#6b7a4a]" />
                <span className="text-xs text-muted-foreground">Booked</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Weekly Distribution */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
                Day of Week Distribution
              </h3>
              <p className="text-xs text-muted-foreground mb-6">
                Call volume by day of week
              </p>
              
              <div className="flex items-end gap-3 h-40 mb-4">
                {weeklyDistribution.map((day) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-32">
                      <div 
                        className="w-full max-w-8 bg-[#6b7a4a] rounded-t relative group cursor-pointer transition-all hover:bg-[#6b7a4a]/80"
                        style={{ height: `${(day.calls / maxWeeklyVolume) * 100}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {callVolumeType === "total" ? day.calls : Math.round(day.calls * 0.72)} {callVolumeType === "total" ? "calls" : "leads"} ({day.percentage}%)
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{day.day}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Hourly Distribution */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
                Hourly Distribution
              </h3>
              <p className="text-xs text-muted-foreground mb-6">
                Call volume by hour of day
              </p>
              
              <div className="flex items-end gap-1 h-40 mb-4">
                {hourlyDistribution.map((hour) => (
                  <div key={hour.hour} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-32">
                      <div 
                        className="w-full max-w-6 bg-[#c4a84b] rounded-t relative group cursor-pointer transition-all hover:bg-[#c4a84b]/80"
                        style={{ height: `${(hour.calls / maxHourlyVolume) * 100}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {callVolumeType === "total" ? hour.calls : Math.round(hour.calls * 0.72)} {callVolumeType === "total" ? "calls" : "leads"}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{hour.hour}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
