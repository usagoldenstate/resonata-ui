"use client"

import { useState, Fragment } from "react"
import { Download, Search, Phone, Clock, ArrowUpDown, ChevronDown, ChevronUp, CalendarIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"

const allCalls = [
  { id: 1, guest: "Sarah M.", phone: "+1 (555) 234-5678", email: "sarah.m@email.com", callDate: "Apr 8, 2026", bookingDate: "Apr 15-17, 2026", time: "2:14 PM", duration: "4m 22s", outcome: "Booked", value: "$420", adr: "$210", notes: "Suite reservation for anniversary", transcript: [
    { speaker: "Agent", text: "Good afternoon, thank you for calling The Grand Monarch Hotel. This is Alex speaking, how may I assist you today?" },
    { speaker: "Guest", text: "Hi Alex, I'd like to book a suite for my anniversary next weekend." },
    { speaker: "Agent", text: "Congratulations! I'd be happy to help you with that. Could you tell me the dates you're looking at?" },
    { speaker: "Guest", text: "We're thinking Friday the 15th through Sunday the 17th." },
    { speaker: "Agent", text: "Perfect. We have our Monarch Suite available for those dates at $210 per night. It includes a king bed, spa tub, and complimentary champagne." },
    { speaker: "Guest", text: "That sounds wonderful. Let's book it." },
    { speaker: "Agent", text: "Excellent! I've reserved the Monarch Suite for Sarah M. for April 15th through 17th. Your total will be $420. Is there anything else I can help with?" },
    { speaker: "Guest", text: "No, that's perfect. Thank you so much!" },
  ]},
  { id: 2, guest: "James P.", phone: "+1 (555) 345-6789", email: "james.p@email.com", callDate: "Apr 8, 2026", bookingDate: "—", time: "1:52 PM", duration: "2m 05s", outcome: "Transferred", value: "—", adr: "—", notes: "Transferred to concierge", transcript: [
    { speaker: "Agent", text: "Thank you for calling The Grand Monarch Hotel, how can I help you?" },
    { speaker: "Guest", text: "Yes, I'm a guest currently staying in room 412. I need help arranging transportation to the airport tomorrow." },
    { speaker: "Agent", text: "Of course, Mr. P. Let me transfer you to our concierge desk who can arrange that for you right away." },
    { speaker: "Guest", text: "Thank you." },
    { speaker: "Agent", text: "Please hold while I connect you." },
  ]},
  { id: 3, guest: "Anonymous", phone: "Unknown", email: "—", callDate: "Apr 8, 2026", bookingDate: "—", time: "1:30 PM", duration: "0m 42s", outcome: "Missed", value: "—", adr: "—", notes: "No voicemail left", transcript: [
    { speaker: "System", text: "Call connected but no response from caller. Call ended after 42 seconds." },
  ]},
  { id: 4, guest: "Lena K.", phone: "+1 (555) 456-7890", email: "lena.k@email.com", callDate: "Apr 8, 2026", bookingDate: "Apr 20-23, 2026", time: "12:47 PM", duration: "6m 11s", outcome: "Booked", value: "$910", adr: "$303", notes: "Penthouse suite, 3 nights", transcript: [
    { speaker: "Agent", text: "Good afternoon, The Grand Monarch Hotel, this is Jordan. How may I assist you?" },
    { speaker: "Guest", text: "Hi Jordan, I'm interested in booking your penthouse suite for a special occasion." },
    { speaker: "Agent", text: "Wonderful! Our penthouse is truly spectacular. What dates were you considering?" },
    { speaker: "Guest", text: "April 20th through the 23rd, three nights total." },
    { speaker: "Agent", text: "Let me check availability... Yes, the penthouse is available. It's $350 per night and includes butler service, private terrace, and access to our executive lounge." },
    { speaker: "Guest", text: "That sounds perfect. What's included in the butler service?" },
    { speaker: "Agent", text: "Your personal butler can arrange in-room dining, unpacking services, reservations, and is available 24/7 during your stay." },
    { speaker: "Guest", text: "I'll take it. Please book it under Lena K." },
    { speaker: "Agent", text: "Excellent choice! I've booked the Penthouse Suite for Lena K., April 20-23. Total comes to $910 after taxes. You'll receive a confirmation email shortly." },
  ]},
  { id: 5, guest: "Tom H.", phone: "+1 (555) 567-8901", email: "tom.h@business.com", callDate: "Apr 8, 2026", bookingDate: "Apr 14-16, 2026", time: "11:20 AM", duration: "3m 38s", outcome: "Booked", value: "$280", adr: "$140", notes: "Standard room, business trip", transcript: [
    { speaker: "Agent", text: "The Grand Monarch Hotel, how can I help you today?" },
    { speaker: "Guest", text: "I need a room for a business trip next week, Tuesday and Wednesday nights." },
    { speaker: "Agent", text: "Of course. We have standard rooms available at $140 per night. They include a work desk, high-speed WiFi, and access to our business center." },
    { speaker: "Guest", text: "Does it have early check-in? I have meetings starting at 9 AM Tuesday." },
    { speaker: "Agent", text: "We can arrange early check-in at 10 AM for an additional $25, or complimentary if you join our rewards program." },
    { speaker: "Guest", text: "I'll sign up for the rewards program then. Please book the standard room." },
    { speaker: "Agent", text: "Perfect, Mr. H. Two nights booked with early check-in. Your total is $280." },
  ]},
  { id: 6, guest: "Maria S.", phone: "+1 (555) 678-9012", email: "maria.s@email.com", callDate: "Apr 7, 2026", bookingDate: "May 1-4, 2026", time: "4:45 PM", duration: "5m 12s", outcome: "Booked", value: "$650", adr: "$217", notes: "Deluxe room with ocean view", transcript: [
    { speaker: "Agent", text: "Thank you for calling The Grand Monarch Hotel. How may I assist you?" },
    { speaker: "Guest", text: "I'd like to book a room with an ocean view for my parents' visit." },
    { speaker: "Agent", text: "How lovely! Our Deluxe Ocean View rooms are perfect for that. When would they be visiting?" },
    { speaker: "Guest", text: "They arrive on May 1st and leave on the 4th." },
    { speaker: "Agent", text: "We have availability. The Deluxe Ocean View is $215 per night with a private balcony overlooking the water." },
    { speaker: "Guest", text: "Can you add breakfast for two?" },
    { speaker: "Agent", text: "Absolutely. Our breakfast package is $35 per day for two guests. So your total for 3 nights with breakfast would be $650." },
    { speaker: "Guest", text: "Perfect, please book it under Maria S." },
  ]},
  { id: 7, guest: "Robert K.", phone: "+1 (555) 789-0123", email: "robert.k@email.com", callDate: "Apr 7, 2026", bookingDate: "—", time: "3:30 PM", duration: "1m 55s", outcome: "Missed", value: "—", adr: "—", notes: "Called back later", transcript: [
    { speaker: "Agent", text: "The Grand Monarch Hotel, how can I help?" },
    { speaker: "Guest", text: "Hi, I had a question about... actually, hold on, I'm getting another call." },
    { speaker: "Agent", text: "No problem, I'll hold." },
    { speaker: "System", text: "Call disconnected by caller after 1 minute 55 seconds." },
  ]},
  { id: 8, guest: "Emily W.", phone: "+1 (555) 890-1234", email: "emily.w@email.com", callDate: "Apr 7, 2026", bookingDate: "—", time: "2:15 PM", duration: "4m 08s", outcome: "Transferred", value: "—", adr: "—", notes: "Transferred to spa services", transcript: [
    { speaker: "Agent", text: "Good afternoon, The Grand Monarch Hotel. How may I direct your call?" },
    { speaker: "Guest", text: "Hi, I'm staying at the hotel next week and wanted to book some spa treatments." },
    { speaker: "Agent", text: "I'd be happy to connect you with our spa directly. They can walk you through all our treatments and packages." },
    { speaker: "Guest", text: "That would be great. Do they have couples massages?" },
    { speaker: "Agent", text: "Yes, our spa offers several couples packages. Let me transfer you to our spa coordinator who can give you all the details." },
    { speaker: "Guest", text: "Thank you!" },
  ]},
  { id: 9, guest: "David L.", phone: "+1 (555) 901-2345", email: "david.l@family.com", callDate: "Apr 7, 2026", bookingDate: "May 12-17, 2026", time: "11:00 AM", duration: "7m 22s", outcome: "Booked", value: "$1,240", adr: "$248", notes: "Family suite, 5 nights", transcript: [
    { speaker: "Agent", text: "The Grand Monarch Hotel, this is Sam speaking. How can I help you today?" },
    { speaker: "Guest", text: "Hi Sam, I'm planning a family vacation and need a room that can accommodate two adults and three children." },
    { speaker: "Agent", text: "We have the perfect option - our Family Suite. It has a master bedroom, a separate kids' room with bunk beds, and a living area." },
    { speaker: "Guest", text: "That sounds ideal. What are the rates and what dates do you have available in May?" },
    { speaker: "Agent", text: "The Family Suite is $248 per night. We have availability May 10-20. How many nights were you thinking?" },
    { speaker: "Guest", text: "Five nights, from the 12th to the 17th." },
    { speaker: "Agent", text: "Perfect. That comes to $1,240 total. The suite also includes complimentary kids' activities and pool access." },
    { speaker: "Guest", text: "Do you have cribs available? Our youngest is still a toddler." },
    { speaker: "Agent", text: "Absolutely, we provide cribs at no additional charge. I'll add that note to your reservation." },
    { speaker: "Guest", text: "Wonderful. Please book it for the L family." },
  ]},
  { id: 10, guest: "Jessica M.", phone: "+1 (555) 012-3456", email: "jessica.m@email.com", callDate: "Apr 7, 2026", bookingDate: "Apr 11-13, 2026", time: "9:30 AM", duration: "3m 45s", outcome: "Booked", value: "$380", adr: "$190", notes: "King room, spa package", transcript: [
    { speaker: "Agent", text: "Good morning, The Grand Monarch Hotel." },
    { speaker: "Guest", text: "Hi, do you have any spa and stay packages available?" },
    { speaker: "Agent", text: "Yes! Our Relaxation Package includes a King Room and a 60-minute massage for $190 per night." },
    { speaker: "Guest", text: "That's exactly what I need. Can I book two nights for this weekend?" },
    { speaker: "Agent", text: "Let me check... Yes, we have availability Saturday and Sunday. Your total would be $380." },
    { speaker: "Guest", text: "Perfect. Book it please, under Jessica M." },
  ]},
  { id: 11, guest: "Michael B.", phone: "+1 (555) 123-4567", email: "michael.b@corp.com", callDate: "Apr 6, 2026", bookingDate: "—", time: "5:20 PM", duration: "2m 30s", outcome: "Transferred", value: "—", adr: "—", notes: "Transferred to events team", transcript: [
    { speaker: "Agent", text: "The Grand Monarch Hotel, how may I assist you?" },
    { speaker: "Guest", text: "I'm looking to host a corporate retreat at your hotel. Do you have meeting facilities?" },
    { speaker: "Agent", text: "Absolutely! We have several conference rooms and event spaces. Let me connect you with our events team who can discuss packages and availability." },
    { speaker: "Guest", text: "Great, how many people can your largest space accommodate?" },
    { speaker: "Agent", text: "Our Grand Ballroom holds up to 300 guests. Our events coordinator can give you a full tour. Transferring you now." },
  ]},
  { id: 12, guest: "Amanda R.", phone: "+1 (555) 234-5679", email: "amanda.r@email.com", callDate: "Apr 6, 2026", bookingDate: "Apr 12-13, 2026", time: "3:00 PM", duration: "4m 55s", outcome: "Booked", value: "$520", adr: "$260", notes: "Junior suite, honeymoon", transcript: [
    { speaker: "Agent", text: "Thank you for calling The Grand Monarch. How can I make your day special?" },
    { speaker: "Guest", text: "We just got engaged and want to book a romantic getaway!" },
    { speaker: "Agent", text: "Congratulations! That's wonderful news! Our Junior Suite would be perfect - it includes rose petal turndown and champagne on arrival." },
    { speaker: "Guest", text: "Oh that sounds dreamy! When is it available?" },
    { speaker: "Agent", text: "We have openings next weekend, April 12-13. The Junior Suite is $260 per night." },
    { speaker: "Guest", text: "Can we add a couples dinner?" },
    { speaker: "Agent", text: "Our Romance Package adds a private dinner for two at $120. So two nights plus dinner would be $520." },
    { speaker: "Guest", text: "Yes! Book it all please!" },
  ]},
  { id: 13, guest: "Chris T.", phone: "+1 (555) 345-6780", email: "—", callDate: "Apr 6, 2026", bookingDate: "—", time: "1:15 PM", duration: "0m 38s", outcome: "Missed", value: "—", adr: "—", notes: "Hung up before connection", transcript: [
    { speaker: "System", text: "Incoming call. Ringing..." },
    { speaker: "System", text: "Call disconnected before agent could answer." },
  ]},
  { id: 14, guest: "Nicole F.", phone: "+1 (555) 456-7891", email: "nicole.f@apex.com", callDate: "Apr 6, 2026", bookingDate: "Apr 18-21, 2026", time: "10:45 AM", duration: "5m 30s", outcome: "Booked", value: "$720", adr: "$240", notes: "Executive suite, corporate rate", transcript: [
    { speaker: "Agent", text: "The Grand Monarch Hotel corporate reservations, this is Taylor." },
    { speaker: "Guest", text: "Hi Taylor, I'm with Apex Industries. We have a corporate account with you." },
    { speaker: "Agent", text: "Yes, I can see your account. How can I help you today, Ms. F?" },
    { speaker: "Guest", text: "I need an Executive Suite for our CFO visiting April 18-21." },
    { speaker: "Agent", text: "I have that available. With your corporate rate, the Executive Suite is $240 per night instead of $320." },
    { speaker: "Guest", text: "Excellent. Please also arrange airport pickup." },
    { speaker: "Agent", text: "Of course. Three nights at $240 is $720. I'll coordinate the airport transfer with our concierge. What's the flight number?" },
    { speaker: "Guest", text: "UA 456, arriving at 3 PM on the 18th." },
    { speaker: "Agent", text: "All set. Confirmation will be sent to your corporate email." },
  ]},
  { id: 15, guest: "Brandon H.", phone: "+1 (555) 567-8902", email: "brandon.h@email.com", callDate: "Apr 5, 2026", bookingDate: "Apr 10-12, 2026", time: "4:30 PM", duration: "3m 15s", outcome: "Booked", value: "$340", adr: "$170", notes: "Standard room, 2 nights", transcript: [
    { speaker: "Agent", text: "Good afternoon, The Grand Monarch Hotel." },
    { speaker: "Guest", text: "Hi, I need a room for this coming Friday and Saturday." },
    { speaker: "Agent", text: "We have standard rooms available at $170 per night. Would that work for you?" },
    { speaker: "Guest", text: "Yes, that's fine. Do you have parking?" },
    { speaker: "Agent", text: "We offer valet parking at $25 per day or self-parking at $15 per day." },
    { speaker: "Guest", text: "I'll do self-parking. Book the room please." },
    { speaker: "Agent", text: "Perfect. Two nights in a standard room, $340 total. Self-parking noted. May I have your name?" },
    { speaker: "Guest", text: "Brandon H." },
  ]},
  { id: 16, guest: "Patricia W.", phone: "+1 (555) 678-9013", email: "patricia.w@email.com", callDate: "Apr 5, 2026", bookingDate: "Apr 11-12, 2026", time: "2:15 PM", duration: "4m 45s", outcome: "Not Booked", notBookedReason: "Price", value: "—", adr: "—", notes: "Price too high", transcript: [
    { speaker: "Agent", text: "Good afternoon, The Grand Monarch Hotel. How may I help you?" },
    { speaker: "Guest", text: "Hi, I'm looking for a room for next weekend. What are your rates?" },
    { speaker: "Agent", text: "For next weekend, our standard rooms start at $195 per night, and our deluxe rooms are $275 per night." },
    { speaker: "Guest", text: "Oh, that's more than I was expecting. Do you have any promotions or discounts available?" },
    { speaker: "Agent", text: "We do have a 10% discount for AAA members. Are you a member?" },
    { speaker: "Guest", text: "No, I'm not. I think I'll need to look at some other options. That's a bit out of my budget." },
    { speaker: "Agent", text: "I understand. If you change your mind, feel free to call back. We also have last-minute deals that sometimes become available." },
    { speaker: "Guest", text: "Okay, thank you for your time." },
  ]},
  { id: 17, guest: "Steven R.", phone: "+1 (555) 789-0124", email: "steven.r@email.com", callDate: "Apr 5, 2026", bookingDate: "May 22-25, 2026", time: "11:30 AM", duration: "3m 20s", outcome: "Not Booked", notBookedReason: "Availability", value: "—", adr: "—", notes: "No availability for requested dates", transcript: [
    { speaker: "Agent", text: "The Grand Monarch Hotel, this is Casey speaking." },
    { speaker: "Guest", text: "Hi Casey, I'd like to book a room for the Memorial Day weekend." },
    { speaker: "Agent", text: "Let me check availability for you... I'm sorry, but we're fully booked for Memorial Day weekend. It's one of our busiest times." },
    { speaker: "Guest", text: "Really? Nothing at all?" },
    { speaker: "Agent", text: "Unfortunately not. I can put you on our waitlist in case of cancellations, or I could check nearby dates?" },
    { speaker: "Guest", text: "No, we specifically need that weekend. I'll try somewhere else. Thanks anyway." },
    { speaker: "Agent", text: "I'm sorry we couldn't accommodate you. Please consider us for future stays!" },
  ]},
  { id: 18, guest: "Karen L.", phone: "+1 (555) 890-1235", email: "karen.l@email.com", callDate: "Apr 4, 2026", bookingDate: "Jun 5-8, 2026", time: "3:45 PM", duration: "5m 10s", outcome: "Not Booked", notBookedReason: "Other", value: "—", adr: "—", notes: "Chose competitor hotel", transcript: [
    { speaker: "Agent", text: "Thank you for calling The Grand Monarch Hotel." },
    { speaker: "Guest", text: "Hi, I'm comparing hotels for a family reunion. Can you tell me about your group rates?" },
    { speaker: "Agent", text: "Absolutely! For groups of 10 rooms or more, we offer a 15% discount. We also have meeting spaces available." },
    { speaker: "Guest", text: "That's helpful. The Seaside Resort is offering us 20% off and free breakfast for the group." },
    { speaker: "Agent", text: "I see. Let me check if we can match that... Unfortunately, our best offer would be 15% with complimentary parking." },
    { speaker: "Guest", text: "I appreciate you checking, but I think we'll go with the Seaside Resort. The breakfast is important for our group." },
    { speaker: "Agent", text: "I understand. Thank you for considering us, and please keep us in mind for future events." },
  ]},
  { id: 19, guest: "Daniel M.", phone: "+1 (555) 901-2346", email: "daniel.m@email.com", callDate: "Apr 4, 2026", bookingDate: "Apr 18-20, 2026", time: "10:00 AM", duration: "2m 55s", outcome: "Not Booked", notBookedReason: "Policy", value: "—", adr: "—", notes: "Pet policy issue", transcript: [
    { speaker: "Agent", text: "Good morning, The Grand Monarch Hotel." },
    { speaker: "Guest", text: "Hi, do you allow pets? I have a large dog." },
    { speaker: "Agent", text: "We do accept pets, but there's a size limit of 25 pounds and a $50 per night pet fee." },
    { speaker: "Guest", text: "My dog is a golden retriever, about 70 pounds. Is there any exception?" },
    { speaker: "Agent", text: "I'm sorry, but our pet policy is firm due to our room configurations. I apologize for the inconvenience." },
    { speaker: "Guest", text: "That's disappointing. I'll need to find somewhere else that can accommodate us. Thanks." },
  ]},
]

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

const notBookedReasonOptions = ["Price", "Availability", "Amenities", "Policy", "Other"]

function OutcomeBadge({ outcome }: { outcome: string }) {
  const styles: Record<string, string> = {
    Booked: "bg-[#6b7a4a]/10 text-[#6b7a4a] border border-[#6b7a4a]/20",
    "Not Booked": "bg-[#9ca3af]/10 text-[#6b7280] border border-[#9ca3af]/20 whitespace-nowrap",
    Transferred: "bg-[#c4a84b]/10 text-[#a08930] border border-[#c4a84b]/20",
    Missed: "bg-[#8b5a3c]/10 text-[#8b5a3c] border border-[#8b5a3c]/20",
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[outcome]}`}>
      {outcome}
    </span>
  )
}

export default function CallLogPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [outcomeFilter, setOutcomeFilter] = useState("all")
  const [notBookedReasonFilter, setNotBookedReasonFilter] = useState("all")
  const [timespan, setTimespan] = useState("30")
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [timeFrom, setTimeFrom] = useState("")
  const [timeTo, setTimeTo] = useState("")
  const [dateFilterType, setDateFilterType] = useState<"call" | "booking">("call")

  const toggleRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id)
  }

  // Helper to parse call date string to Date object
  const parseCallDate = (dateStr: string) => {
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    }
    const parts = dateStr.split(' ')
    const month = months[parts[0]]
    const day = parseInt(parts[1].replace(',', ''))
    const year = parseInt(parts[2])
    return new Date(year, month, day)
  }

  // Helper to parse time string to comparable number (minutes since midnight)
  const parseTime = (timeStr: string) => {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
    if (!match) return 0
    let hours = parseInt(match[1])
    const minutes = parseInt(match[2])
    const period = match[3].toUpperCase()
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    return hours * 60 + minutes
  }

  // Helper to parse input time (HH:MM) to minutes since midnight
  const parseInputTime = (timeStr: string) => {
    if (!timeStr) return null
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  const filteredCalls = allCalls.filter((call) => {
    const matchesSearch = call.guest.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.phone.includes(searchQuery) ||
      call.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.notes.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesOutcome = outcomeFilter === "all" || call.outcome.toLowerCase() === outcomeFilter
    const matchesNotBookedReason = notBookedReasonFilter === "all" ||
      (call.outcome === "Not Booked" && call.notBookedReason === notBookedReasonFilter)
    
    // Date filtering - supports both call date and booking date
    let matchesDate = true
    if (dateFrom || dateTo) {
      const dateToFilter = dateFilterType === "call" ? call.callDate : call.bookingDate
      // Skip filtering if booking date is "—" (no booking)
      if (dateFilterType === "booking" && dateToFilter === "—") {
        matchesDate = false
      } else if (dateToFilter !== "—") {
        // Parse the date - handle booking date ranges like "Apr 15-17, 2026"
        let filterDate: Date
        if (dateFilterType === "booking" && dateToFilter.includes("-")) {
          // For booking date ranges, use the start date
          const startDateStr = dateToFilter.split("-")[0].trim() + ", " + dateToFilter.split(", ")[1]
          filterDate = parseCallDate(startDateStr)
        } else {
          filterDate = parseCallDate(dateToFilter)
        }
        
        if (dateFrom) {
          const fromDate = new Date(dateFrom)
          matchesDate = matchesDate && filterDate >= fromDate
        }
        if (dateTo) {
          const toDate = new Date(dateTo)
          matchesDate = matchesDate && filterDate <= toDate
        }
      }
    }

    // Time filtering
    let matchesTime = true
    if (timeFrom || timeTo) {
      const callTime = parseTime(call.time)
      const fromTime = parseInputTime(timeFrom)
      const toTime = parseInputTime(timeTo)
      if (fromTime !== null) {
        matchesTime = matchesTime && callTime >= fromTime
      }
      if (toTime !== null) {
        matchesTime = matchesTime && callTime <= toTime
      }
    }

    return matchesSearch && matchesOutcome && matchesNotBookedReason && matchesDate && matchesTime
  })

  const totalCalls = filteredCalls.length
  const totalDuration = filteredCalls.reduce((acc, call) => {
    const [mins, secs] = call.duration.replace('s', '').split('m ').map(Number)
    return acc + mins * 60 + (secs || 0)
  }, 0)
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0
  const avgMins = Math.floor(avgDuration / 60)
  const avgSecs = avgDuration % 60

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Call Log</h2>
            <div className="flex items-center gap-1 mt-1">
              <Select value={timespan} onValueChange={setTimespan}>
                <SelectTrigger className="h-auto p-0 border-0 bg-transparent shadow-none text-sm text-muted-foreground hover:text-foreground focus:ring-0 w-auto gap-1">
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
              <span className="text-sm text-muted-foreground">· The Grand Monarch Hotel</span>
            </div>
          </div>
          <Button variant="outline" className="gap-2 text-sm">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Stats Summary */}
        <div className="flex flex-wrap gap-4 mb-6">
          <Card className="border-border flex-shrink-0">
            <CardContent className="p-4 pr-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-card-foreground">{totalCalls}</p>
                  <p className="text-xs text-muted-foreground">Total Calls</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border flex-shrink-0">
            <CardContent className="p-4 pr-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-card-foreground">{avgMins}m {avgSecs}s</p>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border flex-shrink-0">
            <CardContent className="p-4 pr-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-[#6b7a4a]" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-card-foreground">
                    {filteredCalls.reduce((acc, call) => {
                      const match = call.duration.match(/(\d+)m\s*(\d+)s/)
                      if (match) {
                        return acc + parseInt(match[1]) + parseInt(match[2]) / 60
                      }
                      return acc
                    }, 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Talk Time (min)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by guest, phone, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="w-44 bg-card border-border">
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="not booked">Not Booked</SelectItem>
              <SelectItem value="transferred">Transferred</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={notBookedReasonFilter} onValueChange={setNotBookedReasonFilter}>
            <SelectTrigger className="w-52 bg-card border-border">
              <SelectValue placeholder="Not booked reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Not booked reasons</SelectItem>
              {notBookedReasonOptions.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Date Range Filters */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md bg-muted p-0.5">
              <button
                onClick={() => setDateFilterType("call")}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  dateFilterType === "call"
                    ? "bg-card text-card-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Call Date
              </button>
              <button
                onClick={() => setDateFilterType("booking")}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  dateFilterType === "booking"
                    ? "bg-card text-card-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Booking Date
              </button>
            </div>
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 bg-card border-border text-sm"
              placeholder="From date"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 bg-card border-border text-sm"
            />
          </div>

          {/* Time Range Filters */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Input
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="w-28 bg-card border-border text-sm"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="time"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
              className="w-28 bg-card border-border text-sm"
            />
          </div>

          {/* Clear Filters */}
          {(dateFrom || dateTo || timeFrom || timeTo || notBookedReasonFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom("")
                setDateTo("")
                setTimeFrom("")
                setTimeTo("")
                setNotBookedReasonFilter("all")
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Calls Table */}
        <Card className="border-border">
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="p-4 font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground">
                      Guest <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="p-4 font-medium">Phone</th>
                  <th className="p-4 font-medium">Email</th>
                  <th className="p-4 font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground">
                      Call Date <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="p-4 font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground">
                      Booking Date <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground">
                      Duration <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
<th className="p-4 font-medium">Outcome</th>
  <th className="p-4 font-medium">Not Booked Reason</th>
  <th className="p-4 font-medium">
  <button className="flex items-center gap-1 hover:text-foreground">
  Stay Value <ArrowUpDown className="w-3 h-3" />
  </button>
  </th>
  <th className="p-4 font-medium">
  <button className="flex items-center gap-1 hover:text-foreground">
  ADR <ArrowUpDown className="w-3 h-3" />
  </button>
  </th>
  <th className="p-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredCalls.map((call) => (
                  <Fragment key={call.id}>
                    <tr 
                      onClick={() => toggleRow(call.id)}
                      className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${expandedRow === call.id ? 'bg-muted/30' : ''}`}
                    >
                      <td className="p-4 font-medium text-card-foreground">
                        <div className="flex items-center gap-2">
                          {expandedRow === call.id ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                          {call.guest}
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{call.phone}</td>
                      <td className="p-4 text-muted-foreground">{call.email}</td>
                      <td className="p-4 text-muted-foreground">{call.callDate}</td>
                      <td className="p-4 text-muted-foreground">{call.bookingDate}</td>
                      <td className="p-4 text-muted-foreground">{call.time}</td>
                      <td className="p-4 text-muted-foreground">{call.duration}</td>
                      <td className="p-4">
                        <OutcomeBadge outcome={call.outcome} />
                      </td>
                      <td className="p-4">
                        {call.notBookedReason ? (
                          <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {call.notBookedReason}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
<td className="p-4 text-muted-foreground">{call.value}</td>
  <td className="p-4 text-muted-foreground">{call.adr}</td>
  <td className="p-4 text-muted-foreground max-w-xs truncate">{call.notes}</td>
                    </tr>
                    {expandedRow === call.id && (
                      <tr key={`${call.id}-transcript`} className="bg-muted/20">
                        <td colSpan={12} className="p-0">
                          <div className="p-6 border-b border-border">
                            <h4 className="text-sm font-semibold text-foreground mb-4">Call Transcript</h4>
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                              {call.transcript.map((line, idx) => (
                                <div key={idx} className="flex gap-3">
                                  <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${
                                    line.speaker === 'Agent' 
                                      ? 'bg-[#6b7a4a]/10 text-[#6b7a4a]' 
                                      : line.speaker === 'Guest'
                                      ? 'bg-[#c4a84b]/10 text-[#a08930]'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {line.speaker}
                                  </span>
                                  <p className="text-sm text-card-foreground leading-relaxed">{line.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            
            {filteredCalls.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No calls found matching your criteria.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination hint */}
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Showing {filteredCalls.length} of {allCalls.length} calls</span>
        </div>
      </main>
    </div>
  )
}
