// LLM-powered Knowledge Base research. Calls the FastAPI research endpoint;
// the operator's URL/property-name input goes in, a structured PropertyData-
// shaped payload comes back. Owns the per-field "preserve manual edits"
// merge so a re-scan never clobbers operator-edited values, and a dev-mode
// mock so UI work can ship before/without the backend route landing.
//
// Section/Field shapes are duplicated here (rather than imported from
// app/knowledge-base/page.tsx) for the same reason lib/knowledge-serialize.ts
// duplicates them: lib/ shouldn't depend on app/. They're structurally
// identical to the UI types.

import { api } from "./api"

type ConfidenceLevel = "confirmed" | "likely" | "review" | "missing"

export type ResearchField = {
  key: string
  label: string
  value: string
  confidence: ConfidenceLevel
  source: string | null
  critical: boolean
  edited: boolean
  custom?: boolean
}

export type ResearchCatalogItem = {
  id: string
  conf: string
  src: string | null
  [k: string]: unknown
}

export type ResearchPoolCard = {
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

export type ResearchVenueCard = {
  id: string
  name: string
  capacity: string
  description: string
}

export type ResearchCatalogSchema = {
  key: string
  label: string
  flex?: string
  type?: string
}

export type ResearchSection = {
  id: string
  title: string
  fields?: ResearchField[]
  generated?: boolean
  alwaysMissing?: boolean
  custom?: boolean
  type?: "catalog" | "pool" | "venue"
  itemLabel?: string
  schema?: ResearchCatalogSchema[]
  items?: ResearchCatalogItem[]
  meta?: ResearchField[]
  pools?: ResearchPoolCard[]
  venues?: ResearchVenueCard[]
}

export type ResearchRoom = {
  name: string
  desc: string
  conf: ConfidenceLevel
  src: string | null
  pmsCode: string
}

export type ResearchResponse = {
  schema_version: number
  p_name: string
  p_type: string
  sections: ResearchSection[]
  rooms: ResearchRoom[]
  sources: Record<string, { count: number }>
  research_metadata?: {
    model?: string
    tokens_in?: number
    tokens_out?: number
    duration_ms?: number
    tool_calls?: number
    warnings?: string[]
  }
}

const USE_MOCK = process.env.NEXT_PUBLIC_RESEARCH_USE_MOCK === "true"

export async function researchProperty(
  hotelId: string,
  query: string,
  sectionTemplate?: ResearchSection[],
  signal?: AbortSignal,
): Promise<ResearchResponse> {
  if (USE_MOCK) {
    // Match the rough latency of a real research run so the step animation
    // is exercised during UI development. Honor abort so Cancel feels real.
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 3000)
      signal?.addEventListener("abort", () => {
        clearTimeout(t)
        reject(new DOMException("Aborted", "AbortError"))
      })
    })
    return mockResearch(query)
  }
  // Send the operator's current sections (including any custom-added ones)
  // so the LLM knows which section IDs and field keys to populate. Without
  // it, the backend falls back to a generic prompt and the response IDs
  // won't match the UI's existing sections, breaking the manual-edit
  // preserve merge.
  return api<ResearchResponse>(
    `/api/v1/admin/hotels/${hotelId}/knowledge/research`,
    {
      method: "POST",
      body: {
        query,
        schema_version: 1,
        section_template: sectionTemplate,
      },
      signal,
    },
  )
}

/**
 * Splice a fresh research result into place, but keep operator-edited
 * field values. A field with `edited: true` on `existing` overrides the
 * matching field (by section.id + field.key) in `fresh`, with confidence
 * forced to "confirmed" so the badge reflects operator intent.
 *
 * Catalog items[], pool pools[], and venue venues[] are NOT merged —
 * those collections are replaced wholesale. Per-field merge would need
 * stable per-row IDs which the operator can't reliably edit today.
 */
export function preserveEdits(
  fresh: ResearchSection[],
  existing: ResearchSection[],
): ResearchSection[] {
  const edits = new Map<string, ResearchField>()
  for (const sec of existing) {
    for (const list of [sec.fields, sec.meta]) {
      if (!list) continue
      for (const f of list) {
        if (f.edited) edits.set(`${sec.id}/${f.key}`, f)
      }
    }
  }
  if (edits.size === 0) return fresh

  const applyTo = (
    sectionId: string,
    list: ResearchField[] | undefined,
  ): ResearchField[] | undefined => {
    if (!list) return list
    return list.map((f) => {
      const e = edits.get(`${sectionId}/${f.key}`)
      if (!e) return f
      return {
        ...f,
        value: e.value,
        confidence: "confirmed",
        edited: true,
        source: e.source ?? f.source,
      }
    })
  }

  return fresh.map((sec) => ({
    ...sec,
    fields: applyTo(sec.id, sec.fields),
    meta: applyTo(sec.id, sec.meta),
  }))
}

// ───────────────── dev mock ─────────────────
//
// Used when NEXT_PUBLIC_RESEARCH_USE_MOCK=true. Mirrors what the FastAPI
// endpoint will eventually return so UI changes can ship and be reviewed
// independent of backend availability. Matches on "lake"/"waterfront"/
// "canandaigua" to return a populated Lake House fixture; everything else
// returns a sparse default with just the property name guessed from the
// query.

function mockResearch(query: string): ResearchResponse {
  const q = query.toLowerCase()
  const isLake =
    q.includes("lake") || q.includes("waterfront") || q.includes("canandaigua")

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
    critical = false,
  ): ResearchField => {
    if (src && sources[src]) sources[src].count++
    return { key, label, value, confidence: conf, source: src, critical, edited: false }
  }

  let sections: ResearchSection[]
  let rooms: ResearchRoom[]

  if (isLake) {
    sections = [
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
        ],
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
        ],
      },
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
    // Sparse default — just the property name guessed from the query.
    sections = [
      { id: "overview", title: "Property Overview", fields: [
        f("name", "Property Name", pName, "confirmed", "website", true),
      ]},
    ]
    rooms = [{ name: "", pmsCode: "", desc: "", conf: "missing", src: null }]
  }

  return {
    schema_version: 1,
    p_name: pName,
    p_type: pType,
    sections,
    rooms,
    sources,
    research_metadata: {
      model: "mock",
      duration_ms: 3000,
    },
  }
}
