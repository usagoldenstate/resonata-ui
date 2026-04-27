"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import {
  Building2,
  Key,
  Bed,
  Star,
  Waves,
  Heart,
  Car,
  PawPrint,
  UtensilsCrossed,
  CreditCard,
  MapPin,
  Sparkles,
  Mic,
  Accessibility,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Globe,
  Bookmark,
  Tag,
  ArrowLeft,
  MoreVertical,
  Pencil,
  Trash2,
  Save,
  Gift,
  Dumbbell,
  Compass,
  Users,
  ExternalLink,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"
import {
  entriesToSections,
  sectionsToEntries,
  type KnowledgeEntry,
} from "@/lib/knowledge-serialize"

// ─── Confidence types ───
type ConfidenceLevel = "confirmed" | "likely" | "review" | "missing"

interface Field {
  key: string
  label: string
  value: string
  confidence: ConfidenceLevel
  source: string | null
  critical: boolean
  edited: boolean
  custom?: boolean
}

interface CatalogItem {
  id: string
  [key: string]: string
  conf: string
  src: string | null
}

interface CatalogSchema {
  key: string
  label: string
  flex: string
}

interface Room {
  name: string
  desc: string
  conf: ConfidenceLevel
  src: string | null
  pmsCode: string
}

interface PoolCard {
  id: string
  name: string
  poolType: "outdoor" | "indoor" | "rooftop" | "heated" | "lap" | ""
  heated: boolean
  hours: string
  hotTub: boolean
  poolsideService: boolean
  poolBar: boolean
  cabanas: boolean
  cabanaSurcharge: string
  otherInfo: string
}

interface VenueCard {
  id: string
  name: string
  capacity: string
  description: string
}

interface Section {
  id: string
  title: string
  fields?: Field[]
  generated?: boolean
  alwaysMissing?: boolean
  custom?: boolean
  // Catalog section support
  type?: "catalog" | "pool" | "venue"
  itemLabel?: string
  schema?: CatalogSchema[]
  items?: CatalogItem[]
  meta?: Field[]
  // Pool section support
  pools?: PoolCard[]
  // Venue section support
  venues?: VenueCard[]
}

interface PropertyData {
  id: string
  pName: string
  pType: string
  sections: Section[]
  rooms: Room[]
  sources: Record<string, { count: number }>
  stats: {
    confirmed: number
    likely: number
    review: number
    missing: number
    critical: Field[]
    generatedCount: number
  }
  createdAt: Date
  updatedAt: Date
}

// ─── Constants ───
const SECTION_ICONS: Record<string, React.ReactNode> = {
  overview: <Building2 className="w-4 h-4" />,
  checkin: <Key className="w-4 h-4" />,
  inroom: <Star className="w-4 h-4" />,

  pool: <Waves className="w-4 h-4" />,
  spa: <Heart className="w-4 h-4" />,
  fitness: <Dumbbell className="w-4 h-4" />,
  activities: <Compass className="w-4 h-4" />,
  dining: <UtensilsCrossed className="w-4 h-4" />,
  conveniences: <Sparkles className="w-4 h-4" />,
  parking: <Car className="w-4 h-4" />,
  pets: <PawPrint className="w-4 h-4" />,
  accessibility: <Accessibility className="w-4 h-4" />,
  housekeeping: <Sparkles className="w-4 h-4" />,
  payment: <CreditCard className="w-4 h-4" />,
  events: <Users className="w-4 h-4" />,
  nearby: <MapPin className="w-4 h-4" />,
  otherAmenities: <Sparkles className="w-4 h-4" />,
  agent: <Mic className="w-4 h-4" />,
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  website: <Globe className="w-3.5 h-3.5" />,
  google: <MapPin className="w-3.5 h-3.5" />,
  tripadvisor: <Bookmark className="w-3.5 h-3.5" />,
  ota: <Tag className="w-3.5 h-3.5" />,
}

const SOURCE_LABELS: Record<string, string> = {
  website: "Hotel Website",
  google: "Google Business",
  tripadvisor: "TripAdvisor",
  ota: "OTA Listings",
}

const CONF_CONFIG = {
  confirmed: { label: "Confirmed", variant: "default" as const, mark: "check" },
  likely: { label: "Likely", variant: "secondary" as const, mark: "~" },
  review: { label: "Review", variant: "outline" as const, mark: "!" },
  missing: { label: "Missing", variant: "destructive" as const, mark: "?" },
}

const SCAN_STEPS = [
  { label: "Searching for property", dur: 600 },
  { label: "Scraping hotel website", dur: 900 },
  { label: "Checking Google Business", dur: 700 },
  { label: "Scanning TripAdvisor", dur: 800 },
  { label: "Reading OTA listings", dur: 600 },
  { label: "Classifying property type", dur: 500 },
  { label: "Generating knowledge base", dur: 700 },
]

// ─── Default Sections Schema ───
function defaultSections(): Section[] {
  const mk = (key: string, label: string, critical = false): Field => ({
    key, label, value: "", confidence: "missing", source: null, critical, edited: false,
  })
  
  return [
    { id: "overview", title: "Property Overview", fields: [
      mk("name", "Property Name", true),
      mk("brand", "Brand / Chain"),
      mk("type", "Property Type"),
      mk("setting", "Location Highlights"),
      mk("address", "Full Address", true),
      mk("phoneMain", "Hotel Front Desk", true),
      mk("phoneToll", "New Reservations Number"),
      mk("email", "Email"),
      mk("bookingUrl", "Booking URL", true),
      mk("giftCards", "Gift Cards URL"),
      mk("recognitions", "Recognitions / Awards"),
      mk("totalRooms", "Total Rooms"),
      mk("languages", "Languages Spoken"),
    ]},
    { id: "checkin", title: "Check-in & Check-out", fields: [
      mk("cin", "Check-In Time", true),
      mk("cout", "Check-Out Time", true),
      mk("earlyCin", "Early Check-In Policy"),
      mk("lateCout", "Late Check-Out Policy"),
      mk("minAge", "Minimum Check-In Age"),
      mk("ccPolicy", "Credit Card / ID Policy"),
    ]},
    { id: "inroom", title: "In-Room Amenities", fields: [
      mk("standard", "Standard Inclusions (every room)"),
      mk("selectRooms", "Available in Select Rooms"),
      mk("byRequest", "Available by Request"),
      mk("roomService", "Room Service Details"),
    ]},
    { id: "pool", title: "Pool & Outdoor", type: "pool",
      pools: [{ id: `pool_${Date.now()}`, name: "", poolType: "", heated: false, hours: "", hotTub: false, poolsideService: false, poolBar: false, cabanas: false, cabanaSurcharge: "", otherInfo: "" }],
      fields: [
        mk("outdoorSeating", "Outdoor Seating Areas"),
        mk("firePits", "Fire Pits"),
        mk("gardens", "Gardens / Grounds"),
        mk("otherOutdoor", "Other Outdoor Features"),
      ]
    },
    { id: "spa", title: "Spa & Wellness", fields: [
      mk("spaName", "Spa Name"),
      mk("spaPhone", "Direct Phone"),
      mk("spaEmail", "Email"),
      mk("spaHoursWeekday", "Hours (Weekday)"),
      mk("spaHoursWeekend", "Hours (Weekend)"),
      mk("spaPublic", "Open to Public?"),
      mk("spaBooking", "Booking URL"),
      mk("spaTreatments", "Treatment Types"),
      mk("spaSignature", "What Sets Us Apart"),
      mk("spaIncluded", "Amenities Included with Service"),
      mk("spaMenu", "Treatment Menu URL"),
    ]},
    { id: "fitness", title: "Fitness & Wellness Classes", fields: [
      mk("gymHours", "Fitness Center Hours"),
      mk("gymEquip", "Equipment"),
      mk("classes", "Class Types Offered"),
      mk("classCal", "Class Schedule URL"),
    ]},
    { id: "activities", title: "Hotel Activities", fields: [
      mk("summer", "Summer Activities"),
      mk("winter", "Winter Activities"),
      mk("yearRound", "Year-Round Activities"),
      mk("activityCal", "Activity Calendar URL"),
    ]},
    { id: "otherAmenities", title: "Other Amenities", fields: [
      mk("amenitiesDetails", "Amenities Details"),
    ]},
    { id: "dining", title: "On-Site Dining & Bars", type: "catalog",
      itemLabel: "Venue",
      schema: [
        { key: "name", label: "Venue Name", flex: "2 1 140px" },
        { key: "style", label: "Cuisine / Style", flex: "2 1 140px" },
        { key: "hours", label: "Hours / Season", flex: "1 1 120px" },
        { key: "bestKnownFor", label: "Best Known For", flex: "2 1 140px" },
        { key: "atmosphere", label: "Atmosphere", flex: "1 1 120px" },
        { key: "reservations", label: "Reservations Recommended", flex: "0 0 100px", type: "boolean" },
      ],
      items: [],
    },
    { id: "conveniences", title: "General Conveniences", fields: [
      mk("frontDesk", "Front Desk Hours"),
      mk("concierge", "Concierge Service"),
      mk("coffeeShop", "Coffee Shop / Cafe"),
      mk("waterStations", "Water Refill Stations"),
      mk("sustainability", "Sustainability Features"),
      mk("otherConveniences", "Other Conveniences"),
    ]},
    { id: "parking", title: "Parking & Transportation", fields: [
      mk("selfPark", "Self-Parking", true),
      mk("valet", "Valet (cost/hours)"),
      mk("evCharging", "EV Charging"),
      mk("shuttle", "Shuttle Service"),
      mk("airports", "Nearest Airports & Distances"),
      mk("rideshare", "Rideshare / Taxi / Rental"),
    ]},
    { id: "pets", title: "Pet Policy", fields: [
      mk("petsAllowed", "Pets Allowed", true),
      mk("petTypes", "Types Allowed"),
      mk("petWeight", "Weight Limit"),
      mk("petFee", "Fee Structure"),
      mk("petBooking", "Booking Process"),
      mk("petWelcome", "Welcome Package"),
      mk("petRestrictions", "Leash / Unattended / Restrictions"),
      mk("petDining", "Pets at Dining / Pool"),
      mk("petHousekeeping", "Housekeeping Rules"),
    ]},
    { id: "accessibility", title: "Accessibility", fields: [
      mk("adaRooms", "ADA Rooms Available?", true),
      mk("adaParking", "Accessible Parking"),
      mk("adaPublic", "Public Area Accessibility"),
      mk("adaUrl", "Accessibility Page URL"),
    ]},
    { id: "housekeeping", title: "Housekeeping & Services", fields: [
      mk("hkFreq", "Frequency"),
      mk("hkDryClean", "Dry Cleaning / Laundry"),
      mk("hkExtra", "Extra Service Requests"),
    ]},
    { id: "payment", title: "Payment & Booking Policies", fields: [
      mk("cards", "Accepted Cards"),
      mk("loyaltyBenefit", "Loyalty Booking Benefit"),
      mk("smoking", "Smoking Policy"),
    ]},
    { id: "events", title: "Meetings, Events & Weddings", type: "venue",
      venues: [{ id: `venue_${Date.now()}`, name: "", capacity: "", description: "" }],
      fields: [
      mk("buyout", "Full Property Buyout?"),
      mk("weddings", "Wedding Services"),
      mk("corporate", "Corporate Retreats"),
      mk("eventsContact", "Events Contact"),
    ]},
    { id: "nearby", title: "Nearby Attractions", fields: [
      mk("walking", "Walking Distance / On-Site"),
      mk("under5mi", "Under 5 Miles"),
      mk("fiveTo25", "5 - 25 Miles"),
      mk("regional", "25+ Miles (Regional)"),
    ]},
  ]
}

