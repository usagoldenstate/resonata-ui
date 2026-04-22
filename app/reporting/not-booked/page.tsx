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
import { ChevronLeft, TrendingUp, TrendingDown } from "lucide-react"

// Detailed reasons for not booking with subcategories
const notBookedReasonsDetailed = {
  Price: {
    count: 156,
    percentage: 34,
    color: "bg-[#6b7a4a]",
    subcategories: [
      { name: "Room rate too high", count: 72, percentage: 46 },
      { name: "Competitor offered lower rate", count: 41, percentage: 26 },
      { name: "Resort fees", count: 23, percentage: 15 },
      { name: "Parking fees", count: 12, percentage: 8 },
      { name: "No discount available", count: 8, percentage: 5 },
    ],
    seasonality: [
      { month: "Jan", count: 8 }, { month: "Feb", count: 6 }, { month: "Mar", count: 12 },
      { month: "Apr", count: 14 }, { month: "May", count: 18 }, { month: "Jun", count: 22 },
      { month: "Jul", count: 24 }, { month: "Aug", count: 21 }, { month: "Sep", count: 13 },
      { month: "Oct", count: 9 }, { month: "Nov", count: 5 }, { month: "Dec", count: 4 },
    ],
    calls: [
      { id: 101, guest: "Patricia W.", callDate: "Apr 5, 2026", bookingDate: "Apr 11-12", subcategory: "Room rate too high" },
      { id: 102, guest: "Mark T.", callDate: "Apr 4, 2026", bookingDate: "May 15-18", subcategory: "Competitor offered lower rate" },
      { id: 103, guest: "Susan K.", callDate: "Apr 3, 2026", bookingDate: "Apr 20-22", subcategory: "Resort fees" },
      { id: 104, guest: "John D.", callDate: "Apr 2, 2026", bookingDate: "Jun 1-4", subcategory: "Room rate too high" },
      { id: 105, guest: "Lisa M.", callDate: "Apr 1, 2026", bookingDate: "Apr 18-19", subcategory: "No discount available" },
    ]
  },
  Availability: {
    count: 112,
    percentage: 24,
    color: "bg-[#c4a84b]",
    subcategories: [
      { name: "Fully booked for dates", count: 58, percentage: 52 },
      { name: "Room type unavailable", count: 31, percentage: 28 },
      { name: "Minimum stay requirement", count: 15, percentage: 13 },
      { name: "Group block conflict", count: 8, percentage: 7 },
    ],
    seasonality: [
      { month: "Jan", count: 4 }, { month: "Feb", count: 3 }, { month: "Mar", count: 6 },
      { month: "Apr", count: 8 }, { month: "May", count: 14 }, { month: "Jun", count: 18 },
      { month: "Jul", count: 21 }, { month: "Aug", count: 19 }, { month: "Sep", count: 10 },
      { month: "Oct", count: 5 }, { month: "Nov", count: 2 }, { month: "Dec", count: 2 },
    ],
    calls: [
      { id: 201, guest: "Steven R.", callDate: "Apr 5, 2026", bookingDate: "May 22-25", subcategory: "Fully booked for dates" },
      { id: 202, guest: "Amy L.", callDate: "Apr 4, 2026", bookingDate: "Jul 4-7", subcategory: "Fully booked for dates" },
      { id: 203, guest: "Robert J.", callDate: "Apr 3, 2026", bookingDate: "Jun 12-14", subcategory: "Room type unavailable" },
      { id: 204, guest: "Nancy P.", callDate: "Apr 2, 2026", bookingDate: "May 1-2", subcategory: "Minimum stay requirement" },
      { id: 205, guest: "Kevin B.", callDate: "Apr 1, 2026", bookingDate: "Aug 15-18", subcategory: "Fully booked for dates" },
    ]
  },
  Amenities: {
    count: 89,
    percentage: 19,
    color: "bg-[#8b5a3c]",
    subcategories: [
      { name: "No restaurant on-site", count: 28, percentage: 31 },
      { name: "No pool/spa", count: 24, percentage: 27 },
      { name: "No fitness center", count: 15, percentage: 17 },
      { name: "No room service", count: 12, percentage: 13 },
      { name: "No shuttle service", count: 10, percentage: 12 },
    ],
    seasonality: [
      { month: "Jan", count: 5 }, { month: "Feb", count: 4 }, { month: "Mar", count: 7 },
      { month: "Apr", count: 8 }, { month: "May", count: 10 }, { month: "Jun", count: 12 },
      { month: "Jul", count: 14 }, { month: "Aug", count: 11 }, { month: "Sep", count: 8 },
      { month: "Oct", count: 5 }, { month: "Nov", count: 3 }, { month: "Dec", count: 2 },
    ],
    calls: [
      { id: 301, guest: "Michelle R.", callDate: "Apr 5, 2026", bookingDate: "Apr 25-27", subcategory: "No restaurant on-site" },
      { id: 302, guest: "Brian K.", callDate: "Apr 4, 2026", bookingDate: "May 8-10", subcategory: "No pool/spa" },
      { id: 303, guest: "Jennifer S.", callDate: "Apr 3, 2026", bookingDate: "Jun 5-7", subcategory: "No fitness center" },
      { id: 304, guest: "Thomas W.", callDate: "Apr 2, 2026", bookingDate: "Apr 19-21", subcategory: "No restaurant on-site" },
      { id: 305, guest: "Angela M.", callDate: "Apr 1, 2026", bookingDate: "May 20-23", subcategory: "No shuttle service" },
    ]
  },
  Policy: {
    count: 37,
    percentage: 8,
    color: "bg-[#64748b]",
    subcategories: [
      { name: "Cancellation policy", count: 15, percentage: 41 },
      { name: "Pet policy", count: 12, percentage: 32 },
      { name: "Check-in/out times", count: 6, percentage: 16 },
      { name: "Age restrictions", count: 4, percentage: 11 },
    ],
    seasonality: [
      { month: "Jan", count: 2 }, { month: "Feb", count: 2 }, { month: "Mar", count: 3 },
      { month: "Apr", count: 4 }, { month: "May", count: 4 }, { month: "Jun", count: 5 },
      { month: "Jul", count: 5 }, { month: "Aug", count: 4 }, { month: "Sep", count: 3 },
      { month: "Oct", count: 2 }, { month: "Nov", count: 2 }, { month: "Dec", count: 1 },
    ],
    calls: [
      { id: 401, guest: "Daniel M.", callDate: "Apr 4, 2026", bookingDate: "Apr 18-20", subcategory: "Pet policy" },
      { id: 402, guest: "Carol H.", callDate: "Apr 3, 2026", bookingDate: "May 5-8", subcategory: "Cancellation policy" },
      { id: 403, guest: "Gary N.", callDate: "Apr 2, 2026", bookingDate: "Jun 10-12", subcategory: "Check-in/out times" },
      { id: 404, guest: "Diana F.", callDate: "Apr 1, 2026", bookingDate: "Apr 22-24", subcategory: "Pet policy" },
      { id: 405, guest: "Paul V.", callDate: "Mar 31, 2026", bookingDate: "May 15-17", subcategory: "Cancellation policy" },
    ]
  },
  Other: {
    count: 67,
    percentage: 15,
    color: "bg-[#9ca3af]",
    subcategories: [
      { name: "Just browsing/comparing", count: 25, percentage: 37 },
      { name: "Location not ideal", count: 18, percentage: 27 },
      { name: "Changed travel plans", count: 14, percentage: 21 },
      { name: "Unspecified", count: 10, percentage: 15 },
    ],
    seasonality: [
      { month: "Jan", count: 4 }, { month: "Feb", count: 3 }, { month: "Mar", count: 5 },
      { month: "Apr", count: 6 }, { month: "May", count: 7 }, { month: "Jun", count: 9 },
      { month: "Jul", count: 10 }, { month: "Aug", count: 8 }, { month: "Sep", count: 6 },
      { month: "Oct", count: 4 }, { month: "Nov", count: 3 }, { month: "Dec", count: 2 },
    ],
    calls: [
      { id: 501, guest: "Karen L.", callDate: "Apr 4, 2026", bookingDate: "Jun 5-8", subcategory: "Just browsing/comparing" },
      { id: 502, guest: "Richard G.", callDate: "Apr 3, 2026", bookingDate: "May 10-12", subcategory: "Location not ideal" },
      { id: 503, guest: "Sandra T.", callDate: "Apr 2, 2026", bookingDate: "Apr 28-30", subcategory: "Changed travel plans" },
      { id: 504, guest: "William C.", callDate: "Apr 1, 2026", bookingDate: "May 22-25", subcategory: "Just browsing/comparing" },
      { id: 505, guest: "Barbara E.", callDate: "Mar 31, 2026", bookingDate: "Jun 1-3", subcategory: "Unspecified" },
    ]
  }
}

