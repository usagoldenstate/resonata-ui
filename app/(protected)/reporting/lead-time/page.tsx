"use client"

import { useState } from "react"
import { DateRangeFilter, makePresets } from "@/components/date-range-filter"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { rangeForTimespan } from "@/lib/date-range"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts"

// Lead time distribution data
const leadTimeDistribution = [
  { name: "Same day", booked: 35, notBooked: 48 },
  { name: "1-3 days", booked: 62, notBooked: 45 },
  { name: "4-7 days", booked: 98, notBooked: 38 },
  { name: "8-14 days", booked: 124, notBooked: 28 },
  { name: "15-30 days", booked: 108, notBooked: 32 },
  { name: "31-60 days", booked: 72, notBooked: 18 },
  { name: "60+ days", booked: 45, notBooked: 12 },
]

// Monthly lead time trends
const monthlyLeadTime = [
  { month: "Jan", average: 14, median: 10 },
  { month: "Feb", average: 13, median: 9 },
  { month: "Mar", average: 16, median: 11 },
  { month: "Apr", average: 19, median: 14 },
  { month: "May", average: 24, median: 18 },
  { month: "Jun", average: 28, median: 22 },
  { month: "Jul", average: 32, median: 26 },
  { month: "Aug", average: 30, median: 24 },
  { month: "Sep", average: 22, median: 17 },
  { month: "Oct", average: 18, median: 13 },
  { month: "Nov", average: 14, median: 10 },
  { month: "Dec", average: 12, median: 8 },
]

// Stats based on timespan
const statsData: Record<string, { avgLeadTime: number; avgChange: number; medianLeadTime: number; medianChange: number; sameWeek: number; sameWeekCount: number; sameWeekTotal: number; sixtyPlus: number; sixtyPlusCount: number; sixtyPlusTotal: number }> = {
  "7": { avgLeadTime: 16, avgChange: 2, medianLeadTime: 11, medianChange: 1, sameWeek: 28, sameWeekCount: 42, sameWeekTotal: 150, sixtyPlus: 12, sixtyPlusCount: 18, sixtyPlusTotal: 150 },
  "14": { avgLeadTime: 17, avgChange: 2, medianLeadTime: 11, medianChange: 1, sameWeek: 29, sameWeekCount: 87, sameWeekTotal: 300, sixtyPlus: 13, sixtyPlusCount: 39, sixtyPlusTotal: 300 },
  "30": { avgLeadTime: 18, avgChange: 3, medianLeadTime: 12, medianChange: 2, sameWeek: 31, sameWeekCount: 184, sameWeekTotal: 594, sixtyPlus: 14, sixtyPlusCount: 83, sixtyPlusTotal: 594 },
  "90": { avgLeadTime: 20, avgChange: 4, medianLeadTime: 14, medianChange: 3, sameWeek: 27, sameWeekCount: 486, sameWeekTotal: 1800, sixtyPlus: 16, sixtyPlusCount: 288, sixtyPlusTotal: 1800 },
}

const timespanOptions = makePresets(["7", "14", "30", "90"])

export default function LeadTimeReportPage() {
  const [timespan, setTimespan] = useState("30")
  const stats = statsData[timespan] || statsData["30"]

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Booking Lead Time</h1>
            <p className="text-sm text-muted-foreground mt-1">
              How far in advance guests inquire before their stay date
            </p>
            <div className="mt-1">
              {/* No custom range: this page's stats are keyed by preset windows. */}
              <DateRangeFilter
                variant="header"
                presets={timespanOptions}
                timespan={timespan}
                range={rangeForTimespan(timespan)}
                onSelectTimespan={setTimespan}
                allowCustom={false}
              />
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Avg Lead Time
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{stats.avgLeadTime} days</p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <span>+</span> {stats.avgChange} days vs prior year
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Median Lead Time
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{stats.medianLeadTime} days</p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <span>+</span> {stats.medianChange} days vs prior year
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Same-Week Bookings
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{stats.sameWeek}%</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {stats.sameWeekCount} of {stats.sameWeekTotal} inquiries
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                60+ Day Bookings
              </p>
              <p className="text-2xl font-semibold text-card-foreground">{stats.sixtyPlus}%</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {stats.sixtyPlusCount} of {stats.sixtyPlusTotal} inquiries
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lead Time Distribution Chart */}
        <Card className="border-border mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead Time Distribution</CardTitle>
            <CardDescription className="text-xs">Number of inquiries by days before stay date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadTimeDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Bar dataKey="booked" name="Booked" stackId="a" fill="#6b7a4a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="notBooked" name="Not Booked" stackId="a" fill="#a3a682" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Lead Time by Month Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead Time by Month</CardTitle>
            <CardDescription className="text-xs">Average and median lead time across the year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyLeadTime} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(value) => `${value}d`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value: number) => [`${value} days`, '']}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="average" 
                    name="Average" 
                    stroke="#6b7a4a" 
                    strokeWidth={2}
                    dot={{ fill: '#6b7a4a', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="median" 
                    name="Median" 
                    stroke="#a3a682" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#a3a682', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
