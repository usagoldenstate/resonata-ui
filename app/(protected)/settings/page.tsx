"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, Phone, Users, Mail, Globe, Save, FileText, X, Plus, ChevronDown, ChevronUp, Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"
import { useHotel } from "@/lib/hotel-context"
import { useCurrentUser } from "@/lib/current-user-context"
import {
  ApiError,
  type HotelDetail,
  type HotelOperatorUpdate,
  type HotelPlatformUpdate,
  fetchHotelDetail,
  updateHotelOperatorSettings,
  updateHotelPlatformSettings,
} from "@/lib/api"

// Standard durations offered in the Max Call Duration picker. The backend
// stores any 1–120 minute value (or null = unlimited), so if a hotel's stored
// value falls outside this set we splice it in dynamically (see below).
const STANDARD_DURATIONS = ["15", "30", "45", "60"]

// Marks a field/section that is shown for parity with the design but has no
// backend storage yet, so edits here are not persisted.
function NotSavedHint() {
  return (
    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 align-middle">
      Not saved
    </span>
  )
}

function PlatformOnlyHint() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground align-middle">
      <Lock className="h-2.5 w-2.5" />
      Platform admin
    </span>
  )
}

// The backend stores the sender as a single RFC 5322 string ("Name <addr>" or
// a bare address). The UI splits it into two fields on load and recomposes on
// save so operators never see raw angle-bracket syntax.
function splitEmailFrom(value: string | null | undefined): {
  name: string
  email: string
} {
  const v = (value ?? "").trim()
  if (!v) return { name: "", email: "" }
  const m = v.match(/^(.*?)<([^>]+)>\s*$/)
  if (!m) return { name: "", email: v } // bare address, no display name
  let name = m[1].trim()
  // Unwrap a quoted display name, e.g. "Smith, John" <...>.
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\(["\\])/g, "$1")
  }
  return { name, email: m[2].trim() }
}

function composeEmailFrom(name: string, email: string): string | null {
  const e = email.trim()
  if (!e) return null // no address → clear the sender entirely
  const n = name.trim()
  if (!n) return e
  // RFC 5322 requires quoting display names that contain specials.
  const display = /[(),:;<>@[\]\\"]/.test(n)
    ? `"${n.replace(/(["\\])/g, "\\$1")}"`
    : n
  return `${display} <${e}>`
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    // Surface the backend's `detail` string when present (e.g. invalid
    // inbound number, number already claimed) instead of the generic status.
    const detail =
      error.body && typeof error.body === "object" && "detail" in error.body
        ? (error.body as { detail?: unknown }).detail
        : undefined
    if (typeof detail === "string" && detail.trim()) return detail
    return `${error.status} ${error.message}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export default function SettingsPage() {
  const { hotelId, hotels, accessState } = useHotel()
  const { isPlatformAdmin } = useCurrentUser()

  // ── Backend-backed hotel state ────────────────────────────────────────────
  // `detail` is the last-saved baseline; the form fields below are the editable
  // draft. Saving diffs the draft against `detail` so we only send changed keys.
  const [detail, setDetail] = useState<HotelDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [hotelName, setHotelName] = useState("")
  const [senderName, setSenderName] = useState("")
  const [email, setEmail] = useState("")
  const [inboundNumber, setInboundNumber] = useState("")
  const [timezone, setTimezone] = useState("America/New_York")
  const [maxCallDuration, setMaxCallDuration] = useState("unlimited")
  const currency = detail?.currency ?? ""

  // ── Local-only fields (no backend storage yet) ────────────────────────────
  const [website, setWebsite] = useState("")
  const [language, setLanguage] = useState("en")
  const [businessHoursStart, setBusinessHoursStart] = useState("08:00")
  const [businessHoursEnd, setBusinessHoursEnd] = useState("22:00")
  const [afterHoursMessage, setAfterHoursMessage] = useState(true)
  const [callRecording, setCallRecording] = useState(true)

  const applyDetail = useCallback((d: HotelDetail) => {
    setDetail(d)
    setHotelName(d.display_name)
    const { name, email } = splitEmailFrom(d.email_from)
    setSenderName(name)
    setEmail(email)
    setInboundNumber(d.inbound_phone_number ?? "")
    setTimezone(d.timezone)
    setMaxCallDuration(d.max_call_minutes == null ? "unlimited" : String(d.max_call_minutes))
  }, [])

  useEffect(() => {
    if (!hotelId) {
      setDetail(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    fetchHotelDetail(hotelId, { signal: controller.signal })
      .then((d) => {
        applyDetail(d)
        setLoading(false)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setLoadError(describeError(e))
        setLoading(false)
      })
    return () => controller.abort()
  }, [hotelId, applyDetail])

  // Report subscription settings (local-only — no backend yet)
  const availableReports = [
    { id: "call-volume", name: "Call Volume Report", description: "Daily call volume and trends" },
    { id: "conversion", name: "Conversion Analytics", description: "Booking conversion rates" },
    { id: "not-booked", name: "Not Booked Analysis", description: "Why guests didn't book" },
    { id: "revenue", name: "Revenue Summary", description: "Room and upsell revenue" },
  ]

  // Each subscriber has individual daily/weekly preferences per report
  const [reportSubscriptions, setReportSubscriptions] = useState<Record<string, {
    email: string;
    daily: boolean;
    weekly: boolean;
  }[]>>({
    "call-volume": [
      { email: "manager@hotel.com", daily: true, weekly: true },
      { email: "frontdesk@hotel.com", daily: false, weekly: true },
    ],
    "conversion": [
      { email: "manager@hotel.com", daily: false, weekly: true },
    ],
    "not-booked": [
      { email: "manager@hotel.com", daily: false, weekly: true },
      { email: "sales@hotel.com", daily: true, weekly: false },
    ],
    "revenue": [
      { email: "manager@hotel.com", daily: true, weekly: true },
      { email: "accounting@hotel.com", daily: true, weekly: true },
    ],
  })

  const [newSubscriberEmail, setNewSubscriberEmail] = useState("")
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [dailyDeliveryTime, setDailyDeliveryTime] = useState("08:00")
  const [weeklyDeliveryDay, setWeeklyDeliveryDay] = useState("monday")
  const [digestFormat, setDigestFormat] = useState("summary")

  const toggleSubscriberSchedule = (reportId: string, email: string, scheduleType: "daily" | "weekly") => {
    setReportSubscriptions(prev => ({
      ...prev,
      [reportId]: prev[reportId].map(sub =>
        sub.email === email
          ? { ...sub, [scheduleType]: !sub[scheduleType] }
          : sub
      )
    }))
  }

  const addSubscriber = (reportId: string) => {
    if (newSubscriberEmail && !reportSubscriptions[reportId].some(s => s.email === newSubscriberEmail)) {
      setReportSubscriptions(prev => ({
        ...prev,
        [reportId]: [...prev[reportId], { email: newSubscriberEmail, daily: false, weekly: true }]
      }))
      setNewSubscriberEmail("")
    }
  }

  const removeSubscriber = (reportId: string, email: string) => {
    setReportSubscriptions(prev => ({
      ...prev,
      [reportId]: prev[reportId].filter(s => s.email !== email)
    }))
  }

  const getSubscriberCounts = (reportId: string) => {
    const subs = reportSubscriptions[reportId] || []
    return {
      daily: subs.filter(s => s.daily).length,
      weekly: subs.filter(s => s.weekly).length,
      total: subs.length
    }
  }

  const handleSave = async () => {
    if (!hotelId || !detail) return
    setSaving(true)
    try {
      let latest: HotelDetail | null = null

      // Operator-safe fields (PUT /admin/hotels/{id}) — send only what changed.
      const opBody: HotelOperatorUpdate = {}
      const nextName = hotelName.trim()
      if (nextName && nextName !== detail.display_name) opBody.display_name = nextName
      if (timezone !== detail.timezone) opBody.timezone = timezone
      const nextMax = maxCallDuration === "unlimited" ? null : Number(maxCallDuration)
      if (nextMax !== detail.max_call_minutes) opBody.max_call_minutes = nextMax
      if (Object.keys(opBody).length > 0) {
        latest = await updateHotelOperatorSettings(hotelId, opBody)
      }

      // Platform-admin-only fields (PATCH /platform-settings).
      if (isPlatformAdmin) {
        const pfBody: HotelPlatformUpdate = {}
        const nextEmailFrom = composeEmailFrom(senderName, email)
        if (nextEmailFrom !== (detail.email_from ?? null)) pfBody.email_from = nextEmailFrom
        const nextInbound = inboundNumber.trim() || null
        if (nextInbound !== (detail.inbound_phone_number ?? null)) {
          pfBody.inbound_phone_number = nextInbound
        }
        if (Object.keys(pfBody).length > 0) {
          latest = await updateHotelPlatformSettings(hotelId, pfBody)
        }
      }

      if (latest) {
        applyDetail(latest)
        toast.success("Settings saved.")
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        toast.info("No changes to save.")
      }
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const selectedHotelName =
    hotels.find((h) => h.hotel_id === hotelId)?.display_name ?? hotelId ?? ""

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedHotelName
                ? `Manage settings for ${selectedHotelName}`
                : "Manage your hotel and system preferences"}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !detail}
            className="bg-[#6b7a4a] hover:bg-[#5a6940] text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {!hotelId ? (
          <StateNotice
            tone="muted"
            message={
              accessState === "no-access"
                ? "Your account isn't set up for any hotels yet. Contact Resonata to have your account configured."
                : "Select a hotel to view its settings."
            }
          />
        ) : loading ? (
          <StateNotice tone="muted" message="Loading hotel settings..." />
        ) : loadError ? (
          <StateNotice tone="error" message={loadError} />
        ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* Hotel Information */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Hotel Information</CardTitle>
                  <CardDescription className="text-xs">Basic details about your property</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hotelName" className="text-xs text-muted-foreground">Hotel Name</Label>
                <Input
                  id="hotelName"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inboundNumber" className="text-xs text-muted-foreground">
                  Inbound Twilio Number
                  {!isPlatformAdmin && <PlatformOnlyHint />}
                </Label>
                <Input
                  id="inboundNumber"
                  value={inboundNumber}
                  onChange={(e) => setInboundNumber(e.target.value)}
                  disabled={!isPlatformAdmin}
                  placeholder="+15551234567"
                  className="bg-card border-border disabled:opacity-70"
                />
                <p className="text-[11px] text-muted-foreground">
                  E.164 number callers dial to reach this hotel. Routes inbound calls to this tenant.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="senderName" className="text-xs text-muted-foreground">
                  Sender Name
                  {!isPlatformAdmin && <PlatformOnlyHint />}
                </Label>
                <Input
                  id="senderName"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  disabled={!isPlatformAdmin}
                  placeholder="Orlando International Drive"
                  className="bg-card border-border disabled:opacity-70"
                />
                <p className="text-[11px] text-muted-foreground">
                  Friendly name guests see as the sender of confirmation emails.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs text-muted-foreground">
                  Email Address
                  {!isPlatformAdmin && <PlatformOnlyHint />}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isPlatformAdmin}
                  placeholder="reservations@example.com"
                  className="bg-card border-border disabled:opacity-70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website" className="text-xs text-muted-foreground">
                  Website
                  <NotSavedHint />
                </Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
            </CardContent>
          </Card>

          {/* Regional Settings */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Regional Settings</CardTitle>
                  <CardDescription className="text-xs">Timezone, currency, and language</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-xs text-muted-foreground">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                    <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                    {/* Surface the stored zone even if it's outside the short list above. */}
                    {timezone &&
                      ![
                        "America/New_York",
                        "America/Chicago",
                        "America/Denver",
                        "America/Los_Angeles",
                        "Europe/London",
                        "Europe/Paris",
                      ].includes(timezone) && (
                        <SelectItem value={timezone}>{timezone}</SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency" className="text-xs text-muted-foreground">Currency</Label>
                <Input
                  id="currency"
                  value={currency}
                  disabled
                  className="bg-card border-border disabled:opacity-70"
                />
                <p className="text-[11px] text-muted-foreground">Set at onboarding.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language" className="text-xs text-muted-foreground">
                  Language
                  <NotSavedHint />
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Call Settings */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Call Settings</CardTitle>
                  <CardDescription className="text-xs">Configure call handling preferences</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessStart" className="text-xs text-muted-foreground">
                    Business Hours Start
                    <NotSavedHint />
                  </Label>
                  <Input
                    id="businessStart"
                    type="time"
                    value={businessHoursStart}
                    onChange={(e) => setBusinessHoursStart(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessEnd" className="text-xs text-muted-foreground">
                    Business Hours End
                    <NotSavedHint />
                  </Label>
                  <Input
                    id="businessEnd"
                    type="time"
                    value={businessHoursEnd}
                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDuration" className="text-xs text-muted-foreground">Max Call Duration (minutes)</Label>
                <Select value={maxCallDuration} onValueChange={setMaxCallDuration}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    {/* Surface a stored non-standard value (1–120) so it round-trips. */}
                    {maxCallDuration !== "unlimited" &&
                      !STANDARD_DURATIONS.includes(maxCallDuration) && (
                        <SelectItem value={maxCallDuration}>{maxCallDuration} minutes</SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-medium text-card-foreground">
                    After Hours Message
                    <NotSavedHint />
                  </p>
                  <p className="text-xs text-muted-foreground">Play a message outside business hours</p>
                </div>
                <Switch checked={afterHoursMessage} onCheckedChange={setAfterHoursMessage} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-card-foreground">
                    Call Recording
                    <NotSavedHint />
                  </p>
                  <p className="text-xs text-muted-foreground">Record calls for quality assurance</p>
                </div>
                <Switch checked={callRecording} onCheckedChange={setCallRecording} />
              </div>
            </CardContent>
          </Card>

          {/* Scheduled Reports */}
          <Card className="border-border col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center">
                    Scheduled Reports
                    <NotSavedHint />
                  </CardTitle>
                  <CardDescription className="text-xs">Configure which reports to receive via email and manage subscribers</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Delivery Settings */}
              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-border">
                <div className="space-y-2">
                  <Label htmlFor="dailyTime" className="text-xs text-muted-foreground">Daily Delivery Time</Label>
                  <Input
                    id="dailyTime"
                    type="time"
                    value={dailyDeliveryTime}
                    onChange={(e) => setDailyDeliveryTime(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weeklyDay" className="text-xs text-muted-foreground">Weekly Delivery Day</Label>
                  <select
                    id="weeklyDay"
                    value={weeklyDeliveryDay}
                    onChange={(e) => setWeeklyDeliveryDay(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="digestFormat" className="text-xs text-muted-foreground">Report Format</Label>
                  <select
                    id="digestFormat"
                    value={digestFormat}
                    onChange={(e) => setDigestFormat(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="summary">Summary</option>
                    <option value="detailed">Detailed</option>
                    <option value="pdf">PDF Attachment</option>
                  </select>
                </div>
              </div>

              {/* Report Subscriptions */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-card-foreground">Report Subscriptions</p>

                {availableReports.map((report) => {
                  const counts = getSubscriberCounts(report.id)
                  return (
                    <div key={report.id} className="border border-border rounded-lg bg-background">
                      <button
                        onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                        className="w-full p-4 flex items-center justify-between text-left"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-card-foreground">{report.name}</p>
                          <p className="text-xs text-muted-foreground">{report.description}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">
                              <span className="font-medium text-card-foreground">{counts.daily}</span> daily
                            </span>
                            <span className="text-muted-foreground">
                              <span className="font-medium text-card-foreground">{counts.weekly}</span> weekly
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{counts.total}</span>
                            {expandedReport === report.id ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded subscriber list with individual controls */}
                      {expandedReport === report.id && (
                        <div className="px-4 pb-4 border-t border-border">
                          <div className="pt-3 space-y-2">
                            {/* Header row */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
                              <div className="flex-1">Subscriber</div>
                              <div className="w-16 text-center">Daily</div>
                              <div className="w-16 text-center">Weekly</div>
                              <div className="w-8"></div>
                            </div>

                            {/* Subscriber rows */}
                            {reportSubscriptions[report.id]?.map((subscriber) => (
                              <div key={subscriber.email} className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
                                <div className="flex-1 flex items-center gap-2">
                                  <Mail className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm">{subscriber.email}</span>
                                </div>
                                <div className="w-16 flex justify-center">
                                  <Switch
                                    checked={subscriber.daily}
                                    onCheckedChange={() => toggleSubscriberSchedule(report.id, subscriber.email, "daily")}
                                  />
                                </div>
                                <div className="w-16 flex justify-center">
                                  <Switch
                                    checked={subscriber.weekly}
                                    onCheckedChange={() => toggleSubscriberSchedule(report.id, subscriber.email, "weekly")}
                                  />
                                </div>
                                <div className="w-8 flex justify-center">
                                  <button
                                    onClick={() => removeSubscriber(report.id, subscriber.email)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {reportSubscriptions[report.id]?.length === 0 && (
                              <p className="text-xs text-muted-foreground py-2">No subscribers yet</p>
                            )}

                            {/* Add subscriber row */}
                            <div className="flex gap-2 pt-2">
                              <Input
                                type="email"
                                value={newSubscriberEmail}
                                onChange={(e) => setNewSubscriberEmail(e.target.value)}
                                className="bg-card border-border flex-1 text-sm h-8"
                                placeholder="Add subscriber email"
                                onKeyDown={(e) => e.key === "Enter" && addSubscriber(report.id)}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addSubscriber(report.id)}
                                className="border-border h-8"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        )}
      </main>
    </div>
  )
}

function StateNotice({ tone, message }: { tone: "muted" | "error"; message: string }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        tone === "error"
          ? "border-destructive/30 text-destructive"
          : "border-border text-muted-foreground"
      }`}
    >
      {message}
    </div>
  )
}