const notBookedReasons = Object.entries(notBookedReasonsDetailed).map(([reason, data]) => ({
  reason,
  count: data.count,
  percentage: data.percentage,
  color: data.color,
}))

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

export default function NotBookedReportingPage() {
  const [timespan, setTimespan] = useState("30")
  const [selectedReason, setSelectedReason] = useState<string | null>(null)

  const totalNotBooked = notBookedReasons.reduce((acc, r) => acc + r.count, 0)
  const selectedReasonData = selectedReason ? notBookedReasonsDetailed[selectedReason as keyof typeof notBookedReasonsDetailed] : null
  const maxSeasonalityCount = selectedReasonData ? Math.max(...selectedReasonData.seasonality.map(s => s.count)) : 0

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {selectedReason ? (
              <Button
                variant="ghost"
                onClick={() => setSelectedReason(null)}
                className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to Overview
              </Button>
            ) : null}
            <h2 className="text-2xl font-semibold text-foreground">
              {selectedReason ? `Not Booked: ${selectedReason}` : "Not Booked Reasons"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedReason ? `Detailed breakdown of ${selectedReason.toLowerCase()}-related issues` : "Analyze why guests didn't complete bookings"}
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

        {!selectedReason ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Total Not Booked
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">{totalNotBooked}</p>
                  <p className="text-xs mt-1 flex items-center gap-1 text-[#8b5a3c]">
                    <TrendingDown className="w-3 h-3" /> 5% vs prior period
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Top Reason
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">Price</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    34% of not booked
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Addressable
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">62%</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Could potentially convert
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Lost Revenue
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">$68.4k</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Estimated opportunity
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Reasons Breakdown */}
            <Card className="border-border">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-6">
                  Reasons Breakdown
                </h3>
                
                <div className="space-y-4">
                  {notBookedReasons.map((reason) => (
                    <button
                      key={reason.reason}
                      onClick={() => setSelectedReason(reason.reason)}
                      className="w-full text-left hover:bg-muted/50 rounded-lg p-3 -m-3 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-card-foreground">{reason.reason}</span>
                        <span className="text-sm text-muted-foreground">{reason.count} ({reason.percentage}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${reason.color} rounded-full transition-all`}
                          style={{ width: `${reason.percentage}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>

                {/* Summary Bar */}
                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Distribution</p>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    {notBookedReasons.map((reason) => (
                      <div
                        key={reason.reason}
                        className={`${reason.color} transition-all hover:opacity-80 cursor-pointer`}
                        style={{ width: `${reason.percentage}%` }}
                        title={`${reason.reason}: ${reason.percentage}%`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3">
                    {notBookedReasons.map((reason) => (
                      <div key={reason.reason} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${reason.color}`} />
                        <span className="text-xs text-muted-foreground">{reason.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Selected Reason Detail View */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Total Cases
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">{selectedReasonData?.count}</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {selectedReasonData?.percentage}% of all not booked
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Subcategories
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">{selectedReasonData?.subcategories.length}</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Distinct issues
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Peak Month
                  </p>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {selectedReasonData?.seasonality.reduce((max, s) => s.count > max.count ? s : max, selectedReasonData.seasonality[0]).month}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Highest occurrence
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Top Issue
                  </p>
                  <p className="text-lg font-semibold text-card-foreground truncate">
                    {selectedReasonData?.subcategories[0].name}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {selectedReasonData?.subcategories[0].percentage}% of category
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Subcategories */}
              <Card className="border-border">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                    Subcategories
                  </h3>
                  <div className="space-y-3">
                    {selectedReasonData?.subcategories.map((sub) => (
                      <div key={sub.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-card-foreground">{sub.name}</span>
                          <span className="text-xs text-muted-foreground">{sub.count} ({sub.percentage}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${selectedReasonData.color} rounded-full`}
                            style={{ width: `${sub.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Seasonality */}
              <Card className="border-border">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                    Monthly Trend
                  </h3>
                  <div className="flex items-end gap-2 h-32">
                    {selectedReasonData?.seasonality.map((month) => (
                      <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col items-center justify-end h-24">
                          <div 
                            className={`w-full max-w-6 ${selectedReasonData.color} rounded-t relative group cursor-pointer transition-all hover:opacity-80`}
                            style={{ height: `${(month.count / maxSeasonalityCount) * 100}%` }}
                          >
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card-foreground text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                              {month.count}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{month.month}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Calls */}
            <Card className="border-border">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-card-foreground uppercase tracking-wide mb-4">
                  Recent Calls
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Guest</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Call Date</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Requested Dates</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReasonData?.calls.map((call) => (
                        <tr key={call.id} className="border-b border-border last:border-0">
                          <td className="p-3 text-sm text-card-foreground">{call.guest}</td>
                          <td className="p-3 text-sm text-muted-foreground">{call.callDate}</td>
                          <td className="p-3 text-sm text-muted-foreground">{call.bookingDate}</td>
                          <td className="p-3">
                            <span className="text-xs bg-muted px-2 py-1 rounded">{call.subcategory}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