// ─── Mock Data Generator ───
function generateMockData(query: string): PropertyData {
  const q = query.toLowerCase()
  const isLake = q.includes("lake") || q.includes("waterfront") || q.includes("canandaigua")

  const pName =
    query
      .replace(/https?:\/\/(www\.)?/g, "")
      .replace(/\.com.*/, "")
      .replace(/[/-]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Sample Property"
  const pType = isLake ? "Lakefront Luxury Resort" : "Full-Service Hotel"

  const sources: Record<string, { count: number }> = {
    website: { count: 0 },
    google: { count: 0 },
    tripadvisor: { count: 0 },
    ota: { count: 0 },
  }

  const f = (
    key: string,
    label: string,
    value: string,
    conf: ConfidenceLevel,
    src: string | null,
    critical = false
  ): Field => {
    if (src && sources[src]) sources[src].count++
    return { key, label, value, confidence: conf, source: src, critical, edited: false }
  }

  let secs: Section[]
  let rooms: Room[] = []

  if (isLake) {
    // Full Lake House data
    secs = [
      { id: "overview", title: "Property Overview", fields: [
        f("name", "Property Name", "The Lake House on Canandaigua", "confirmed", "website", true),
        f("brand", "Brand / Chain", "Independent - Preferred Hotels & Resorts (L.V.X. Collection)", "confirmed", "website"),
        f("type", "Property Type", "Full-service lakefront luxury resort", "confirmed", "website"),
        f("setting", "Location Highlights", "Northerly shore of Canandaigua Lake; 26 mi SE of Rochester, NY", "confirmed", "website"),
        f("address", "Full Address", "770 S Main Street, Canandaigua, NY 14424", "confirmed", "google", true),
        f("phoneMain", "Hotel Front Desk", "(585) 394-7800", "confirmed", "google", true),
        f("phoneToll", "New Reservations Number", "(800) 228-2801", "confirmed", "website"),
        f("email", "Email", "", "missing", null),
        f("bookingUrl", "Booking URL", "lakehousecanandaigua.com", "confirmed", "website", true),
        f("giftCards", "Gift Cards URL", "lakehousecdga.shop", "confirmed", "website"),
        f("recognitions", "Recognitions / Awards", "MICHELIN Guide; Amex Hotel Collection; Conde Nast Hot List; Beyond Green certified", "confirmed", "website"),
        f("totalRooms", "Total Rooms", "124", "confirmed", "website"),
        f("languages", "Languages Spoken", "English", "likely", "google"),
      ]},
      { id: "checkin", title: "Check-in & Check-out", fields: [
        f("cin", "Check-In Time", "4:00 PM", "confirmed", "website", true),
        f("cout", "Check-Out Time", "11:00 AM", "confirmed", "website", true),
        f("earlyCin", "Early Check-In Policy", "Guaranteed from 1 PM for $200 fee; otherwise subject to availability", "confirmed", "website"),
        f("lateCout", "Late Check-Out Policy", "Guaranteed until 1 PM for $200 fee; otherwise subject to availability", "confirmed", "website"),
        f("minAge", "Minimum Check-In Age", "", "missing", null),
        f("ccPolicy", "Credit Card / ID Policy", "Card used to book must be presented by cardholder at check-in with matching photo ID", "confirmed", "website"),
      ]},
      { id: "inroom", title: "In-Room Amenities", fields: [
        f("standard", "Standard Inclusions (every room)", "Free Wi-Fi, private balcony (most rooms), hand-crafted furniture, hardwood floors, Waterworks rainfall shower, plush robes, A/C, flat-screen TV, coffee/tea, desk, premium bath amenities", "confirmed", "website"),
        f("selectRooms", "Available in Select Rooms", "Gas fireplace (Lakefront Suite & Cottage Suite), soaking tub (Lakefront Suite), double vanities, twin sofa bed in parlor (suites)", "confirmed", "website"),
        f("byRequest", "Available by Request", "", "missing", null),
        f("roomService", "Room Service Details", "", "missing", null),
      ]},
      { id: "pool", title: "Pool & Outdoor", type: "pool",
        pools: [
          { id: "pool_1", name: "Lakefront Pool", poolType: "outdoor", heated: true, hours: "Seasonal - primarily summer", hotTub: true, poolsideService: true, poolBar: true, cabanas: true, cabanaSurcharge: "Available at surcharge", otherInfo: "Oversized jetted hot tub; towel warmers poolside" },
        ],
        fields: [
          f("outdoorSeating", "Outdoor Seating Areas", "Multiple lakefront seating areas", "confirmed", "website"),
          f("firePits", "Fire Pits", "Resort-wide fire pits with complimentary s'mores kits", "confirmed", "website"),
          f("gardens", "Gardens / Grounds", "Lakefront grounds with walking paths", "confirmed", "website"),
          f("otherOutdoor", "Other Outdoor Features", "", "missing", null),
        ]
      },
      { id: "spa", title: "Spa & Wellness", fields: [
        f("spaName", "Spa Name", "Willowbrook Spa", "confirmed", "website"),
        f("spaPhone", "Direct Phone", "(585) 394-9479", "confirmed", "website"),
        f("spaEmail", "Email", "spa@lakehousecanandaigua.com", "confirmed", "website"),
        f("spaHoursWeekday", "Hours (Weekday)", "Sun-Thu: 9 AM - 6 PM", "confirmed", "website"),
        f("spaHoursWeekend", "Hours (Weekend)", "Fri-Sat: 8 AM - 7 PM", "confirmed", "website"),
        f("spaPublic", "Open to Public?", "Yes - hotel guests and public", "confirmed", "website"),
        f("spaBooking", "Booking URL", "na.spatime.com/lhc14424sp", "confirmed", "website"),
        f("spaTreatments", "Treatment Types", "Massages (Swedish, deep tissue, hot stone, couples), facials, body treatments, manicures, pedicures", "confirmed", "website"),
        f("spaSignature", "What Sets Us Apart", "Nordic cedar barrel saunas overlooking the lake - year-round", "confirmed", "website"),
        f("spaIncluded", "Amenities Included", "Sunroom, heated pool & hot tub access, complimentary sauna, Himalayan salt feet warmers, sparkling wine, fruit water, hot tea, snacks, private lockers", "confirmed", "website"),
        f("spaMenu", "Treatment Menu URL", "heyzine.com/flip-book/c9178f92d1.html", "confirmed", "website"),
      ]},
    { id: "fitness", title: "Fitness Center & Classes", fields: [
        f("gymHours", "Fitness Center Hours", "24 hours", "confirmed", "website"),
        f("gymEquip", "Equipment", "Not specified online - verify with property", "review", "website"),
        f("classes", "Class Types Offered", "Yoga, Pilates, meditation, sound bath, morning stretch", "confirmed", "website"),
        f("classCal", "Class Schedule URL", "lakehousecanandaigua.com/events/", "confirmed", "website"),
      ]},
    { id: "activities", title: "Hotel Activities", fields: [
        f("summer", "Summer Activities", "Kayaking, paddleboarding, canoeing, sailing, pedal boating, water skiing, boat tours, sunset cruises", "confirmed", "website"),
        f("winter", "Winter Activities", "Ski shuttle to Bristol Mountain (20 min); nearby ice skating and sledding", "confirmed", "website"),
        f("yearRound", "Year-Round Activities", "Nordic barrel saunas, fire pits with s'mores, shuffleboard, arcade games (The Library), yoga, wellness classes, winery/brewery tours", "confirmed", "website"),
        f("activityCal", "Activity Calendar URL", "lakehousecanandaigua.com/events/", "confirmed", "website"),
      ]},
      { id: "otherAmenities", title: "Other Amenities", fields: [
        f("amenitiesDetails", "Amenities Details", "", "missing", null),
      ]},
      { id: "dining", title: "On-Site Dining & Bars", type: "catalog",
        itemLabel: "Venue",
        schema: [
          { key: "name", label: "Venue Name", flex: "2 1 140px" },
          { key: "style", label: "Cuisine / Style", flex: "2 1 140px" },
          { key: "hours", label: "Hours / Season", flex: "1 1 120px" },
          { key: "bestKnownFor", label: "Best Known For", flex: "2 1 140px" },
          { key: "atmosphere", label: "Atmosphere", flex: "1 1 120px" },
          { key: "reservations", label: "Reservations Recommended", flex: "0 0 100px", type: "boolean" },
        ],
        items: [
          { id: "d1", name: "Rose Tavern", style: "American / Finger Lakes seasonal", hours: "Breakfast, brunch, lunch, dinner", bestKnownFor: "Farm-to-table cuisine", atmosphere: "Upscale casual", reservations: true, conf: "confirmed", src: "website" },
          { id: "d2", name: "Sand Bar", style: "Casual lakeside bar - oysters, cold beer", hours: "Seasonal (summer)", bestKnownFor: "Fresh oysters & lake views", atmosphere: "Casual outdoor", reservations: false, conf: "confirmed", src: "website" },
          { id: "d3", name: "The Library", style: "Cocktail lounge - whiskey, craft cocktails, shuffleboard", hours: "Evenings", bestKnownFor: "Craft cocktails", atmosphere: "Cozy lounge", reservations: true, conf: "confirmed", src: "website" },
          { id: "d4", name: "Artisan Cafe", style: "Coffee shop - coffee and light refreshments", hours: "Confirm with front desk", bestKnownFor: "Morning coffee", atmosphere: "Quick service", reservations: false, conf: "likely", src: "website" },
        ],
      },
      { id: "conveniences", title: "General Conveniences", fields: [
        f("frontDesk", "Front Desk Hours", "24 hours", "confirmed", "website"),
        f("concierge", "Concierge Service", "Available - Fletcher frequently mentioned by name in guest reviews", "confirmed", "tripadvisor"),
        f("coffeeShop", "Coffee Shop / Cafe", "Artisan cafe on-site", "confirmed", "website"),
        f("waterStations", "Water Refill Stations", "Throughout the property (sustainability initiative)", "confirmed", "website"),
        f("sustainability", "Sustainability Features", "Geothermal power; water refill stations; Beyond Green certified", "confirmed", "website"),
        f("otherConveniences", "Other Conveniences", "Gift cards available at lakehousecdga.shop", "confirmed", "website"),
      ]},
      { id: "parking", title: "Parking & Transportation", fields: [
        f("selfPark", "Self-Parking", "Free - on-site for all guests", "confirmed", "website", true),
        f("valet", "Valet", "Complimentary valet, 24 hours", "confirmed", "website"),
        f("evCharging", "EV Charging", "On-site EV charging stations available", "confirmed", "website"),
        f("shuttle", "Shuttle Service", "Available to hotel guests only; operating hours 7 AM-11 PM; 48+ hrs advance booking recommended", "confirmed", "website"),
        f("airports", "Nearest Airports & Distances", "Rochester (ROC) ~32 mi, ~45 min | Syracuse (SYR) ~1hr15 | Buffalo (BUF) ~1hr30", "confirmed", "google"),
        f("rideshare", "Rideshare / Taxi / Rental", "Uber & Lyft serve Canandaigua. Airport Taxi: (585) 259-0508; Enterprise: (585) 396-1600", "confirmed", "google"),
      ]},
      { id: "pets", title: "Pet Policy", fields: [
        f("petsAllowed", "Pets Allowed", "Dogs only (service animals exempt)", "confirmed", "website", true),
        f("petTypes", "Types Allowed", "Dogs only", "confirmed", "website"),
        f("petWeight", "Weight Limit", "35 lbs (service animals exempt)", "confirmed", "website"),
        f("petFee", "Fee Structure", "$100 flat fee per stay + $50 cleaning fee per day", "confirmed", "website"),
        f("petBooking", "Booking Process", "CANNOT be booked online - must call (585) 394-7800. Dog-friendly rooms = first floor of North Cottage ONLY", "confirmed", "website"),
        f("petWelcome", "Welcome Package", "Dog bed, treats, and toys provided", "confirmed", "website"),
        f("petRestrictions", "Leash / Unattended / Restrictions", "Leash required at all times. Do not leave unattended (noise complaints = additional fees). Waste bags provided.", "confirmed", "website"),
        f("petDining", "Pets at Dining / Pool", "Allowed in outdoor dining areas (warm weather); NOT allowed indoors or at pool", "confirmed", "website"),
        f("petHousekeeping", "Housekeeping Rules", "Dog must be crated for housekeeping to service the room", "confirmed", "website"),
      ]},
      { id: "accessibility", title: "Accessibility", fields: [
        f("adaRooms", "ADA Rooms Available?", "Yes - call (585) 394-7800 to confirm specific features", "likely", "website", true),
        f("adaParking", "Accessible Parking", "On-site", "confirmed", "website"),
        f("adaPublic", "Public Area Accessibility", "Accessible public areas; 24-hr front desk for assistance", "confirmed", "website"),
        f("adaUrl", "Accessibility Page URL", "lakehousecanandaigua.com/accessibilty/", "confirmed", "website"),
      ]},
      { id: "housekeeping", title: "Housekeeping & Services", fields: [
        f("hkFreq", "Frequency", "Daily housekeeping", "confirmed", "website"),
        f("hkDryClean", "Dry Cleaning / Laundry", "Available - contact front desk", "confirmed", "website"),
        f("hkExtra", "Extra Service Requests", "Contact front desk", "confirmed", "website"),
      ]},
      { id: "payment", title: "Payment & Booking Policies", fields: [
        f("cards", "Accepted Cards", "All major cards", "confirmed", "website"),
        f("loyaltyBenefit", "Loyalty Booking Benefit", "I Prefer Hotel Rewards - direct booking always gets best rate; earn cash rewards", "confirmed", "website"),
        f("smoking", "Smoking Policy", "", "missing", null),
      ]},
      { id: "events", title: "Meetings, Events & Weddings", type: "venue",
        venues: [
          { id: "venue_1", name: "Event Barn", capacity: "Up to 200 guests", description: "Large lakefront event space for weddings and receptions" },
          { id: "venue_2", name: "Lakeside Terrace", capacity: "Up to 80 guests", description: "Outdoor ceremony space with lake views" },
        ],
        fields: [
        f("buyout", "Full Property Buyout?", "Yes - entire property available for exclusive buyout", "confirmed", "website"),
        f("weddings", "Wedding Services", "On-site wedding planner; premier lakefront setting", "confirmed", "website"),
        f("corporate", "Corporate Retreats", "Lakefront meeting space, team-building, world-class dining", "confirmed", "website"),
        f("eventsContact", "Events Contact", "events@lakehousecanandaigua.com | (585) 394-7800", "confirmed", "website"),
      ]},
      { id: "nearby", title: "Nearby Attractions", fields: [
        f("walking", "Walking Distance / On-Site", "Canandaigua Lake (on-site); Canandaigua City Pier (~0.3 mi); Kershaw Park (~0.2 mi); Downtown Canandaigua (~0.5 mi)", "confirmed", "google"),
        f("under5mi", "Under 5 Miles", "Sonnenberg Gardens & Mansion (~1.9 mi); CMAC Performing Arts Center (~2.5 mi); Naked Dove Brewing (~2 mi)", "confirmed", "google"),
        f("fiveTo25", "5 - 25 Miles", "Heron Hill Winery (~13 mi); Bristol Mountain Ski Resort (~20 mi); Ganondagan State Historic Site (~22 mi)", "confirmed", "google"),
        f("regional", "25+ Miles (Regional)", "Rochester (~26 mi); National Museum of Play (~29 mi); ROC Airport (~32 mi); Watkins Glen State Park (~40 mi)", "confirmed", "google"),
      ]},
    ]
    
    rooms = [
      { name: "Lakefront King - Main Building", pmsCode: "", desc: "King bed; 180 panoramic lake views; spacious private balcony; rainfall shower", conf: "confirmed", src: "website" },
      { name: "Lakefront Double Queen - Main Building", pmsCode: "", desc: "2 Double Queen beds; 180 panoramic lake views; private balcony; rainfall shower", conf: "confirmed", src: "website" },
      { name: "Lakefront Suite - Main Building", pmsCode: "", desc: "King (separate bedroom); panoramic lake view; balcony; parlor with gas fireplace + twin sofa bed; soaking tub, rainfall shower", conf: "confirmed", src: "website" },
      { name: "Cottage King - North Cottage", pmsCode: "", desc: "King bed; partial lake views; private balcony; rainfall shower. DOG-FRIENDLY rooms = 1st floor ONLY, book by phone", conf: "confirmed", src: "website" },
      { name: "Town View King & Double Queen", pmsCode: "", desc: "King or 2 Double Queens; town/garden views (no lake); lower price point", conf: "confirmed", src: "website" },
      { name: "Cottage Suite - North Cottage", pmsCode: "", desc: "King (separate bedroom); parlor + twin sofa bed; lake views. Dog-friendly first floor only", conf: "confirmed", src: "website" },
    ]
  } else {
    // Default empty sections for non-Lake House
    secs = defaultSections()
    // Set property name
    secs[0].fields![0].value = pName
    secs[0].fields![0].confidence = "confirmed"
    secs[0].fields![0].source = "website"
    sources.website.count++
    
    rooms = [{ name: "", pmsCode: "", desc: "", conf: "missing", src: null }]
  }

  const allFields = secs.flatMap((s) => [...(s.fields || []), ...(s.meta || [])])
  const stats = {
    confirmed: allFields.filter((f) => f.confidence === "confirmed").length,
    likely: allFields.filter((f) => f.confidence === "likely").length,
    review: allFields.filter((f) => f.confidence === "review").length,
    missing: allFields.filter((f) => f.confidence === "missing").length,
    critical: allFields.filter((f) => f.confidence === "missing" && f.critical),
    generatedCount: secs.filter((s) => s.generated).length,
  }
  
  const now = new Date()
  return { 
    id: `kb_${Date.now()}`,
    pName, 
    pType, 
    sections: secs, 
    rooms,
    sources, 
    stats,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Confidence Badge Component ───
function ConfidenceBadge({ level, small = false }: { level: ConfidenceLevel; small?: boolean }) {
  const config = CONF_CONFIG[level]
  if (!config) return null

  const variantClasses = {
    confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    likely: "bg-amber-100 text-amber-700 border-amber-200",
    review: "bg-orange-100 text-orange-700 border-orange-200",
    missing: "bg-red-100 text-red-700 border-red-200",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold rounded border",
        variantClasses[level],
        small ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"
      )}
    >
      {level === "confirmed" && <Check className="w-2.5 h-2.5" />}
      {config.label}
    </span>
  )
}

// ─── Auto-fill Card ───
function AutoFillCard({ onScrapeComplete, hasData }: { onScrapeComplete: (query: string) => void; hasData: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [url, setUrl] = useState("")
  const [scanning, setScanning] = useState(false)
  const [step, setStep] = useState(0)

  const startScrape = () => {
    if (!url.trim()) return
    setScanning(true)
    setStep(1)
    
    let total = 0
    SCAN_STEPS.forEach((s, i) => {
      total += s.dur
      setTimeout(() => setStep(i + 2), total)
    })
    setTimeout(() => {
      onScrapeComplete(url)
      setScanning(false)
      setExpanded(false)
      setUrl("")
      setStep(0)
    }, total + 400)
  }

  if (scanning) {
    return (
      <Card className="mb-5 border-primary">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="text-sm font-semibold text-foreground">Analyzing {url}</div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {SCAN_STEPS.map((s, i) => {
              const active = step === i + 1
              const complete = step > i + 1
              return (
                <div key={i} className={cn("flex flex-col items-center gap-1.5 transition-opacity", step >= i + 1 ? "opacity-100" : "opacity-30")}>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold",
                    complete ? "bg-primary border-primary text-primary-foreground" : active ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground"
                  )}>
                    {complete ? <Check className="w-2.5 h-2.5" /> : i + 1}
                  </div>
                  <div className={cn("text-[10px] text-center leading-tight", complete ? "text-primary" : active ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {s.label}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("mb-5 transition-colors", expanded && "border-primary")}>
      <CardContent className={cn("p-4", expanded && "pb-5")}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {hasData ? "Re-scan from website" : "Auto-fill from website"}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasData ? "Scan again to refresh data from public sources" : "Paste a hotel URL or name and AI will populate this knowledge base"}
            </div>
          </div>
          {!expanded && (
            <Button size="sm" onClick={() => setExpanded(true)} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {hasData ? "Re-scan" : "Auto-fill"}
            </Button>
          )}
        </div>
        {expanded && (
          <div className="mt-4 flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. The Lake House on Canandaigua or lakehousecanandaigua.com"
                onKeyDown={(e) => e.key === "Enter" && startScrape()}
                autoFocus
              />
            </div>
            <Button onClick={startScrape} disabled={!url.trim()}>Analyze</Button>
            <Button variant="outline" onClick={() => { setExpanded(false); setUrl(""); }}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


// ─── Knowledge Base Tab ───
function KnowledgeBaseTab({ 
  data, 
  setData, 
  onScrapeComplete 
}: { 
  data: PropertyData; 
  setData: React.Dispatch<React.SetStateAction<PropertyData>>; 
  onScrapeComplete: (query: string) => void 
}) {
  const [sections, setSections] = useState<Section[]>(data.sections)
  const [activeSec, setActiveSec] = useState(data.sections[0]?.id || "overview")
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [addingSec, setAddingSec] = useState(false)
  const [newSecTitle, setNewSecTitle] = useState("")
  const initializedRef = useRef(false)

  // Initialize sections from data only once
  useEffect(() => {
    if (!initializedRef.current) {
      setSections(data.sections)
      initializedRef.current = true
    }
  }, [data.sections])

  // Sync sections back to data when sections change (but not on initial load)
  useEffect(() => {
    if (initializedRef.current) {
      setData(prev => {
        // Only update if sections actually changed
        if (JSON.stringify(prev.sections) !== JSON.stringify(sections)) {
          return { ...prev, sections }
        }
        return prev
      })
    }
  }, [sections, setData])

  const sec = sections.find((s) => s.id === activeSec)
  const hasData = !!data.pName

  const startEdit = (key: string, value: string) => {
    setEditingField(key)
    setEditValue(value)
  }

  const saveFieldEdit = (fieldKey: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec
          ? {
              ...s,
              fields: s.fields?.map((f) =>
                f.key === fieldKey
                  ? { ...f, value: editValue, confidence: editValue ? "confirmed" : "missing", edited: true, source: "manual" }
                  : f
              ),
            }
          : s
      )
    )
    setEditingField(null)
  }

  const updateCatalogItems = (items: CatalogItem[]) => {
    setSections((prev) =>
      prev.map((s) => (s.id === activeSec ? { ...s, items } : s))
    )
  }

  const updateCatalogMeta = (key: string, val: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec
          ? { ...s, meta: s.meta?.map((m) => (m.key === key ? { ...m, value: val, confidence: val ? "confirmed" : "missing", edited: true, source: "manual" } : m)) }
          : s
      )
    )
  }

  const addSection = () => {
    if (!newSecTitle.trim()) return
    const id = `c_${Date.now()}`
    setSections((prev) => [
      ...prev,
      {
        id,
        title: newSecTitle.trim(),
        custom: true,
        fields: [{ key: `${id}_1`, label: "Field 1", value: "", confidence: "missing", source: null, critical: false, edited: false, custom: true }],
      },
    ])
    setActiveSec(id)
    setNewSecTitle("")
    setAddingSec(false)
  }

  const addField = () => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec
          ? { ...s, fields: [...(s.fields || []), { key: `${activeSec}_${Date.now()}`, label: "New Field", value: "", confidence: "missing", source: null, critical: false, edited: false, custom: true }] }
          : s
      )
    )
  }

  const updateFieldLabel = (fieldKey: string, newLabel: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec
          ? { ...s, fields: s.fields?.map((f) => (f.key === fieldKey ? { ...f, label: newLabel } : f)) }
          : s
      )
    )
  }

  const deleteField = (fieldKey: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec
          ? { ...s, fields: s.fields?.filter((f) => f.key !== fieldKey) }
          : s
      )
    )
  }

  // Pool section helpers
  const [expandedPools, setExpandedPools] = useState<Record<string, boolean>>({})
  
  const updatePool = (poolId: string, updates: Partial<PoolCard>) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec && s.type === "pool"
          ? { ...s, pools: s.pools?.map((p) => (p.id === poolId ? { ...p, ...updates } : p)) }
          : s
      )
    )
  }

  const addPool = () => {
    const newPool: PoolCard = {
      id: `pool_${Date.now()}`,
      name: "",
      poolType: "",
      heated: false,
      hours: "",
      hotTub: false,
      poolsideService: false,
      poolBar: false,
      cabanas: false,
      cabanaSurcharge: "",
      otherInfo: "",
    }
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec && s.type === "pool"
          ? { ...s, pools: [...(s.pools || []), newPool] }
          : s
      )
    )
    setExpandedPools((prev) => ({ ...prev, [newPool.id]: true }))
  }

  const removePool = (poolId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec && s.type === "pool"
          ? { ...s, pools: s.pools?.filter((p) => p.id !== poolId) }
          : s
      )
    )
  }

  const togglePoolExpanded = (poolId: string) => {
    setExpandedPools((prev) => ({ ...prev, [poolId]: !prev[poolId] }))
  }

  // Venue section helpers
  const [expandedVenues, setExpandedVenues] = useState<Record<string, boolean>>({})

  const updateVenue = (venueId: string, updates: Partial<VenueCard>) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec && s.type === "venue"
          ? { ...s, venues: s.venues?.map((v) => (v.id === venueId ? { ...v, ...updates } : v)) }
          : s
      )
    )
  }

  const addVenue = () => {
    const newVenue: VenueCard = {
      id: `venue_${Date.now()}`,
      name: "",
      capacity: "",
      description: "",
    }
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec && s.type === "venue"
          ? { ...s, venues: [...(s.venues || []), newVenue] }
          : s
      )
    )
    setExpandedVenues((prev) => ({ ...prev, [newVenue.id]: true }))
  }

  const removeVenue = (venueId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSec && s.type === "venue"
          ? { ...s, venues: s.venues?.filter((v) => v.id !== venueId) }
          : s
      )
    )
  }

  const toggleVenueExpanded = (venueId: string) => {
    setExpandedVenues((prev) => ({ ...prev, [venueId]: !prev[venueId] }))
  }

  const renderSecIcon = (s: Section) => {
    if (s.custom) return <Plus className="w-4 h-4" />
    return SECTION_ICONS[s.id] || <Building2 className="w-4 h-4" />
  }

  // Compute stats
  const allFields = sections.flatMap((s) => [...(s.fields || []), ...(s.meta || [])])
  const critMissing = allFields.filter((f) => f.confidence === "missing" && f.critical)

  return (
    <div className="flex h-full">
      {/* Section nav */}
      <div className="w-56 p-6 pr-0 shrink-0 overflow-y-auto flex flex-col">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Sections</div>
        <div className="flex-1">
          {sections.map((s) => {
            let miss = (s.fields || []).filter((f) => f.confidence === "missing").length
            if (s.meta) miss += s.meta.filter((m) => m.confidence === "missing").length
            return (
              <button
                key={s.id}
                onClick={() => setActiveSec(s.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors mb-0.5",
                  activeSec === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className={activeSec === s.id ? "text-primary" : "text-muted-foreground/70"}>
                  {renderSecIcon(s)}
                </span>
                <span className="flex-1 truncate">{s.title}</span>
                {miss > 0 && (
                  <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">{miss}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Add Section */}
        {addingSec ? (
          <div className="mt-3 pt-3 border-t border-border">
            <Input
              className="mb-2 text-sm"
              value={newSecTitle}
              onChange={(e) => setNewSecTitle(e.target.value)}
              placeholder="Section name"
              onKeyDown={(e) => e.key === "Enter" && addSection()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={addSection}>Add</Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingSec(false); setNewSecTitle(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingSec(true)}
            className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-sm text-primary hover:text-primary/80"
          >
            <Plus className="w-4 h-4" /> Add Section
          </button>
        )}

        {/* Critical Missing */}
        {critMissing.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-2">
              Critical Missing ({critMissing.length})
            </div>
            {critMissing.slice(0, 5).map((f) => (
              <div key={f.key} className="text-xs text-muted-foreground py-1">{f.label}</div>
            ))}
            {critMissing.length > 5 && (
              <div className="text-xs text-muted-foreground">+{critMissing.length - 5} more</div>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <AutoFillCard onScrapeComplete={onScrapeComplete} hasData={hasData} />

        {sec && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="text-primary">{renderSecIcon(sec)}</span>
                <CardTitle className="text-lg">{sec.title}</CardTitle>
                {sec.custom && <Badge variant="secondary" className="text-[10px]">Custom</Badge>}
                {sec.type === "catalog" && <Badge variant="secondary" className="text-[10px]">Catalog</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {sec.type === "catalog" ? (
                /* Catalog Section */
                <div>
                  {/* Meta fields */}
                  {sec.meta && sec.meta.length > 0 && (
                    <div className="mb-5 pb-4 border-b border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Ordering Details</div>
                      {sec.meta.map((field) => {
                        const editing = editingField === `meta_${field.key}`
                        return (
                          <div key={field.key} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                            <div className="w-40 shrink-0 pt-0.5">
                              <div className="text-sm font-medium text-muted-foreground">{field.label}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              {editing ? (
                                <div className="flex gap-2">
                                  <Input
                                    className="flex-1"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { updateCatalogMeta(field.key, editValue); setEditingField(null) }
                                      if (e.key === "Escape") setEditingField(null)
                                    }}
                                  />
                                  <Button size="sm" onClick={() => { updateCatalogMeta(field.key, editValue); setEditingField(null) }}>Save</Button>
                                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setEditingField(null)}>
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 cursor-pointer min-h-[28px]" onClick={() => startEdit(`meta_${field.key}`, field.value)}>
                                  {field.value ? (
                                    <span className="text-sm text-foreground">{field.value}</span>
                                  ) : (
                                    <span className="text-sm text-muted-foreground/60 italic">Click to add...</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                              <ConfidenceBadge level={field.confidence} />
                              {field.source && field.source !== "manual" && SOURCE_ICONS[field.source] && (
                                <span title={SOURCE_LABELS[field.source]} className="text-muted-foreground">
                                  {SOURCE_ICONS[field.source]}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Catalog Items */}
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                    {sec.itemLabel || "Items"} ({sec.items?.length || 0})
                  </div>
                  {(sec.items || []).map((item, i) => (
                    <div key={item.id} className="bg-muted/50 border border-border rounded-lg p-4 mb-2.5">
                      <div className="flex gap-2.5 items-end flex-wrap">
                        {(sec.schema || []).map((col) => (
                          <div key={col.key} style={{ flex: col.flex }} className="min-w-0">
                            <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1 min-h-[24px] flex items-end">
                              {col.label}
                            </label>
                            <Input
                              value={item[col.key] || ""}
                              onChange={(e) => {
                                const next = [...(sec.items || [])]
                                next[i] = { ...next[i], [col.key]: e.target.value }
                                updateCatalogItems(next)
                              }}
                              placeholder={col.label}
                              className="text-sm"
                            />
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5 pb-1.5">
                          {item.conf && item.name && <ConfidenceBadge level={item.conf as ConfidenceLevel} small />}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => {
                            updateCatalogItems((sec.items || []).filter((_, idx) => idx !== i))
                          }}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full border-dashed text-primary" onClick={() => {
                    const newItem: CatalogItem = { id: `item_${Date.now()}`, conf: "missing", src: null }
                    sec.schema?.forEach((col) => { newItem[col.key] = "" })
                    updateCatalogItems([...(sec.items || []), newItem])
                  }}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add {sec.itemLabel || "Item"}
                  </Button>
                </div>
              ) : sec.type === "pool" ? (
                /* Pool Section */
                <div className="space-y-4">
                  {/* Pool Cards */}
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                    Pools ({sec.pools?.length || 0})
                  </div>
                  {(sec.pools || []).map((pool) => {
                    const isExpanded = expandedPools[pool.id] !== false // Default expanded
                    return (
                      <div key={pool.id} className="border border-border rounded-lg overflow-hidden">
                        {/* Pool Header */}
                        <div 
                          className="flex items-center justify-between px-4 py-3 bg-muted/50 cursor-pointer"
                          onClick={() => togglePoolExpanded(pool.id)}
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                            <span className="font-medium text-sm">{pool.name || "Untitled Pool"}</span>
                            {pool.poolType && (
                              <Badge variant="secondary" className="text-[10px] capitalize">{pool.poolType}</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-500"
                            onClick={(e) => { e.stopPropagation(); removePool(pool.id) }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        {/* Pool Fields */}
                        {isExpanded && (
                          <div className="p-4 space-y-3">
                            {/* Name */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Name / Nickname</label>
                              <Input
                                value={pool.name}
                                onChange={(e) => updatePool(pool.id, { name: e.target.value })}
                                placeholder="e.g. Main Pool, Rooftop Pool"
                                className="flex-1"
                              />
                            </div>
                            {/* Type Dropdown */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Type</label>
                              <select
                                value={pool.hotTub && pool.poolType === "lap" ? "" : pool.poolType}
                                onChange={(e) => updatePool(pool.id, { poolType: e.target.value as PoolCard["poolType"] })}
                                className="flex-1 h-9 px-3 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                              >
                                <option value="">Select type...</option>
                                <option value="outdoor">Outdoor</option>
                                <option value="indoor">Indoor</option>
                                <option value="rooftop">Rooftop</option>
                                {!pool.hotTub && <option value="lap">Lap Pool</option>}
                              </select>
                            </div>
                            {/* Heated Toggle */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Heated</label>
                              <button
                                onClick={() => updatePool(pool.id, { heated: !pool.heated })}
                                className={cn(
                                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                  pool.heated ? "bg-primary" : "bg-muted border border-input"
                                )}
                              >
                                <span className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                  pool.heated ? "translate-x-6" : "translate-x-1"
                                )} />
                              </button>
                            </div>
                            {/* Hours */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Hours & Seasonality</label>
                              <Input
                                value={pool.hours}
                                onChange={(e) => updatePool(pool.id, { hours: e.target.value })}
                                placeholder="e.g. 6am-10pm, Seasonal (May-Sept)"
                                className="flex-1"
                              />
                            </div>
                            {/* Hot Tub Toggle */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Hot Tub / Jacuzzi</label>
                              <button
                                onClick={() => {
                                  const newHotTub = !pool.hotTub
                                  updatePool(pool.id, { 
                                    hotTub: newHotTub,
                                    ...(newHotTub && { heated: true })
                                  })
                                }}
                                className={cn(
                                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                  pool.hotTub ? "bg-primary" : "bg-muted border border-input"
                                )}
                              >
                                <span className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                  pool.hotTub ? "translate-x-6" : "translate-x-1"
                                )} />
                              </button>
                            </div>
                            {/* Poolside Service Toggle */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Poolside Service</label>
                              <button
                                onClick={() => updatePool(pool.id, { poolsideService: !pool.poolsideService })}
                                className={cn(
                                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                  pool.poolsideService ? "bg-primary" : "bg-muted border border-input"
                                )}
                              >
                                <span className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                  pool.poolsideService ? "translate-x-6" : "translate-x-1"
                                )} />
                              </button>
                            </div>
                            {/* Pool Bar Toggle */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Pool Bar</label>
                              <button
                                onClick={() => updatePool(pool.id, { poolBar: !pool.poolBar })}
                                className={cn(
                                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                  pool.poolBar ? "bg-primary" : "bg-muted border border-input"
                                )}
                              >
                                <span className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                  pool.poolBar ? "translate-x-6" : "translate-x-1"
                                )} />
                              </button>
                            </div>
                            {/* Cabanas Toggle + Surcharge */}
                            <div className="flex items-start gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground pt-1">Cabanas</label>
                              <div className="flex-1 space-y-2">
                                <button
                                  onClick={() => updatePool(pool.id, { cabanas: !pool.cabanas })}
                                  className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                    pool.cabanas ? "bg-primary" : "bg-muted border border-input"
                                  )}
                                >
                                  <span className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                    pool.cabanas ? "translate-x-6" : "translate-x-1"
                                  )} />
                                </button>
                                {pool.cabanas && (
                                  <Input
                                    value={pool.cabanaSurcharge}
                                    onChange={(e) => updatePool(pool.id, { cabanaSurcharge: e.target.value })}
                                    placeholder="Surcharge details (optional)"
                                    className="text-sm"
                                  />
                                )}
                              </div>
                            </div>
                            {/* Other Info */}
                            <div className="flex items-start gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground pt-2">Other Pool Info</label>
                              <textarea
                                value={pool.otherInfo}
                                onChange={(e) => updatePool(pool.id, { otherInfo: e.target.value })}
                                placeholder="Any additional pool details..."
                                className="flex-1 min-h-[60px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <Button variant="outline" className="w-full border-dashed text-primary" onClick={addPool}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add Pool
                  </Button>

                  {/* Outdoor Spaces Card */}
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                      Outdoor Spaces
                    </div>
                    {(sec.fields || []).map((field) => {
                      const editing = editingField === field.key
                      const editingLabel = editingField === `label_${field.key}`
                      return (
                        <div key={field.key} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                          <div className="w-44 shrink-0 pt-0.5">
                            {field.custom && editingLabel ? (
                              <Input
                                className="text-sm h-7 px-2"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => {
                                  if (editValue.trim()) updateFieldLabel(field.key, editValue.trim())
                                  setEditingField(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    if (editValue.trim()) updateFieldLabel(field.key, editValue.trim())
                                    setEditingField(null)
                                  }
                                  if (e.key === "Escape") setEditingField(null)
                                }}
                                autoFocus
                              />
                            ) : (
                              <div 
                                className={cn("text-sm font-medium text-muted-foreground", field.custom && "cursor-pointer hover:text-foreground")}
                                onClick={() => field.custom && startEdit(`label_${field.key}`, field.label)}
                              >
                                {field.label}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {editing ? (
                              <div className="flex gap-2">
                                <textarea
                                  className="flex-1 min-h-[36px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.metaKey) saveFieldEdit(field.key)
                                    if (e.key === "Escape") setEditingField(null)
                                  }}
                                />
                                <div className="flex flex-col gap-1">
                                  <Button size="sm" onClick={() => saveFieldEdit(field.key)}>Save</Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingField(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2 cursor-pointer min-h-[28px]" onClick={() => startEdit(field.key, field.value)}>
                                {field.value ? (
                                  <span className="text-sm text-foreground leading-relaxed break-words">{field.value}</span>
                                ) : (
                                  <span className="text-sm text-muted-foreground/60 italic">Click to add...</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                            {field.value && <ConfidenceBadge level={field.confidence} />}
                            {field.source && field.source !== "manual" && SOURCE_ICONS[field.source] && (
                              <span title={SOURCE_LABELS[field.source]} className="text-muted-foreground">
                                {SOURCE_ICONS[field.source]}
                              </span>
                            )}
                            {field.custom && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-muted-foreground hover:text-red-500" 
                                onClick={() => deleteField(field.key)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <Button variant="outline" className="w-full mt-3 border-dashed text-primary" onClick={addField}>
                      <Plus className="w-4 h-4 mr-1.5" /> Add Field
                    </Button>
                  </div>
                </div>
              ) : sec.type === "venue" ? (
                /* Venue Section */
                <div className="space-y-4">
                  {/* Venue Cards */}
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                    Venues ({sec.venues?.length || 0})
                  </div>
                  {(sec.venues || []).map((venue) => {
                    const isExpanded = expandedVenues[venue.id] !== false // Default expanded
                    return (
                      <div key={venue.id} className="border border-border rounded-lg overflow-hidden">
                        {/* Venue Header */}
                        <div 
                          className="flex items-center justify-between px-4 py-3 bg-muted/50 cursor-pointer"
                          onClick={() => toggleVenueExpanded(venue.id)}
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                            <span className="font-medium text-sm">{venue.name || "Untitled Venue"}</span>
                            {venue.capacity && (
                              <Badge variant="secondary" className="text-[10px]">{venue.capacity}</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-500"
                            onClick={(e) => { e.stopPropagation(); removeVenue(venue.id) }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        {/* Venue Fields */}
                        {isExpanded && (
                          <div className="p-4 space-y-3">
                            {/* Name */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Venue Name</label>
                              <Input
                                value={venue.name}
                                onChange={(e) => updateVenue(venue.id, { name: e.target.value })}
                                placeholder="e.g. Event Barn, Lakeside Terrace"
                                className="flex-1"
                              />
                            </div>
                            {/* Capacity */}
                            <div className="flex items-center gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground">Capacity</label>
                              <Input
                                value={venue.capacity}
                                onChange={(e) => updateVenue(venue.id, { capacity: e.target.value })}
                                placeholder="e.g. Up to 200 guests"
                                className="flex-1"
                              />
                            </div>
                            {/* Description */}
                            <div className="flex items-start gap-3">
                              <label className="w-44 shrink-0 text-sm font-medium text-muted-foreground pt-2">Description</label>
                              <textarea
                                value={venue.description}
                                onChange={(e) => updateVenue(venue.id, { description: e.target.value })}
                                placeholder="Describe the venue, its features, and best uses..."
                                className="flex-1 min-h-[80px] px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add Venue Button */}
                  <Button variant="outline" className="w-full border-dashed text-primary" onClick={addVenue}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add Venue
                  </Button>

                  {/* Event Details */}
                  {(sec.fields && sec.fields.length > 0) && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                        Event Details
                      </div>
                      {(sec.fields || []).map((field) => {
                        const editing = editingField === field.key
                        const editingLabel = editingField === `label_${field.key}`
                        return (
                          <div key={field.key} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                            <div className="w-44 shrink-0 pt-0.5">
                              {field.custom && editingLabel ? (
                                <Input
                                  className="text-sm h-7 px-2"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => {
                                    if (editValue.trim()) updateFieldLabel(field.key, editValue.trim())
                                    setEditingField(null)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      if (editValue.trim()) updateFieldLabel(field.key, editValue.trim())
                                      setEditingField(null)
                                    }
                                    if (e.key === "Escape") setEditingField(null)
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <div 
                                  className={cn("text-sm font-medium text-muted-foreground", field.custom && "cursor-pointer hover:text-foreground")}
                                  onClick={() => field.custom && startEdit(`label_${field.key}`, field.label)}
                                >
                                  {field.label}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              {editing ? (
                                <div className="flex gap-2">
                                  <textarea
                                    className="flex-1 min-h-[36px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && e.metaKey) saveFieldEdit(field.key)
                                      if (e.key === "Escape") setEditingField(null)
                                    }}
                                  />
                                  <div className="flex flex-col gap-1">
                                    <Button size="sm" onClick={() => saveFieldEdit(field.key)}>Save</Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingField(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-2 cursor-pointer min-h-[28px]" onClick={() => startEdit(field.key, field.value)}>
                                  {field.value ? (
                                    <span className="text-sm text-foreground leading-relaxed break-words">{field.value}</span>
                                  ) : (
                                    <span className="text-sm text-muted-foreground/60 italic">Click to add...</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                              {field.value && <ConfidenceBadge level={field.confidence} />}
                              {field.source && field.source !== "manual" && SOURCE_ICONS[field.source] && (
                                <span title={SOURCE_LABELS[field.source]} className="text-muted-foreground">
                                  {SOURCE_ICONS[field.source]}
                                </span>
                              )}
                              {field.custom && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-muted-foreground hover:text-red-500" 
                                  onClick={() => deleteField(field.key)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <Button variant="outline" className="w-full mt-3 border-dashed text-primary" onClick={addField}>
                        <Plus className="w-4 h-4 mr-1.5" /> Add Field
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard Fields */
                <div>
                  {(sec.fields || []).map((field) => {
                    const editing = editingField === field.key
                    const editingLabel = editingField === `label_${field.key}`
                    return (
                      <div key={field.key} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                        <div className="w-44 shrink-0 pt-0.5">
                          {field.custom && editingLabel ? (
                            <Input
                              className="text-sm h-7 px-2"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                if (editValue.trim()) updateFieldLabel(field.key, editValue.trim())
                                setEditingField(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editValue.trim()) updateFieldLabel(field.key, editValue.trim())
                                  setEditingField(null)
                                }
                                if (e.key === "Escape") setEditingField(null)
                              }}
                              autoFocus
                            />
                          ) : (
                            <div 
                              className={cn("text-sm font-medium text-muted-foreground", field.custom && "cursor-pointer hover:text-foreground")}
                              onClick={() => field.custom && startEdit(`label_${field.key}`, field.label)}
                            >
                              {field.label}
                              {field.custom && <Pencil className="w-3 h-3 inline ml-1.5 opacity-0 group-hover:opacity-100" />}
                            </div>
                          )}
                          {field.critical && <span className="text-[10px] text-red-600">Required</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          {editing ? (
                            <div className="flex gap-2">
                              <textarea
                                className="flex-1 min-h-[36px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.metaKey) saveFieldEdit(field.key)
                                  if (e.key === "Escape") setEditingField(null)
                                }}
                              />
                              <div className="flex flex-col gap-1">
                                <Button size="sm" onClick={() => saveFieldEdit(field.key)}>Save</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingField(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 cursor-pointer min-h-[28px]" onClick={() => startEdit(field.key, field.value)}>
                              {field.value ? (
                                <span className="text-sm text-foreground leading-relaxed break-words flex items-center gap-1.5">
                                  {field.value}
                                  {looksLikeUrl(field.value) && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground/60 italic">Click to add...</span>
                              )}
                              {field.edited && <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">Edited</span>}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                          {field.value && <ConfidenceBadge level={field.confidence} />}
                          {field.source && field.source !== "manual" && SOURCE_ICONS[field.source] && (
                            <span title={SOURCE_LABELS[field.source]} className="text-muted-foreground">
                              {SOURCE_ICONS[field.source]}
                            </span>
                          )}
                          {field.custom && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-muted-foreground hover:text-red-500" 
                              onClick={() => deleteField(field.key)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <Button variant="outline" className="w-full mt-3 border-dashed text-primary" onClick={addField}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add Field
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Room Mapping Tab ───
// Room type names & ids are READ-ONLY — sourced from the PMS (StayNTouch
// catalog cache) so operators can't typo the mapping. Only the description
// is editable; it becomes the source of truth the voice agent quotes.

type RoomTypeRow = {
  room_type_id: string
  room_name: string
  cached_description: string | null
  operator_description: string | null
  image_url: string | null
  max_occupancy: number
}

type RoomTypeListResponse = {
  hotel_id: string
  pms_provider: string
  supported: boolean
  message: string | null
  rooms: RoomTypeRow[]
}

function RoomMappingTab({ hotelId }: { hotelId: string }) {
  const [response, setResponse] = useState<RoomTypeListResponse | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({})
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await api<RoomTypeListResponse>(
        `/api/v1/admin/hotels/${hotelId}/room-types`,
      )
      setResponse(data)
      // Seed the draft state from the server so the textareas start with the
      // current value and "dirty" detection is straightforward.
      const seeded: Record<string, string> = {}
      for (const r of data.rooms) {
        seeded[r.room_type_id] = r.operator_description ?? ""
      }
      setDrafts(seeded)
    } catch (e) {
      setLoadError(
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e),
      )
    }
  }, [hotelId])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }))

  const saveOne = async (room: RoomTypeRow) => {
    const id = room.room_type_id
    setSaving((prev) => ({ ...prev, [id]: "saving" }))
    try {
      const next = await api<RoomTypeRow>(
        `/api/v1/admin/hotels/${hotelId}/room-types/${encodeURIComponent(id)}`,
        { method: "PUT", body: { description: drafts[id] ?? "" } },
      )
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              rooms: prev.rooms.map((r) => (r.room_type_id === id ? next : r)),
            }
          : prev,
      )
      setSaving((prev) => ({ ...prev, [id]: "saved" }))
      setTimeout(
        () =>
          setSaving((prev) => {
            if (prev[id] !== "saved") return prev
            const next = { ...prev }
            delete next[id]
            return next
          }),
        2500,
      )
    } catch (e) {
      console.error("save failed", e)
      setSaving((prev) => ({ ...prev, [id]: "error" }))
    }
  }

  const refreshFromPms = async () => {
    setRefreshing(true)
    try {
      await api(`/api/v1/admin/hotels/${hotelId}/room-types/refresh`, {
        method: "POST",
      })
      await load()
    } catch (e) {
      console.error("refresh failed", e)
    } finally {
      setRefreshing(false)
    }
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load room types: {loadError}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    )
  }

  if (!response.supported) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {response.message ?? "Room mapping is not available for this hotel."}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bed className="w-5 h-5 text-primary" />
              Room Types
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Room names and IDs come from the PMS. Edit the description — the voice agent
              will use it as the source of truth.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshFromPms}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh from PMS"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {response.rooms.length === 0 && (
            <div className="py-6 text-sm text-muted-foreground text-center">
              No room types cached yet. Click &ldquo;Refresh from PMS&rdquo; to pull them in.
            </div>
          )}
          {response.rooms.map((r) => {
            const id = r.room_type_id
            const isExpanded = expanded[id] ?? true
            const draft = drafts[id] ?? ""
            const dirty = draft !== (r.operator_description ?? "")
            const status = saving[id]
            return (
              <div key={id} className="border border-border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 bg-muted/50 cursor-pointer"
                  onClick={() => toggle(id)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="font-medium text-sm">{r.room_name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      PMS ID {id}
                    </Badge>
                    {!r.operator_description && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-orange-300 text-orange-600"
                      >
                        Using PMS description
                      </Badge>
                    )}
                    {status === "saved" && (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    )}
                    {status === "error" && (
                      <span className="text-[10px] text-destructive">Save failed</span>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="p-4 space-y-3">
                    {r.cached_description && (
                      <div className="text-xs text-muted-foreground italic">
                        PMS description: {r.cached_description}
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                        Description (source of truth)
                      </label>
                      <textarea
                        value={draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                        placeholder="Bed config, sq ft, amenities, views — what the voice agent should tell callers."
                        className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!dirty || status === "saving"}
                        onClick={() => saveOne(r)}
                      >
                        {status === "saving" ? "Saving…" : "Save description"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Agent Config Tab ───
// VAPI's transferCall destination requires strict E.164. The input is split
// into three fields (country code, area code, 7-digit number) — optimized
// for NANP, which is what this hotel agent serves — and recombined into an
// E.164 string on save. Country code 1 + 10 national digits = 11 digits
// total, which matches the E.164 minimum we enforce backend-side too.
const E164_RE = /^\+[1-9]\d{9,14}$/

type PhoneParts = { countryCode: string; areaCode: string; number: string }

const EMPTY_PARTS: PhoneParts = { countryCode: "1", areaCode: "", number: "" }

// Try to split an existing E.164 value back into three fields. Only supports
// NANP-shaped numbers (+1 + 3-digit area + 7-digit subscriber) since that's
// what the three-field UI represents. Everything else is surfaced as a
// "legacy invalid" value so the admin can re-enter it cleanly.
function parsePhoneParts(e164: string | null | undefined): PhoneParts | null {
  if (!e164 || !e164.startsWith("+")) return null
  const digits = e164.slice(1).replace(/\D/g, "")
  if (digits.startsWith("1") && digits.length === 11) {
    return { countryCode: "1", areaCode: digits.slice(1, 4), number: digits.slice(4) }
  }
  return null
}

function buildE164FromParts(parts: PhoneParts): string | null {
  const cc = parts.countryCode.replace(/\D/g, "")
  const area = parts.areaCode.replace(/\D/g, "")
  const num = parts.number.replace(/\D/g, "")
  if (!cc || !area || !num) return null
  const combined = `+${cc}${area}${num}`
  return E164_RE.test(combined) ? combined : null
}

function describeInvalidParts(parts: PhoneParts): string | null {
  const cc = parts.countryCode.replace(/\D/g, "")
  const area = parts.areaCode.replace(/\D/g, "")
  const num = parts.number.replace(/\D/g, "")
  if (!cc) return "Enter a country code"
  if (cc.startsWith("0")) return "Country code can't start with 0"
  if (!area) return "Enter an area code"
  if (area.length !== 3) return `Area code must be 3 digits (got ${area.length})`
  if (!num) return "Enter a phone number"
  if (num.length !== 7) return `Phone number must be 7 digits (got ${num.length})`
  return null
}

type HotelDetail = {
  hotel_id: string
  display_name: string
  timezone: string
  pms_provider: string
  agent_name: string | null
  first_message: string | null
  transfer_phone_number: string
  email_from: string | null
  preferred_rate_code: string | null
  max_call_minutes: number | null
  transfer_rules: string | null
  is_active: boolean
}

function AgentConfigTab({
  hotelId,
  registerSave,
  onStateChange,
  onErrorChange,
}: {
  hotelId: string
  registerSave: (fn: (() => Promise<void>) | null) => void
  onStateChange: React.Dispatch<
    React.SetStateAction<"idle" | "saving" | "saved" | "error">
  >
  onErrorChange: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [phoneParts, setPhoneParts] = useState<PhoneParts>(EMPTY_PARTS)
  // Holds a previously-saved value the three-field input can't parse (e.g.
  // a non-NANP number, or a legacy-bad one like "+9162674487"). Shown as a
  // warning so the admin knows what's currently live and can replace it.
  const [legacyPhone, setLegacyPhone] = useState<string | null>(null)
  const [maxCallMin, setMaxCallMin] = useState("6")
  const [transferRules, setTransferRules] = useState("")
  const [preferredRateCode, setPreferredRateCode] = useState("")
  const [agentName, setAgentName] = useState("")
  const [firstMessage, setFirstMessage] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    ;(async () => {
      try {
        const hotel = await api<HotelDetail>(`/api/v1/admin/hotels/${hotelId}`)
        if (cancelled) return
        const parsed = parsePhoneParts(hotel.transfer_phone_number)
        if (parsed) {
          setPhoneParts(parsed)
          setLegacyPhone(null)
        } else {
          setPhoneParts(EMPTY_PARTS)
          setLegacyPhone(hotel.transfer_phone_number || null)
        }
        setAgentName(hotel.agent_name ?? "")
        setFirstMessage(hotel.first_message ?? "")
        setMaxCallMin(String(hotel.max_call_minutes ?? "6"))
        setTransferRules(hotel.transfer_rules ?? "")
        setPreferredRateCode(String(hotel.preferred_rate_code ?? ""))
      } catch (e) {
        if (cancelled) return
        setLoadError(
          e instanceof ApiError
            ? `${e.status} ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hotelId])

  const handleSave = async () => {
    const normalizedPhone = buildE164FromParts(phoneParts)
    if (normalizedPhone === null) {
      const reason = describeInvalidParts(phoneParts) ?? "invalid phone number"
      onErrorChange(`Transfer phone: ${reason}.`)
      onStateChange("error")
      return
    }
    onStateChange("saving")
    onErrorChange(null)
    try {
      await api(`/api/v1/admin/hotels/${hotelId}`, {
        method: "PUT",
        body: {
          agent_name: agentName || null,
          first_message: firstMessage || null,
          transfer_phone_number: normalizedPhone,
          preferred_rate_code: preferredRateCode || null,
          max_call_minutes: maxCallMin ? Number(maxCallMin) : null,
          transfer_rules: transferRules || null,
        },
      })
      onStateChange("saved")
      setTimeout(() => onStateChange((s) => (s === "saved" ? "idle" : s)), 3000)
    } catch (e) {
      onErrorChange(
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e),
      )
      onStateChange("error")
    }
  }

  // Keep a ref to the latest handleSave so the function we register with the
  // parent is stable — no re-registration on every keystroke — while still
  // capturing the current form-state closure when invoked.
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    registerSave(() => handleSaveRef.current())
    return () => registerSave(null)
  }, [registerSave])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {loadError && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            Failed to load hotel settings: {loadError}
          </CardContent>
        </Card>
      )}
      {/* Transfer & Escalation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            Transfer & Escalation
          </CardTitle>
          <p className="text-sm text-muted-foreground">When the agent hands off to a human</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Transfer Phone
            </label>
            {(() => {
              const preview = buildE164FromParts(phoneParts)
              const invalidReason = preview ? null : describeInvalidParts(phoneParts)
              const anyInput =
                phoneParts.areaCode.length > 0 || phoneParts.number.length > 0
              return (
                <>
                  <div className="flex gap-2 items-end">
                    <div className="w-20">
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Country
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">+</span>
                        <Input
                          inputMode="numeric"
                          maxLength={3}
                          value={phoneParts.countryCode}
                          onChange={(e) =>
                            setPhoneParts((p) => ({
                              ...p,
                              countryCode: e.target.value.replace(/\D/g, "").slice(0, 3),
                            }))
                          }
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Area Code
                      </div>
                      <Input
                        inputMode="numeric"
                        maxLength={3}
                        value={phoneParts.areaCode}
                        onChange={(e) =>
                          setPhoneParts((p) => ({
                            ...p,
                            areaCode: e.target.value.replace(/\D/g, "").slice(0, 3),
                          }))
                        }
                        placeholder="555"
                      />
                    </div>
                    <div className="flex-1 max-w-[180px]">
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Phone Number
                      </div>
                      <Input
                        inputMode="numeric"
                        maxLength={8}  /* 7 digits + optional dash */
                        value={phoneParts.number}
                        onChange={(e) =>
                          setPhoneParts((p) => ({
                            ...p,
                            number: e.target.value.replace(/\D/g, "").slice(0, 7),
                          }))
                        }
                        placeholder="5551234"
                      />
                    </div>
                  </div>
                  {legacyPhone && (
                    <p className="mt-2 text-xs text-destructive">
                      Current saved value{" "}
                      <span className="font-mono">{legacyPhone}</span> is not a
                      standard NANP number. Re-enter above and save to replace it.
                    </p>
                  )}
                  {preview && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Will be saved as <span className="font-mono">{preview}</span>
                    </p>
                  )}
                  {!preview && anyInput && invalidReason && (
                    <p className="mt-2 text-xs text-destructive">{invalidReason}.</p>
                  )}
                </>
              )
            })()}
          </div>
          <div className="w-32">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Max Call Duration (min)
            </label>
            <Input type="number" value={maxCallMin} onChange={(e) => setMaxCallMin(e.target.value)} placeholder="6" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Transfer Rules
            </label>
            <textarea
              className="w-full min-h-[80px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              value={transferRules}
              onChange={(e) => setTransferRules(e.target.value)}
              placeholder={"Group bookings 5+ rooms → sales\nBilling disputes → front desk\nGuest complaints → GM\nCaller asks for a person → always transfer"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferred Rate Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="w-4 h-4 text-primary" />
            Preferred Rate Code
          </CardTitle>
          <p className="text-sm text-muted-foreground">The rate code the AI agent should use when selling this property</p>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Rate Code
            </label>
            <Input
              value={preferredRateCode}
              onChange={(e) => setPreferredRateCode(e.target.value)}
              placeholder="e.g. BAR, RACK, PROMO2024"
            />
          </div>
        </CardContent>
      </Card>

      {/* Agent Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            Agent Details
          </CardTitle>
          <p className="text-sm text-muted-foreground">Customize your AI agent&apos;s identity and greeting</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Agent Name
            </label>
            <Input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Sarah, Alex, Concierge"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              First Message
            </label>
            <textarea
              className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="e.g. Hi, thank you for calling The Lakehouse. My name is Sarah, how can I help you today?"
            />
          </div>
        </CardContent>
      </Card>

    </div>
  )
}

// ─── URL helper ───
function looksLikeUrl(v: string): boolean {
  if (!v) return false
  const s = String(v).trim()
  return /^(https?:\/\/|www\.)\S+$/i.test(s) || /^[\w-]+\.[\w-]+\.[a-z]+(\/\S*)?$/i.test(s)
}

// ─── Empty Knowledge Base ───
function emptyKnowledgeBase(): PropertyData {
  const now = new Date()
  return {
    id: `kb_${Date.now()}`,
    pName: "",
    pType: "",
    sections: defaultSections(),
    rooms: [{ name: "", desc: "", conf: "missing", src: null, pmsCode: "" }],
    sources: { website: { count: 0 }, google: { count: 0 }, tripadvisor: { count: 0 }, ota: { count: 0 } },
    stats: { confirmed: 0, likely: 0, review: 0, missing: 0, critical: [], generatedCount: 0 },
    createdAt: now,
    updatedAt: now,
  }
}

export default function KnowledgeBasePage() {
  const { hotelId, hotels, loading: hotelLoading } = useHotel()
  const [data, setData] = useState<PropertyData>(emptyKnowledgeBase)
  const [activeTab, setActiveTab] = useState<"kb" | "rooms" | "config">("kb")
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  // Agent Config tab owns its own form state but delegates save-state and the
  // save trigger to the parent, so the page-level top Save button can drive it.
  const [configSaveState, setConfigSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [configSaveError, setConfigSaveError] = useState<string | null>(null)
  const configSaveRef = useRef<(() => Promise<void>) | null>(null)
  const registerConfigSave = useCallback(
    (fn: (() => Promise<void>) | null) => {
      configSaveRef.current = fn
    },
    [],
  )

  const hotel = hotels.find((h) => h.hotel_id === hotelId)

  // Load knowledge from backend whenever the selected hotel changes. The
  // fallback `defaultSections()` stays available when a hotel has never been
  // saved via the UI, so operators start with the full section template.
  useEffect(() => {
    if (!hotelId) return
    let cancelled = false
    setLoadState("loading")
    setLoadError(null)
    ;(async () => {
      try {
        const entries = await api<KnowledgeEntry[]>(
          `/api/v1/admin/hotels/${hotelId}/knowledge`,
        )
        if (cancelled) return
        // The serializer uses structurally-identical but nominally-distinct
        // Section types; cast rather than duplicate the definitions.
        const hydrated = entriesToSections(
          entries,
          defaultSections() as unknown as Parameters<typeof entriesToSections>[1],
        ) as unknown as Section[]
        setData((prev) => ({
          ...prev,
          id: `kb_${hotelId}`,
          pName: hotel?.display_name ?? prev.pName,
          sections: hydrated,
          updatedAt: new Date(),
        }))
        setLoadState("ready")
      } catch (e) {
        if (cancelled) return
        setLoadError(
          e instanceof ApiError
            ? `${e.status} ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
        )
        setLoadState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hotelId, hotel?.display_name])

  const handleScrapeComplete = (query: string) => {
    setData(generateMockData(query))
  }

  const handleSave = async () => {
    if (!hotelId) return
    setSaveState("saving")
    setSaveError(null)
    try {
      const entries = sectionsToEntries(data.sections)
      await api(`/api/v1/admin/hotels/${hotelId}/knowledge`, {
        method: "PUT",
        body: { entries },
      })
      setSaveState("saved")
      // Ephemeral success flash — clear after a few seconds so repeated
      // saves can show the indicator again.
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 3000)
    } catch (e) {
      setSaveError(
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e),
      )
      setSaveState("error")
    }
  }

  const tabs = [
    { id: "kb" as const, label: "Knowledge Base", icon: <Building2 className="w-4 h-4" /> },
    { id: "rooms" as const, label: "Room Mapping", icon: <Bed className="w-4 h-4" /> },
    { id: "config" as const, label: "Agent Configuration", icon: <Mic className="w-4 h-4" /> },
  ]

  if (hotelLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Loading hotels…
        </div>
      </div>
    )
  }

  if (!hotelId) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No hotel selected. Pick one from the sidebar.
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b border-border px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              {hotel?.display_name ?? data.pName ?? "Knowledge Base"}
            </h1>
            {data.pType && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                {data.pType}
              </Badge>
            )}
            {loadState === "loading" && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
            {loadState === "error" && (
              <span className="text-xs text-destructive" title={loadError ?? ""}>
                Load failed
              </span>
            )}
          </div>
          {activeTab !== "rooms" && (() => {
            const topSaveState = activeTab === "config" ? configSaveState : saveState
            const topSaveError = activeTab === "config" ? configSaveError : saveError
            const topSaveDisabled =
              topSaveState === "saving" ||
              (activeTab === "kb" && loadState !== "ready")
            const onTopSave = () => {
              if (activeTab === "config") return configSaveRef.current?.()
              return handleSave()
            }
            return (
              <div className="flex items-center gap-3">
                {topSaveState === "saved" && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                {topSaveState === "error" && (
                  <span className="text-xs text-destructive" title={topSaveError ?? ""}>
                    Save failed
                  </span>
                )}
                <Button onClick={onTopSave} disabled={topSaveDisabled}>
                  <Save className="w-4 h-4 mr-2" />
                  {topSaveState === "saving" ? "Saving…" : "Save"}
                </Button>
              </div>
            )
          })()}
        </div>

        {/* Tabs */}
        <div className="bg-card border-b border-border px-8 flex gap-0 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={activeTab === t.id ? "text-primary" : "text-muted-foreground"}>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto bg-muted/30">
          {activeTab === "kb" && (
            <KnowledgeBaseTab data={data} setData={setData} onScrapeComplete={handleScrapeComplete} />
          )}
          {activeTab === "rooms" && <RoomMappingTab hotelId={hotelId} />}
          {activeTab === "config" && (
            <AgentConfigTab
              hotelId={hotelId}
              registerSave={registerConfigSave}
              onStateChange={setConfigSaveState}
              onErrorChange={setConfigSaveError}
            />
          )}
        </div>
      </div>
    </div>
  )
}
