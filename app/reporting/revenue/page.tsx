"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"

// Monthly revenue data
const monthlyRevenue = [
  { month: "Jan", roomRevenue: 42500, upsellRevenue: 6200, totalCalls: 892 },
  { month: "Feb", roomRevenue: 36100, upsellRevenue: 5100, totalCalls: 756 },
  { month: "Mar", roomRevenue: 50200, upsellRevenue: 7400, totalCalls: 1024 },
  { month: "Apr", roomRevenue: 63000, upsellRevenue: 9200, totalCalls: 1284 },
  { month: "May", roomRevenue: 73200, upsellRevenue: 10800, totalCalls: 1456 },
  { month: "Jun", roomRevenue: 91500, upsellRevenue: 13500, totalCalls: 1823 },
  { month: "Jul", roomRevenue: 105600, upsellRevenue: 15600, totalCalls: 2105 },
  { month: "Aug", roomRevenue: 102000, upsellRevenue: 15100, totalCalls: 2034 },
  { month: "Sep", roomRevenue: 78700, upsellRevenue: 11600, totalCalls: 1567 },
  { month: "Oct", roomRevenue: 60500, upsellRevenue: 8900, totalCalls: 1234 },
  { month: "Nov", roomRevenue: 48000, upsellRevenue: 7100, totalCalls: 978 },
  { month: "Dec", roomRevenue: 71400, upsellRevenue: 10500, totalCalls: 1456 },
]

// Upsell categories
const upsellCategories = [
  { name: "Spa Services", revenue: 38400, percentage: 31, count: 245 },
  { name: "Room Upgrades", revenue: 32100, percentage: 26, count: 189 },
  { name: "Dining Packages", revenue: 24800, percentage: 20, count: 312 },
  { name: "Late Checkout", revenue: 15200, percentage: 12, count: 456 },
  { name: "Airport Transfers", revenue: 13500, percentage: 11, count: 178 },
]

// Revenue by room type
const revenueByRoomType = [
  { type: "Standard", revenue: 245000, bookings: 1456, avgRate: 168 },
  { type: "Deluxe", revenue: 312000, bookings: 1034, avgRate: 302 },
  { type: "Suite", revenue: 198000, bookings: 412, avgRate: 481 },
  { type: "Penthouse", revenue: 68000, bookings: 85, avgRate: 800 },
]

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

export default function RevenueReportingPage() {
  const [timespan, setTimespan] = useState("year")

  const totalRoomRevenue = monthlyRevenue.reduce((acc, m) => acc + m.roomRevenue, 0)
  const totalUpsellRevenue = monthlyRevenue.reduce((acc, m) => acc + m.upsellRevenue, 0)
  const totalRevenue = totalRoomRevenue + totalUpsellRevenue
  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map(m => m.roomRevenue + m.upsellRevenue))
  const totalBookings = revenueByRoomType.reduce((acc, r) => acc + r.bookings, 0)
  const avgDailyRate = Math.round(totalRoomRevenue / totalBookings)
  const maxUpsellRevenue = Math.max(...upsellCategories.map(c => c.revenue))

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Revenue Reporting</h2>
            <p className="text-sm text-muted-foreground">Track room and upsell revenue performance</p>
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

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Total Revenue
              </p>
              <p className="text-2xl font-semibold text-card-foreground">${(totalRevenue / 1000).toFixed(1)}k</p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <TrendingUp className="w-3 h-3" /> 15% vs prior year
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Room Revenue
              </p>
              <p className="text-2xl font-semibold text-card-foreground">${(totalRoomRevenue / 1000).toFixed(1)}k</p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <TrendingUp className="w-3 h-3" /> 12% vs prior year
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Upsell Revenue
              </p>
              <p className="text-2xl font-semibold text-card-foreground">${(totalUpsellRevenue / 1000).toFixed(1)}k</p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <TrendingUp className="w-3 h-3" /> 24% vs prior year
              </p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Avg Daily Rate (ADR)
              </p>
              <p className="text-2xl font-semibold text-card-foreground">${avgDailyRate}</p>
              <p className="text-xs mt-1 flex items-center gap-1 text-[#6b7a4a]">
                <TrendingUp className="w-3 h-3" /> 8% vs prior year
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Revenue Chart */}
        <Card className="border-border mb-6">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
              Monthly Revenue
            </h3>
            <p className="text-xs text-muted-foreground mb-6">
              Room revenue vs upsell revenue by month
            </p>
            
            <div className="flex items-end gap-2 h-56 mb-4">
              {monthlyRevenue.map((month) => {
                const total = month.roomRevenue + month.upsellRevenue
                const roomHeight = (month.roomRevenue / maxMonthlyRevenue) * 100
                const upsellHeight = (month.upsellRevenue / maxMonthlyRevenue) * 100
                return (
                  <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-48">
                      <div className="w-full max-w-10 flex flex-col relative group cursor-pointer">
                        <div 
                          className="w-full bg-[#c4a84b] rounded-t transition-all hover:opacity-80"
                          style={{ height: `${upsellHeight * 1.8}px` }}
                        />
                        <div 
                          className="w-full bg-[#6b7a4a] transition-all hover:opacity-80"
                          style={{ height: `${roomHeight * 1.8}px` }}
                        />
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          ${(total / 1000).toFixed(1)}k
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{month.month}</span>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-center gap-6 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#6b7a4a]" />
                <span className="text-xs text-muted-foreground">Room Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#c4a84b]" />
                <span className="text-xs text-muted-foreground">Upsell Revenue</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Upsell Categories */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
                Upsell Categories
              </h3>
              <p className="text-xs text-muted-foreground mb-6">
                Revenue breakdown by upsell type
              </p>
              
              <div className="space-y-4">
                {upsellCategories.map((category) => (
                  <div key={category.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-card-foreground">{category.name}</span>
                      <span className="text-sm font-medium text-card-foreground">${(category.revenue / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#c4a84b] rounded-full"
                          style={{ width: `${(category.revenue / maxUpsellRevenue) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">{category.percentage}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{category.count} transactions</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Revenue by Room Type */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-1">
                Revenue by Room Type
              </h3>
              <p className="text-xs text-muted-foreground mb-6">
                Performance by accommodation category
              </p>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Room Type</th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground">Bookings</th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground">Avg Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByRoomType.map((room) => (
                      <tr key={room.type} className="border-b border-border last:border-0">
                        <td className="p-3 text-sm text-card-foreground">{room.type}</td>
                        <td className="p-3 text-sm text-card-foreground text-right font-medium">${(room.revenue / 1000).toFixed(0)}k</td>
                        <td className="p-3 text-sm text-muted-foreground text-right">{room.bookings.toLocaleString()}</td>
                        <td className="p-3 text-sm text-muted-foreground text-right">${room.avgRate}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50">
                      <td className="p-3 text-sm font-medium text-card-foreground">Total</td>
                      <td className="p-3 text-sm font-medium text-card-foreground text-right">
                        ${(revenueByRoomType.reduce((acc, r) => acc + r.revenue, 0) / 1000).toFixed(0)}k
                      </td>
                      <td className="p-3 text-sm text-muted-foreground text-right">
                        {revenueByRoomType.reduce((acc, r) => acc + r.bookings, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground text-right">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
