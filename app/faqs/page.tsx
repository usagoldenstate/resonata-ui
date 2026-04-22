"use client"

import { useState } from "react"
import { MessageSquare, Search, ArrowUpDown, TrendingUp, Crown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"

const faqs = [
  {
    id: 1,
    question: "What are your room rates?",
    mentions: 847,
    trend: +12,
    category: "Pricing",
    sampleAnswer: "Our rates vary by room type: Standard rooms start at $140/night, Deluxe rooms at $215/night, Junior Suites at $260/night, and our Penthouse Suite at $350/night.",
  },
  {
    id: 2,
    question: "What dates do you have availability?",
    mentions: 723,
    trend: +8,
    category: "Booking",
    sampleAnswer: "We maintain real-time availability. Popular dates like weekends and holidays book quickly, so we recommend booking 2-3 weeks in advance.",
  },
  {
    id: 3,
    question: "Do you offer early check-in or late check-out?",
    mentions: 612,
    trend: +15,
    category: "Policies",
    sampleAnswer: "Early check-in is available at 10 AM for $25, or complimentary for rewards members. Late check-out until 2 PM is $35 based on availability.",
  },
  {
    id: 4,
    question: "Do you have parking available?",
    mentions: 534,
    trend: +3,
    category: "Amenities",
    sampleAnswer: "Yes, we offer valet parking at $25 per day and self-parking at $15 per day. Both include unlimited in/out privileges.",
  },
  {
    id: 5,
    question: "What spa treatments do you offer?",
    mentions: 489,
    trend: +22,
    category: "Amenities",
    sampleAnswer: "Our spa offers massages, facials, body wraps, and couples packages. Our Relaxation Package includes a room and 60-minute massage for $190/night.",
  },
  {
    id: 6,
    question: "Can you arrange airport transportation?",
    mentions: 445,
    trend: +5,
    category: "Services",
    sampleAnswer: "Absolutely! Our concierge can arrange airport pickup and drop-off. Please provide your flight details at least 24 hours in advance.",
  },
  {
    id: 7,
    question: "Do you have rooms that accommodate families with children?",
    mentions: 398,
    trend: +18,
    category: "Booking",
    sampleAnswer: "Our Family Suite accommodates 2 adults and 3 children with a master bedroom, kids' room with bunk beds, and living area at $248/night. Cribs available at no charge.",
  },
  {
    id: 8,
    question: "Do you have a corporate rate or business account?",
    mentions: 356,
    trend: +7,
    category: "Pricing",
    sampleAnswer: "Yes, we offer corporate rates with discounts up to 25%. Contact our corporate reservations team to set up an account for your company.",
  },
  {
    id: 9,
    question: "Is breakfast included in the room rate?",
    mentions: 312,
    trend: -2,
    category: "Amenities",
    sampleAnswer: "Breakfast is not included in standard rates, but can be added for $35/day for two guests. Some packages include complimentary breakfast.",
  },
  {
    id: 10,
    question: "Do you have meeting rooms or event spaces?",
    mentions: 287,
    trend: +10,
    category: "Services",
    sampleAnswer: "We have several conference rooms and our Grand Ballroom holds up to 300 guests. Our events team can customize packages for corporate retreats and special occasions.",
  },
  {
    id: 11,
    question: "What is your cancellation policy?",
    mentions: 256,
    trend: -5,
    category: "Policies",
    sampleAnswer: "Free cancellation up to 48 hours before check-in. Cancellations within 48 hours are charged one night's stay. Special event dates may have different policies.",
  },
  {
    id: 12,
    question: "Do you offer any romantic or honeymoon packages?",
    mentions: 234,
    trend: +25,
    category: "Booking",
    sampleAnswer: "Our Romance Package includes the Junior Suite with rose petal turndown, champagne on arrival, and a private dinner for two at $520 for two nights.",
  },
  {
    id: 13,
    question: "Do you have ocean view rooms?",
    mentions: 198,
    trend: +4,
    category: "Booking",
    sampleAnswer: "Yes! Our Deluxe Ocean View rooms feature private balconies overlooking the water at $215/night. Book early as these rooms are popular.",
  },
  {
    id: 14,
    question: "What amenities are included in the penthouse suite?",
    mentions: 167,
    trend: +9,
    category: "Amenities",
    sampleAnswer: "The Penthouse includes 24/7 butler service, private terrace, executive lounge access, complimentary minibar, and premium toiletries at $350/night.",
  },
  {
    id: 15,
    question: "Do you have a rewards or loyalty program?",
    mentions: 145,
    trend: +14,
    category: "Policies",
    sampleAnswer: "Yes! Our rewards program offers complimentary early check-in, room upgrades when available, and points toward free nights. Sign-up is free at check-in.",
  },
]

const timespanOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
]

