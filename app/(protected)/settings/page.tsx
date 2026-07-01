"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, Globe, Save, Loader2, Lock, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
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
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("")
  const [timezone, setTimezone] = useState("America/New_York")
  const currency = detail?.currency ?? ""

  const applyDetail = useCallback((d: HotelDetail) => {
    setDetail(d)
    setHotelName(d.display_name)
    const { name, email } = splitEmailFrom(d.email_from)
    setSenderName(name)
    setEmail(email)
    setInboundNumber(d.inbound_phone_number ?? "")
    setVapiPhoneNumberId(d.vapi_phone_number_id ?? "")
    setTimezone(d.timezone)
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

  const [showVapiConfirm, setShowVapiConfirm] = useState(false)

  const handleSaveClick = () => {
    if (!detail) return
    const nextVapiId = vapiPhoneNumberId.trim() || null
    if (isPlatformAdmin && nextVapiId !== (detail.vapi_phone_number_id ?? null)) {
      setShowVapiConfirm(true)
      return
    }
    void handleSave()
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
      // email_from is operator-editable on the backend (PUT), not a platform
      // field. The UI still gates the inputs behind isPlatformAdmin, so only
      // diff it when the admin can actually have changed it.
      if (isPlatformAdmin) {
        const nextEmailFrom = composeEmailFrom(senderName, email)
        if (nextEmailFrom !== (detail.email_from ?? null)) opBody.email_from = nextEmailFrom
      }
      if (Object.keys(opBody).length > 0) {
        latest = await updateHotelOperatorSettings(hotelId, opBody)
      }

      // Platform-admin-only fields (PATCH /platform-settings).
      if (isPlatformAdmin) {
        const pfBody: HotelPlatformUpdate = {}
        const nextInbound = inboundNumber.trim() || null
        if (nextInbound !== (detail.inbound_phone_number ?? null)) {
          pfBody.inbound_phone_number = nextInbound
        }
        const nextVapiId = vapiPhoneNumberId.trim() || null
        if (nextVapiId !== (detail.vapi_phone_number_id ?? null)) {
          pfBody.vapi_phone_number_id = nextVapiId
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
            onClick={handleSaveClick}
            disabled={saving || loading || !detail}
            className="bg-[#6b7a4a] hover:bg-[#5a6940] text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <AlertDialog open={showVapiConfirm} onOpenChange={setShowVapiConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-destructive" />
                Change Vapi Phone Number ID?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left">
                  <p>
                    This UUID must exactly match the number in the Vapi dashboard. If it&apos;s
                    wrong, every inbound and outbound call for this hotel will break until it&apos;s
                    fixed.
                  </p>
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Current: </span>
                      <span className="font-mono">{detail?.vapi_phone_number_id || "(none)"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">New: </span>
                      <span className="font-mono">{vapiPhoneNumberId.trim() || "(none)"}</span>
                    </div>
                  </div>
                  <p>Make a test call to this hotel&apos;s number right after saving.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowVapiConfirm(false)
                  void handleSave()
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Yes, change it
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                  Guest-Facing Phone Number
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
                  Shown to guests in booking confirmation emails as the number to call back.
                </p>
              </div>
              {isPlatformAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="vapiPhoneNumberId" className="text-xs text-muted-foreground">
                    Vapi Phone Number ID
                  </Label>
                  <Input
                    id="vapiPhoneNumberId"
                    value={vapiPhoneNumberId}
                    onChange={(e) => setVapiPhoneNumberId(e.target.value)}
                    placeholder="00000000-0000-4000-8000-000000000000"
                    className="bg-card border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    UUID of this hotel&apos;s phone number in the Vapi dashboard (Phone Numbers →
                    select the number → copy the ID). When set, webhooks from any other Vapi
                    number are rejected — a wrong value blocks this hotel&apos;s calls, so make a
                    test call after changing it. Leave blank to disable the check.
                  </p>
                </div>
              )}
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
