"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
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
  ChevronRight,
  Plus,
  X,
  Globe,
  Bookmark,
  Tag,
  Pencil,
  Trash2,
  Save,
  Dumbbell,
  Compass,
  Users,
  ExternalLink,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"
import { HotelLoadError, NoHotelAccess } from "@/components/hotel-access-state"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"
import {
  entriesToSections,
  sectionsToEntries,
  type KnowledgeEntry,
} from "@/lib/knowledge-serialize"
import {
  preserveEdits,
  researchProperty,
  type ResearchSection,
} from "@/lib/research"

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
  [key: string]: string | null
  conf: string
  src: string | null
}

interface CatalogSchema {
  key: string
  label: string
  flex: string
  type?: "boolean"
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

// Roll up confidence/source counts from sections so the header chips and
// "critical missing" warning stay in sync with the current data.
function computeStats(sections: Section[]): PropertyData["stats"] {
  const allFields = sections.flatMap((s) => [
    ...(s.fields || []),
    ...(s.meta || []),
  ])
  return {
    confirmed: allFields.filter((f) => f.confidence === "confirmed").length,
    likely: allFields.filter((f) => f.confidence === "likely").length,
    review: allFields.filter((f) => f.confidence === "review").length,
    missing: allFields.filter((f) => f.confidence === "missing").length,
    critical: allFields.filter(
      (f) => f.confidence === "missing" && f.critical,
    ),
    generatedCount: sections.filter((s) => s.generated).length,
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
//
// Drives the 7-step animation from the real research request lifecycle.
// Steps 1→6 advance on a timer cascade; step 7 ("Generating knowledge
// base") is held until `onScrapeComplete` resolves so the UI never claims
// success ahead of the network. On rejection we drop into an error state
// and preserve the typed URL so the operator can retry.
// Cycling status messages shown while step 7 is held (LLM still working).
// Plausible-but-vague — true descriptions of what the model does over the
// full research run, even if the precise step at any given second isn't
// knowable without streaming progress from Anthropic.
const HOLD_MESSAGES = [
  "Compiling property overview…",
  "Cataloging dining venues…",
  "Verifying contact information…",
  "Mapping nearby attractions…",
  "Reading pet & accessibility policies…",
  "Identifying room types…",
  "Cross-referencing sources…",
  "Building structured knowledge base…",
  "Finalizing fields…",
]

function AutoFillCard({
  onScrapeComplete,
  hasData,
}: {
  onScrapeComplete: (query: string, signal?: AbortSignal) => Promise<void>
  hasData: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [url, setUrl] = useState("")
  const [scanning, setScanning] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [holdIdx, setHoldIdx] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  // Tick a 1-second elapsed counter while scanning so the operator sees
  // forward motion even when no other UI element is changing.
  useEffect(() => {
    if (!scanning) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [scanning])

  // Once the cascade hits the held step (Generating knowledge base), cycle
  // through plausible status messages every 4s so the user sees ongoing
  // activity instead of a frozen header.
  useEffect(() => {
    if (!scanning || step <= SCAN_STEPS.length - 1) return
    setHoldIdx(0)
    const id = setInterval(
      () => setHoldIdx((i) => (i + 1) % HOLD_MESSAGES.length),
      4000,
    )
    return () => clearInterval(id)
  }, [scanning, step])

  const runScrape = async () => {
    const query = url.trim()
    if (!query) return
    setScanning(true)
    setStep(1)
    setError(null)

    // Advance through steps 2..7 over the cascade. Hold at 7 (Generating
    // knowledge base) until the response resolves; jump ahead if the
    // response beats the animation.
    const timers: ReturnType<typeof setTimeout>[] = []
    let total = 0
    for (let i = 0; i < SCAN_STEPS.length - 1; i++) {
      total += SCAN_STEPS[i].dur
      const next = i + 2
      timers.push(setTimeout(() => setStep(next), total))
    }
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t)
      timers.length = 0
    }

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await onScrapeComplete(query, controller.signal)
      clearTimers()
      // step > SCAN_STEPS.length renders all checkmarks complete.
      setStep(SCAN_STEPS.length + 1)
      await new Promise((r) => setTimeout(r, 400))
      setScanning(false)
      setExpanded(false)
      setUrl("")
      setStep(0)
    } catch (e) {
      clearTimers()
      // Operator-initiated cancel: silently reset, don't toast or surface
      // an error card. They know what they did.
      if (e instanceof DOMException && e.name === "AbortError") {
        setScanning(false)
        setStep(0)
        return
      }
      setScanning(false)
      setStep(0)
      const msg = formatScrapeError(e)
      setError(msg)
      toast.error(`Research failed: ${msg}`)
    } finally {
      abortRef.current = null
    }
  }

  const onAnalyze = () => {
    if (!url.trim()) return
    if (hasData) {
      setConfirming(true)
      return
    }
    void runScrape()
  }

  const onCancelScan = () => {
    abortRef.current?.abort()
  }

  // The held-step subtitle shows cycling messages; intermediate steps show
  // the current step label so the operator always sees what's happening.
  const heldStep = step > SCAN_STEPS.length - 1
  const subtitle = heldStep
    ? HOLD_MESSAGES[holdIdx]
    : SCAN_STEPS[Math.max(0, step - 1)]?.label ?? ""

  const scanningOverlay = (
    <Dialog
      open={scanning}
      onOpenChange={(open) => {
        // Block close-by-overlay/escape — only the explicit Cancel button
        // should abort an in-flight research run.
        if (!open) return
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </span>
            <span className="truncate min-w-0" title={url}>
              Researching {shortenQuery(url)}
            </span>
          </DialogTitle>
          <DialogDescription
            key={subtitle}
            className="flex items-center gap-2 pt-1 text-sm animate-in fade-in duration-300"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
            <span className="truncate">{subtitle}</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
              {elapsed}s
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-7 gap-1.5 mt-2">
          {SCAN_STEPS.map((s, i) => {
            const active = step === i + 1
            const complete = step > i + 1
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-opacity",
                  step >= i + 1 ? "opacity-100" : "opacity-30",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-colors",
                    complete
                      ? "bg-primary border-primary text-primary-foreground"
                      : active
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {complete ? (
                    <Check className="w-3 h-3" />
                  ) : active ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div
                  className={cn(
                    "text-[10px] text-center leading-tight",
                    complete
                      ? "text-primary"
                      : active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </div>
              </div>
            )
          })}
        </div>

        <div className="text-xs text-muted-foreground mt-2">
          This usually takes 30–90 seconds. The page is locked while the
          research runs to avoid losing your work.
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onCancelScan}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  if (error) {
    return (
      <Card className="mb-5 border-destructive">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Research failed</div>
              <div className="text-xs text-muted-foreground mt-1 break-words">{error}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => { setError(null); void runScrape() }}>Retry</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setError(null); setUrl(""); setExpanded(false) }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
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
                  onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
                  maxLength={2000}
                  autoFocus
                />
              </div>
              <Button onClick={onAnalyze} disabled={!url.trim()}>Analyze</Button>
              <Button variant="outline" onClick={() => { setExpanded(false); setUrl(""); }}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-scan from website?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces researched fields with fresh data. Any field you've manually edited will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirming(false); void runScrape() }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scanningOverlay}
    </>
  )
}

// Compress URLs to host+path so the scanning header doesn't blow out the
// card width when the operator pastes a long tracking-param URL. Plain
// names pass through unchanged.
function shortenQuery(q: string): string {
  const trimmed = q.trim()
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
    const path = u.pathname === "/" ? "" : u.pathname
    return u.hostname + path
  } catch {
    return trimmed
  }
}

function formatScrapeError(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { detail?: unknown } | undefined
    const detail = body?.detail
    if (typeof detail === "string") return detail
    // FastAPI 422 returns `detail` as an array of {type, loc, msg, ...}
    // Pydantic error objects. Surface the human-readable msg + loc so the
    // operator can see what failed without React crashing on raw objects.
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => {
          if (!d || typeof d !== "object") return null
          const obj = d as { msg?: unknown; loc?: unknown }
          const msg = typeof obj.msg === "string" ? obj.msg : null
          const loc = Array.isArray(obj.loc) ? obj.loc.join(".") : null
          if (msg && loc) return `${loc}: ${msg}`
          return msg
        })
        .filter((s): s is string => Boolean(s))
      if (msgs.length > 0) return msgs.join("; ")
    }
    if (detail !== undefined) {
      try {
        return JSON.stringify(detail)
      } catch {
        // fall through
      }
    }
    return `${e.status} ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}


// ─── Knowledge Base Tab ───
function KnowledgeBaseTab({ 
  data, 
  setData, 
  onScrapeComplete 
}: { 
  data: PropertyData;
  setData: React.Dispatch<React.SetStateAction<PropertyData>>;
  onScrapeComplete: (query: string, signal?: AbortSignal) => Promise<void>
}) {
  const [sections, setSections] = useState<Section[]>(data.sections)
  const [activeSec, setActiveSec] = useState(data.sections[0]?.id || "overview")
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  // When Escape is used to bail out of an edit, blur fires next as the
  // textarea unmounts. This ref tells the blur handler to skip the auto-commit
  // for that one event so Escape acts as "discard typed value".
  const skipBlurRef = useRef(false)
  const [addingSec, setAddingSec] = useState(false)
  const [newSecTitle, setNewSecTitle] = useState("")

  // Two-way sync between local `sections` state and parent `data.sections`.
  // Identity comparison on both sides keeps the round-trip from looping:
  // when one side writes through the other, both refs match and the
  // opposite effect no-ops on the next render.
  //
  // The previous "initialize once" pattern silently dropped parent updates
  // after mount — research (or any other parent-driven setData) populated
  // `data.sections` but the child's stale local copy kept rendering empty
  // fields. The mirror-image hazard: a subsequent local edit would then
  // push the stale snapshot back up, overwriting the research result.
  useEffect(() => {
    if (sections !== data.sections) {
      setSections(data.sections)
    }
    // We intentionally only react to data.sections changing; the inner
    // identity guard handles re-entry from our own up-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sections])

  useEffect(() => {
    if (sections !== data.sections) {
      setData((prev) =>
        prev.sections === sections ? prev : { ...prev, sections },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

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
                  activeSec === s.id ? "bg-primary/10 text-primary font-medium hover:bg-primary/15" : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
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
        {activeSec === "overview" && (
          <AutoFillCard onScrapeComplete={onScrapeComplete} hasData={hasData} />
        )}

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
                                <Input
                                  className="flex-1"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                  onBlur={() => {
                                    if (skipBlurRef.current) {
                                      skipBlurRef.current = false
                                      return
                                    }
                                    updateCatalogMeta(field.key, editValue)
                                    setEditingField(null)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      updateCatalogMeta(field.key, editValue)
                                      setEditingField(null)
                                    }
                                    if (e.key === "Escape") {
                                      skipBlurRef.current = true
                                      setEditingField(null)
                                    }
                                  }}
                                />
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
                              <textarea
                                className="flex-1 w-full min-h-[36px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                onBlur={() => {
                                  if (skipBlurRef.current) {
                                    skipBlurRef.current = false
                                    return
                                  }
                                  saveFieldEdit(field.key)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.metaKey) saveFieldEdit(field.key)
                                  if (e.key === "Escape") {
                                    skipBlurRef.current = true
                                    setEditingField(null)
                                  }
                                }}
                              />
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
                                <textarea
                                  className="flex-1 w-full min-h-[36px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                  onBlur={() => {
                                    if (skipBlurRef.current) {
                                      skipBlurRef.current = false
                                      return
                                    }
                                    saveFieldEdit(field.key)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.metaKey) saveFieldEdit(field.key)
                                    if (e.key === "Escape") {
                                      skipBlurRef.current = true
                                      setEditingField(null)
                                    }
                                  }}
                                />
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
                            <textarea
                              className="flex-1 w-full min-h-[36px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              onBlur={() => {
                                if (skipBlurRef.current) {
                                  skipBlurRef.current = false
                                  return
                                }
                                saveFieldEdit(field.key)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && e.metaKey) saveFieldEdit(field.key)
                                if (e.key === "Escape") {
                                  skipBlurRef.current = true
                                  setEditingField(null)
                                }
                              }}
                            />
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
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        <span className="font-medium">PMS description:</span>{" "}
                        {r.cached_description}
                      </p>
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

// Backend shape for transfer-department rows. Returned both inline on
// `HotelDetail.transfer_departments` (the read path the editor uses) and
// from the dedicated `GET /transfer-departments` endpoint (kept available
// for future use; the editor only relies on the inline shape).
type TransferDepartmentRow = {
  department_id: string
  name: string
  phone_number: string
  routing_rules: string
  position: number
  is_default: boolean
}

type HotelDetail = {
  hotel_id: string
  display_name: string
  timezone: string
  pms_provider: string
  agent_name: string | null
  first_message: string | null
  email_from: string | null
  preferred_rate_code: string | null
  max_call_minutes: number | null
  is_active: boolean
  transfer_departments: TransferDepartmentRow[]
}

// Local edit-time shape. Carries the 3-field phone breakdown alongside the
// raw E.164 value so legacy non-NANP numbers can still be displayed and
// re-entered. `id` is a stable client-side key — generated fresh on every
// hydration so focus state survives reloads predictably.
type Department = {
  id: string
  name: string
  phoneParts: PhoneParts
  legacyPhone: string | null
  situations: string
  isDefault: boolean
}

function newClientId(): string {
  return `dept_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function blankDepartment(): Department {
  return {
    id: newClientId(),
    name: "",
    phoneParts: { ...EMPTY_PARTS },
    legacyPhone: null,
    situations: "",
    isDefault: false,
  }
}

function rowToDepartment(row: TransferDepartmentRow): Department {
  const parsed = parsePhoneParts(row.phone_number)
  return {
    id: newClientId(),
    name: row.name,
    phoneParts: parsed ?? { ...EMPTY_PARTS },
    legacyPhone: parsed ? null : row.phone_number || null,
    situations: row.routing_rules,
    isDefault: row.is_default,
  }
}

// Strip the unstable `id` so the snapshot used for dirty-detection isn't
// invalidated by random key generation.
function snapshotDepartment(d: Department) {
  return {
    name: d.name,
    phoneParts: d.phoneParts,
    legacyPhone: d.legacyPhone,
    situations: d.situations,
    isDefault: d.isDefault,
  }
}

function DepartmentCard({
  dept,
  onChange,
  onDelete,
  canDelete,
  onSetDefault,
}: {
  dept: Department
  onChange: (updates: Partial<Department>) => void
  onDelete: () => void
  canDelete: boolean
  // Toggling the catch-all on this row clears it on every other row.
  // Lifted to the parent so mutual-exclusivity stays consistent.
  onSetDefault: (next: boolean) => void
}) {
  const preview = buildE164FromParts(dept.phoneParts)
  const invalidReason = preview ? null : describeInvalidParts(dept.phoneParts)
  const anyInput =
    dept.phoneParts.areaCode.length > 0 || dept.phoneParts.number.length > 0

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
          aria-hidden
        />
        <Input
          value={dept.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Front desk, Sales, Billing"
          className="max-w-xs"
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="ml-auto p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
          title={canDelete ? "Remove department" : "At least one department is required"}
          aria-label="Remove department"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
          Transfer Phone
        </label>
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
                value={dept.phoneParts.countryCode}
                onChange={(e) =>
                  onChange({
                    phoneParts: {
                      ...dept.phoneParts,
                      countryCode: e.target.value.replace(/\D/g, "").slice(0, 3),
                    },
                  })
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
              value={dept.phoneParts.areaCode}
              onChange={(e) =>
                onChange({
                  phoneParts: {
                    ...dept.phoneParts,
                    areaCode: e.target.value.replace(/\D/g, "").slice(0, 3),
                  },
                })
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
              maxLength={8}
              value={dept.phoneParts.number}
              onChange={(e) =>
                onChange({
                  phoneParts: {
                    ...dept.phoneParts,
                    number: e.target.value.replace(/\D/g, "").slice(0, 7),
                  },
                })
              }
              placeholder="5551234"
            />
          </div>
        </div>
        {dept.legacyPhone && (
          <p className="mt-2 text-xs text-destructive">
            Current saved value{" "}
            <span className="font-mono">{dept.legacyPhone}</span> is not a
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
      </div>

      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
          When should calls transfer here?
        </label>
        <textarea
          className="w-full min-h-[120px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          value={dept.situations}
          onChange={(e) => onChange({ situations: e.target.value })}
          placeholder={
            "Guest has not received their confirmation email\nGuest was charged incorrectly\nGuest wants to cancel or modify an existing reservation\nGuest is asking about a current or past stay"
          }
        />
        <p className="mt-2 text-xs text-muted-foreground">
          List the situations that should route to this department. One per line — write them the way a guest would actually say it.
        </p>
      </div>

      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={dept.isDefault}
          onChange={(e) => onSetDefault(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
        />
        <span className="text-sm">
          <span className="font-medium">Catch-all department</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            If the caller wants a transfer but no other department&apos;s situations match, the agent routes here. Only one department can be the catch-all.
          </span>
        </span>
      </label>
    </div>
  )
}


function AgentConfigTab({
  hotelId,
  registerSave,
  onStateChange,
  onErrorChange,
  onDirtyChange,
}: {
  hotelId: string
  registerSave: (fn: (() => Promise<void>) | null) => void
  onStateChange: React.Dispatch<
    React.SetStateAction<"idle" | "saving" | "saved" | "error">
  >
  onErrorChange: React.Dispatch<React.SetStateAction<string | null>>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [maxCallMin, setMaxCallMin] = useState("6")
  const [preferredRateCode, setPreferredRateCode] = useState("")
  const [agentName, setAgentName] = useState("")
  const [firstMessage, setFirstMessage] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  // Saved-baseline JSON snapshot of the form. Null while loading or before
  // first successful load. Compared against the live snapshot to derive dirty.
  const [savedJson, setSavedJson] = useState<string | null>(null)

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        departments: departments.map(snapshotDepartment),
        agentName,
        firstMessage,
        maxCallMin,
        preferredRateCode,
      }),
    [
      departments,
      agentName,
      firstMessage,
      maxCallMin,
      preferredRateCode,
    ],
  )
  const dirty = savedJson !== null && formSnapshot !== savedJson

  // Single source of truth for "apply server-side hotel state to the form."
  // Used by initial load and by the partial-save recovery path below — both
  // need identical state-and-snapshot semantics so `dirty` lines up with what
  // actually persisted on the server.
  const applyHotelDetail = useCallback((hotel: HotelDetail) => {
    const loadedAgentName = hotel.agent_name ?? ""
    const loadedFirstMessage = hotel.first_message ?? ""
    const loadedMaxCallMin = String(hotel.max_call_minutes ?? "6")
    const loadedPreferredRateCode = String(hotel.preferred_rate_code ?? "")
    const loadedDepartments = (hotel.transfer_departments ?? []).map(rowToDepartment)
    // Defensive: backend invariant is ≥1 department, but if a hotel ever
    // ends up empty (manual DB edit, mid-migration), give the user a blank
    // row to type into. Save validation will block empty saves.
    if (loadedDepartments.length === 0) loadedDepartments.push(blankDepartment())
    setAgentName(loadedAgentName)
    setFirstMessage(loadedFirstMessage)
    setMaxCallMin(loadedMaxCallMin)
    setPreferredRateCode(loadedPreferredRateCode)
    setDepartments(loadedDepartments)
    // Baseline must match the shape `formSnapshot` produces so dirty reads
    // false immediately after load.
    setSavedJson(
      JSON.stringify({
        departments: loadedDepartments.map(snapshotDepartment),
        agentName: loadedAgentName,
        firstMessage: loadedFirstMessage,
        maxCallMin: loadedMaxCallMin,
        preferredRateCode: loadedPreferredRateCode,
      }),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setSavedJson(null)
    ;(async () => {
      try {
        // `transfer_departments` is included on `GET /hotels/{id}` so the
        // editor hydrates from a single round-trip.
        const hotel = await api<HotelDetail>(`/api/v1/admin/hotels/${hotelId}`)
        if (cancelled) return
        applyHotelDetail(hotel)
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
  }, [hotelId, applyHotelDetail])

  const updateDepartment = useCallback(
    (id: string, updates: Partial<Department>) => {
      setDepartments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      )
    },
    [],
  )
  const addDepartment = useCallback(() => {
    setDepartments((prev) => [...prev, blankDepartment()])
  }, [])
  const removeDepartment = useCallback((id: string) => {
    setDepartments((prev) => prev.filter((d) => d.id !== id))
  }, [])
  // Mutual-exclusion: turning this row on clears every other row's flag.
  // Backend enforces the same invariant; doing it client-side too means
  // the form state never holds an illegal "two defaults" value the user
  // would have to fix manually.
  const setDepartmentDefault = useCallback((id: string, next: boolean) => {
    setDepartments((prev) =>
      prev.map((d) => ({
        ...d,
        isDefault: d.id === id ? next : next ? false : d.isDefault,
      })),
    )
  }, [])

  // Push dirty state up so the parent can show the indicator next to the
  // top-level Save button.
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // In-app navigation guard (sidebar links, hotel selector). Ref keeps the
  // registered closure stable across dirty toggles.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    return registerUnsavedGuard(() =>
      dirtyRef.current
        ? "You have unsaved Agent Configuration changes. Leave anyway?"
        : null,
    )
  }, [])

  // Refresh/tab-close guard.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const handleSave = async () => {
    if (departments.length === 0) {
      onErrorChange("At least one transfer department is required.")
      onStateChange("error")
      return
    }
    // Per-department validation: name non-empty, phone normalizes to E.164.
    // Surface the first failure with a department label so the operator knows
    // which row is bad. Names also need to be unique (case-insensitive) since
    // the backend rejects duplicates.
    const seenNames = new Set<string>()
    const departmentPayload: {
      name: string
      phone_number: string
      routing_rules: string
      is_default: boolean
    }[] = []
    for (const [idx, d] of departments.entries()) {
      const name = d.name.trim()
      const label = name || `Department ${idx + 1}`
      if (!name) {
        onErrorChange(`${label}: name is required.`)
        onStateChange("error")
        return
      }
      const key = name.toLowerCase()
      if (seenNames.has(key)) {
        onErrorChange(`Duplicate department name: ${name}.`)
        onStateChange("error")
        return
      }
      seenNames.add(key)
      const phone = buildE164FromParts(d.phoneParts)
      if (phone === null) {
        const reason =
          describeInvalidParts(d.phoneParts) ?? "invalid phone number"
        onErrorChange(`${label}: ${reason}.`)
        onStateChange("error")
        return
      }
      const situations = d.situations.trim()
      if (!situations) {
        onErrorChange(
          `${label}: describe at least one situation under "When should calls transfer here?"`,
        )
        onStateChange("error")
        return
      }
      departmentPayload.push({
        name,
        phone_number: phone,
        routing_rules: d.situations,
        is_default: d.isDefault,
      })
    }

    onStateChange("saving")
    onErrorChange(null)

    // Sequential, two-stage save. Hotel-level fields go first because they
    // can't fail server-side validation independently of departments — that
    // way if departments fail, we know exactly which half persisted.
    //
    // On any failure, we re-fetch the canonical hotel state and rehydrate
    // the form. That keeps the dirty indicator honest: stage-1 changes that
    // landed are no longer dirty, stage-2 changes that didn't are still in
    // the user's edits to retry.
    const formatError = (e: unknown) =>
      e instanceof ApiError
        ? `${e.status} ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e)

    let hotelSaved = false
    try {
      await api(`/api/v1/admin/hotels/${hotelId}`, {
        method: "PUT",
        body: {
          agent_name: agentName || null,
          first_message: firstMessage || null,
          preferred_rate_code: preferredRateCode || null,
          max_call_minutes: maxCallMin ? Number(maxCallMin) : null,
        },
      })
      hotelSaved = true

      await api(`/api/v1/admin/hotels/${hotelId}/transfer-departments`, {
        method: "PUT",
        body: { departments: departmentPayload },
      })
      // Snapshot at save time matches the form right now; use it as the new
      // baseline so dirty drops back to false.
      setSavedJson(formSnapshot)
      onStateChange("saved")
      setTimeout(() => onStateChange((s) => (s === "saved" ? "idle" : s)), 3000)
    } catch (e) {
      const detail = formatError(e)
      // Stage 2 failed after stage 1 succeeded → resync the form with what
      // actually landed so the dirty indicator is trustworthy. The fetch is
      // best-effort: if it itself fails, we just leave the form alone and
      // surface a more conservative error.
      if (hotelSaved) {
        try {
          const fresh = await api<HotelDetail>(
            `/api/v1/admin/hotels/${hotelId}`,
          )
          applyHotelDetail(fresh)
        } catch {
          /* fall through to the partial-save error below */
        }
        onErrorChange(
          `Hotel-level settings saved, but transfer departments failed: ${detail}. ` +
            `The form has been refreshed — review the departments and save again.`,
        )
      } else {
        onErrorChange(detail)
      }
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
          <CardTitle className="text-xl font-semibold">Transfer & Escalation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure which departments receive transferred calls and define the situations that trigger each transfer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Departments</h3>
            <span className="text-xs text-muted-foreground">
              {departments.length} {departments.length === 1 ? "department" : "departments"}
            </span>
          </div>
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.id}
              dept={dept}
              onChange={(updates) => updateDepartment(dept.id, updates)}
              onDelete={() => removeDepartment(dept.id)}
              canDelete={departments.length > 1}
              onSetDefault={(next) => setDepartmentDefault(dept.id, next)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addDepartment}
            className="w-full border-dashed"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Department
          </Button>
        </CardContent>
      </Card>

      {/* Call Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="w-4 h-4 text-primary" />
            Call Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-40">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Max Call Duration (min)
            </label>
            <Input type="number" value={maxCallMin} onChange={(e) => setMaxCallMin(e.target.value)} placeholder="6" />
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
  const { hotelId, hotels, loading: hotelLoading, accessState, refresh } =
    useHotel()
  const [data, setData] = useState<PropertyData>(emptyKnowledgeBase)
  const [activeTab, setActiveTab] = useState<"kb" | "rooms" | "config">("kb")
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  // Saved-baseline JSON of the KB. We compare against the current serialization
  // to detect unsaved edits. Null while loading or before first successful load
  // so the dirty indicator doesn't flash during hotel switches.
  const [savedEntriesJson, setSavedEntriesJson] = useState<string | null>(null)
  const currentEntriesJson = useMemo(
    () => JSON.stringify(sectionsToEntries(data.sections)),
    [data.sections],
  )
  const kbDirty =
    savedEntriesJson !== null && currentEntriesJson !== savedEntriesJson

  // Agent Config tab owns its own form state but delegates save-state and the
  // save trigger to the parent, so the page-level top Save button can drive it.
  const [configSaveState, setConfigSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [configSaveError, setConfigSaveError] = useState<string | null>(null)
  const [configDirty, setConfigDirty] = useState(false)
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
    setSavedEntriesJson(null)
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
        setSavedEntriesJson(JSON.stringify(sectionsToEntries(hydrated)))
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

  // Refresh/tab-close guard. Fires the browser's native "Leave site?" prompt
  // when the KB has unsaved edits.
  useEffect(() => {
    if (!kbDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [kbDirty])

  // In-app navigation guard. Sidebar links and the hotel selector check this
  // via lib/unsaved-guard before changing route/hotel. Ref keeps the registered
  // closure stable so we don't re-register on every dirty toggle.
  const kbDirtyRef = useRef(kbDirty)
  useEffect(() => {
    kbDirtyRef.current = kbDirty
  }, [kbDirty])
  useEffect(() => {
    return registerUnsavedGuard(() =>
      kbDirtyRef.current
        ? "You have unsaved Knowledge Base changes. Leave anyway?"
        : null,
    )
  }, [])

  // Run an LLM-powered research call for the given URL/property name and
  // splice the result into `data`. Manual edits on existing fields are
  // preserved across re-scans (see preserveEdits in lib/research.ts).
  // On error, throws back up so AutoFillCard can render its error state.
  const handleScrapeComplete = async (
    query: string,
    signal?: AbortSignal,
  ) => {
    if (!hotelId) {
      throw new Error("No hotel selected")
    }
    const fresh = await researchProperty(
      hotelId,
      query,
      data.sections as unknown as ResearchSection[],
      signal,
    )
    // Surfaced in browser DevTools so future "I clicked Analyze and nothing
    // happened" reports have evidence. Counts are cheap to compute and the
    // full payload is one expand-click away if deeper inspection is needed.
    const filledFields = fresh.sections.reduce(
      (n, s) =>
        n +
        (s.fields ?? []).filter((f) => f.value && f.value.trim() !== "").length,
      0,
    )
    console.info(
      "[research] response received",
      {
        p_name: fresh.p_name,
        p_type: fresh.p_type,
        sections: fresh.sections.length,
        filledFields,
        sources: fresh.sources,
        metadata: fresh.research_metadata,
      },
      fresh,
    )
    setData((prev) => {
      const mergedSections = preserveEdits(
        fresh.sections,
        prev.sections as unknown as ResearchSection[],
      ) as unknown as Section[]
      return {
        ...prev,
        pName: fresh.p_name,
        pType: fresh.p_type,
        sections: mergedSections,
        rooms: fresh.rooms as Room[],
        sources: fresh.sources,
        stats: computeStats(mergedSections),
        updatedAt: new Date(),
      }
    })
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
      setSavedEntriesJson(JSON.stringify(entries))
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
        {accessState === "error" ? (
          <HotelLoadError onRetry={refresh} />
        ) : (
          <NoHotelAccess />
        )}
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
            const tabDirty =
              (activeTab === "kb" && kbDirty) ||
              (activeTab === "config" && configDirty)
            const showDirty =
              tabDirty &&
              topSaveState !== "saving" &&
              topSaveState !== "saved"
            return (
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-3">
                  {showDirty && (
                    <span className="text-xs text-amber-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Unsaved changes
                    </span>
                  )}
                  {topSaveState === "saved" && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                  {topSaveState === "error" && (
                    <span className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Save failed
                    </span>
                  )}
                  <Button onClick={onTopSave} disabled={topSaveDisabled}>
                    <Save className="w-4 h-4 mr-2" />
                    {topSaveState === "saving" ? "Saving…" : "Save"}
                  </Button>
                </div>
                {topSaveState === "error" && topSaveError && (
                  <p className="text-xs text-destructive max-w-md text-right leading-relaxed">
                    {topSaveError}
                  </p>
                )}
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

        {/* Tab Content. Always-mount + display-toggle so each tab keeps its
            own React state across switches (in particular AgentConfigTab,
            whose form fields live in local useState). */}
        <div className="flex-1 overflow-auto bg-muted/30">
          <div className={activeTab === "kb" ? "" : "hidden"}>
            <KnowledgeBaseTab data={data} setData={setData} onScrapeComplete={handleScrapeComplete} />
          </div>
          <div className={activeTab === "rooms" ? "" : "hidden"}>
            <RoomMappingTab hotelId={hotelId} />
          </div>
          <div className={activeTab === "config" ? "" : "hidden"}>
            <AgentConfigTab
              hotelId={hotelId}
              registerSave={registerConfigSave}
              onStateChange={setConfigSaveState}
              onErrorChange={setConfigSaveError}
              onDirtyChange={setConfigDirty}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