const categories = ["All", "Pricing", "Booking", "Policies", "Amenities", "Services"]

export default function FAQsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [timespan, setTimespan] = useState("30")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [sortOrder, setSortOrder] = useState<"most" | "least">("most")

  const filteredFaqs = faqs
    .filter((faq) => {
      const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.sampleAnswer.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = categoryFilter === "All" || faq.category === categoryFilter
      return matchesSearch && matchesCategory
    })
    .sort((a, b) => sortOrder === "most" ? b.mentions - a.mentions : a.mentions - b.mentions)
  
  const topQuestion = faqs.reduce((max, faq) => faq.mentions > max.mentions ? faq : max, faqs[0])

  const totalMentions = filteredFaqs.reduce((acc, faq) => acc + faq.mentions, 0)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-foreground">Frequently Asked Questions</h2>
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

        {/* Top Question Highlight */}
        <Card className="border-border bg-[#6b7a4a]/5 mb-6">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[#6b7a4a] flex items-center justify-center flex-shrink-0">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-[#6b7a4a] uppercase tracking-wide">Most Asked Question</span>
                  <span className="text-xs text-muted-foreground">· {topQuestion.mentions.toLocaleString()} mentions</span>
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">{topQuestion.question}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{topQuestion.sampleAnswer}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6 max-w-xl">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-card-foreground">{filteredFaqs.length}</p>
                  <p className="text-xs text-muted-foreground">Unique Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <span className="text-[#6b7a4a] font-semibold text-sm">#</span>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-card-foreground">{totalMentions.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Mentions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(value: "most" | "least") => setSortOrder(value)}>
            <SelectTrigger className="w-48 bg-card border-border">
              <ArrowUpDown className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most">Most Common First</SelectItem>
              <SelectItem value="least">Least Common First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* FAQ List */}
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filteredFaqs.map((faq, index) => {
                const isTopQuestion = faq.id === topQuestion.id
                const rank = sortOrder === "most" ? index + 1 : filteredFaqs.length - index
                return (
                <div key={faq.id} className={`p-5 hover:bg-muted/30 transition-colors ${isTopQuestion ? 'bg-[#6b7a4a]/5' : ''}`}>
                  <div className="flex items-start gap-4">
                    {/* Rank */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isTopQuestion ? 'bg-[#6b7a4a] text-white' : 'bg-[#6b7a4a]/10'
                    }`}>
                      <span className={`text-sm font-semibold ${isTopQuestion ? 'text-white' : 'text-[#6b7a4a]'}`}>{rank}</span>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className="font-medium text-card-foreground">{faq.question}</h3>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            faq.category === 'Pricing' ? 'bg-[#c4a84b]/10 text-[#a08930]' :
                            faq.category === 'Booking' ? 'bg-[#6b7a4a]/10 text-[#6b7a4a]' :
                            faq.category === 'Policies' ? 'bg-[#8b5a3c]/10 text-[#8b5a3c]' :
                            faq.category === 'Amenities' ? 'bg-blue-500/10 text-blue-600' :
                            'bg-purple-500/10 text-purple-600'
                          }`}>
                            {faq.category}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{faq.sampleAnswer}</p>
                      <div className="flex items-center gap-6 text-xs">
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-card-foreground">{faq.mentions.toLocaleString()}</span> mentions
                        </span>
                        {isTopQuestion && (
                          <span className="flex items-center gap-1 text-[#6b7a4a] font-medium">
                            <TrendingUp className="w-3 h-3" />
                            Most Asked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
