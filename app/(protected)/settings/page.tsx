"use client"

import { useCallback, useEffect, useState } from "react"
import { TagInput } from "@/components/tag-input"
import { Building2, Globe, Inbox, Layers, Megaphone, PhoneOff, Save, Loader2, Lock, TriangleAlert, Users } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { OptionSelect } from "@/components/ui/option-select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { SetupHealthCard } from "@/components/hotel-setup/setup-health-card"
import { OperaCancellationCard } from "@/components/opera-cancellation-card"
import { StaynTouchCancellationCard } from "@/components/stayntouch-cancellation-card"
import {
  SalesDepartmentsEditor,
  defaultDepartmentDraft,
  departmentDrafts,
  departmentPayload,
  departmentsChanged,
  validateDepartments,
  type DepartmentDraft,
} from "@/components/sales-departments-editor"
import { useHotel } from "@/lib/hotel-context"
import { useCurrentUser } from "@/lib/current-user-context"
import { lineSetOf, type HotelLines } from "@/lib/product-lines"
import {
  ApiError,
  type HotelDetail,
  type HotelOperatorUpdate,
  type HotelPlatformUpdate,
  type Organization,
  fetchOrganizations,
  fetchHotelDetail,
  updateHotelOperatorSettings,
  updateHotelPlatformSettings,
} from "@/lib/api"

import { splitEmailFrom, composeEmailFrom } from "@/lib/email-sender"

function PlatformOnlyHint() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground align-middle">
      <Lock className="h-2.5 w-2.5" />
      Platform admin
    </span>
  )
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

// One name per line, trimmed, blanks dropped, de-duplicated case-insensitively.
// Mirrors the server's normalization so the saved-state diff doesn't report a
// change the backend would have collapsed anyway.
// Mirrors the backend roster and hotel-number limits (api/admin.py).
const MAX_SALES_REPS = 50
const MAX_SALES_REP_NAME = 80
const MAX_IGNORED_NUMBERS = 20

// A loose client-side check; the backend normalizes to E.164 and refuses
// anything it can't parse, with the offending value in the message.
function phoneProblem(value: string): string | null {
  const digits = value.replace(/\D/g, "")
  return /^[+\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15
    ? null
    : `“${value}” isn't a valid phone number.`
}

type SettingsTab = "general" | "reservations" | "sales"

export default function SettingsPage() {
  const { hotelId, hotels, accessState, refresh: refreshHotels } = useHotel()
  const { isPlatformAdmin } = useCurrentUser()

  // ── Backend-backed hotel state ────────────────────────────────────────────
  // `detail` is the last-saved baseline; the form fields below are the editable
  // draft. Saving diffs the draft against `detail` so we only send changed keys.
  const [detail, setDetail] = useState<HotelDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general")

  const [hotelName, setHotelName] = useState("")
  const [senderName, setSenderName] = useState("")
  const [salesSenderName, setSalesSenderName] = useState("")
  const [salesSenderEmail, setSalesSenderEmail] = useState("")
  const [email, setEmail] = useState("")
  const [inboundNumber, setInboundNumber] = useState("")
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("")
  // Organization membership (platform-admin only). "" = independent hotel.
  // The org list loads once for admins; the select is the only writer.
  const [organizationId, setOrganizationId] = useState("")
  const [organizations, setOrganizations] = useState<Organization[] | null>(null)
  // Twilio SMS sender (platform-admin only). Setting it is what lets the agent
  // offer "emailed or texted?"; clearing it retires the choice.
  const [twilioFromNumber, setTwilioFromNumber] = useState("")
  // Sales intake line (platform-admin only) — see the "Sales Intake Line" card.
  const [salesLineEnabled, setSalesLineEnabled] = useState(false)
  const [salesVapiPhoneNumberId, setSalesVapiPhoneNumberId] = useState("")
  // Where inquiries are emailed — operator-editable. A hotel with none yet
  // starts from one catch-all "Sales Department" draft.
  const [salesDepartments, setSalesDepartments] = useState<DepartmentDraft[]>([])
  // Which products the hotel bought (platform-admin only). Sections below
  // follow the SAVED value, so fields don't vanish mid-edit.
  const [productLines, setProductLines] = useState<HotelLines>("reservations")
  // Sales team roster — operator-editable (unlike the sales-line fields
  // above). Edited as tags; normalized server-side on save.
  const [salesRepNames, setSalesRepNames] = useState<string[]>([])
  // The hotel's own numbers (a phone-system trunk) never treated as a guest's
  // caller ID. Edited as tags; the backend stores them E.164.
  const [ignoredNumbers, setIgnoredNumbers] = useState<string[]>([])
  const [timezone, setTimezone] = useState("America/New_York")
  const currency = detail?.currency ?? ""

  const applyDetail = useCallback((d: HotelDetail) => {
    setDetail(d)
    setHotelName(d.display_name)
    const { name, email } = splitEmailFrom(d.email_from)
    const salesSender = splitEmailFrom(d.sales_email_from)
    setSalesSenderName(salesSender.name)
    setSalesSenderEmail(salesSender.email)
    setSenderName(name)
    setEmail(email)
    setInboundNumber(d.inbound_phone_number ?? "")
    setVapiPhoneNumberId(d.vapi_phone_number_id ?? "")
    setOrganizationId(d.organization_id ?? "")
    setTwilioFromNumber(d.twilio_from_number ?? "")
    setSalesLineEnabled(d.sales_line_enabled ?? false)
    setSalesVapiPhoneNumberId(d.sales_vapi_phone_number_id ?? "")
    setSalesDepartments(
      d.sales_departments?.length ? departmentDrafts(d.sales_departments) : [defaultDepartmentDraft()],
    )
    setProductLines(d.lines ?? "reservations")
    setSalesRepNames(d.sales_rep_names ?? [])
    setIgnoredNumbers(d.sales_ignored_caller_numbers ?? [])
    setTimezone(d.timezone)
  }, [])

  useEffect(() => {
    if (!isPlatformAdmin) return
    const controller = new AbortController()
    fetchOrganizations({ signal: controller.signal })
      .then(setOrganizations)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setOrganizations([])
        toast.error("Could not load organizations.")
      })
    return () => controller.abort()
  }, [isPlatformAdmin])

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
        if (salesSenderName.trim() && !salesSenderEmail.trim()) {
          throw new Error("Enter a sales sender email address, or clear both sales sender fields to use the default.")
        }
        const nextSalesEmailFrom = composeEmailFrom(salesSenderName, salesSenderEmail)
        if (nextSalesEmailFrom !== (detail.sales_email_from ?? null)) {
          opBody.sales_email_from = nextSalesEmailFrom
        }
        const nextEmailFrom = composeEmailFrom(senderName, email)
        if (nextEmailFrom !== (detail.email_from ?? null)) opBody.email_from = nextEmailFrom
      }
      if (salesRepNames.join("\n") !== (detail.sales_rep_names ?? []).join("\n")) {
        opBody.sales_rep_names = salesRepNames
      }
      if (ignoredNumbers.join("\n") !== (detail.sales_ignored_caller_numbers ?? []).join("\n")) {
        opBody.sales_ignored_caller_numbers = ignoredNumbers
      }
      // The untouched starter draft (no address yet) on a hotel with no
      // departments isn't a change — only save departments someone edited.
      const untouchedStarter =
        !(detail.sales_departments?.length) &&
        salesDepartments.length === 1 &&
        salesDepartments[0].to.length === 0 &&
        salesDepartments[0].cc.length === 0
      if (!untouchedStarter && departmentsChanged(salesDepartments, detail.sales_departments)) {
        const problem = validateDepartments(salesDepartments)
        if (problem) throw new Error(problem)
        opBody.sales_departments = departmentPayload(salesDepartments)
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
        const nextOrg = organizationId || null
        if (nextOrg !== (detail.organization_id ?? null)) {
          pfBody.organization_id = nextOrg
        }
        const nextTwilio = twilioFromNumber.trim() || null
        if (nextTwilio !== (detail.twilio_from_number ?? null)) {
          pfBody.twilio_from_number = nextTwilio
        }
        // Sales intake line. The backend validates these together (enabling
        // requires a sales department, saved by the PUT above), so send
        // whatever changed in one PATCH.
        if (salesLineEnabled !== (detail.sales_line_enabled ?? false)) {
          pfBody.sales_line_enabled = salesLineEnabled
        }
        const nextSalesVapiId = salesVapiPhoneNumberId.trim() || null
        if (nextSalesVapiId !== (detail.sales_vapi_phone_number_id ?? null)) {
          pfBody.sales_vapi_phone_number_id = nextSalesVapiId
        }
        // Validated together with the sales-line switch, so adding the sales
        // line and switching it on can be one save.
        if (productLines !== (detail.lines ?? "reservations")) {
          pfBody.lines = productLines
        }
        if (Object.keys(pfBody).length > 0) {
          latest = await updateHotelPlatformSettings(hotelId, pfBody)
        }
      }

      if (latest) {
        applyDetail(latest)
        // Nav, page guards and the hotel picker read the shared /me/hotels
        // list, not this page's state: re-read it so a change of product
        // lines (or name/timezone) shows up without a full reload.
        void refreshHotels({ quiet: true })
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

  const savedLines = lineSetOf(detail?.lines)
  const activeSettingsTab =
    (settingsTab === "reservations" && !savedLines.reservations) ||
    (settingsTab === "sales" && !savedLines.sales)
      ? "general"
      : settingsTab

  useEffect(() => {
    setSettingsTab("general")
  }, [hotelId])

  useEffect(() => {
    if (activeSettingsTab !== settingsTab) setSettingsTab("general")
  }, [activeSettingsTab, settingsTab])

  const selectedHotelName =
    hotels.find((h) => h.hotel_id === hotelId)?.display_name ?? hotelId ?? ""

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="app-content flex-1 p-8">
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
            className="bg-primary hover:bg-primary/90 text-white"
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
          <Tabs
            value={activeSettingsTab}
            onValueChange={(value) => setSettingsTab(value as SettingsTab)}
            className="gap-5"
          >
            <TabsList
              aria-label="Settings sections"
              className="w-full max-w-full justify-start overflow-x-auto sm:w-fit"
            >
              <TabsTrigger value="general">General</TabsTrigger>
              {savedLines.reservations && (
                <TabsTrigger value="reservations">Reservations</TabsTrigger>
              )}
              {savedLines.sales && <TabsTrigger value="sales">Sales</TabsTrigger>}
            </TabsList>
            <TabsContent value="general">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {isPlatformAdmin && hotelId && (
                  <div className="lg:col-span-2 max-w-3xl">
                    <SetupHealthCard hotelId={hotelId} />
                  </div>
                )}
                {/* Hotel Information */}
                <Card className="border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
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
                    {isPlatformAdmin && (
                      <div className="space-y-2">
                        <Label htmlFor="organizationId" className="text-xs text-muted-foreground">
                          Organization
                        </Label>
                        <OptionSelect
                          id="organizationId"
                          value={organizationId}
                          onValueChange={setOrganizationId}
                          disabled={organizations === null}
                          options={[
                            { value: "", label: "Independent (no organization)" },
                            ...(organizations ?? []).map((org) => ({ value: org.organization_id, label: org.display_name })),
                          ]}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          The management company this hotel belongs to. Users granted the organization
                          see this hotel immediately; its call history moves with it. Create
                          organizations under Dev Pages → Organizations.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Regional Settings */}
                <Card className="border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Regional Settings</CardTitle>
                        <CardDescription className="text-xs">Timezone and currency</CardDescription>
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
                {isPlatformAdmin && (
                  <Card className="border-border">
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Layers className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Products</CardTitle>
                          <CardDescription className="text-xs">
                            Which phone lines this hotel uses and whether sales intake is active.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Label htmlFor="productLines" className="text-xs text-muted-foreground">
                        Lines
                      </Label>
                      <OptionSelect
                        id="productLines"
                        value={productLines}
                        onValueChange={(v) => setProductLines(v as HotelLines)}
                        options={[
                          { value: "reservations", label: "Reservations line only" },
                          { value: "sales", label: "Sales line only" },
                          { value: "both", label: "Reservations and sales lines" },
                        ]}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        A sales-only hotel sees Call Log, Sales Inquiries, Knowledge Base, Agent
                        Configuration and Settings, and its reservations webhook refuses new calls. The sales
                        line can only be switched on when this includes sales; to remove sales, switch the
                        line off first. Existing calls keep their line either way.
                      </p>
                      <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
                        <div className="space-y-0.5">
                          <Label htmlFor="salesLineEnabled" className="text-sm">
                            Sales line enabled
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            While off, the sales webhook path returns 404 and no inquiries are taken.
                          </p>
                        </div>
                        <Switch
                          id="salesLineEnabled"
                          checked={salesLineEnabled}
                          onCheckedChange={setSalesLineEnabled}
                          disabled={
                            !salesLineEnabled &&
                            (!lineSetOf(productLines).sales ||
                              !salesDepartments.some((d) => d.to.length > 0) ||
                              !salesVapiPhoneNumberId.trim())
                          }
                        />
                      </div>
                      {!salesLineEnabled && (
                        <p className="text-[11px] text-muted-foreground">
                          To turn this on, include Sales in Lines, then add a sales department and the
                          Vapi phone number on the Sales tab.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
            {savedLines.reservations && (
              <TabsContent value="reservations">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card className="border-border">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">Reservations Delivery</CardTitle>
                      <CardDescription className="text-xs">
                        The reservations phone numbers and the sender guests see on booking emails.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                        <Label htmlFor="twilioFromNumber" className="text-xs text-muted-foreground">
                          Text Message Sender Number
                          {!isPlatformAdmin && <PlatformOnlyHint />}
                        </Label>
                        <Input
                          id="twilioFromNumber"
                          value={twilioFromNumber}
                          onChange={(e) => setTwilioFromNumber(e.target.value)}
                          disabled={!isPlatformAdmin}
                          placeholder={isPlatformAdmin ? "+13602180737" : "Not set — links are emailed only"}
                          className="bg-card border-border disabled:opacity-70"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {isPlatformAdmin
                            ? "Twilio number booking links are texted from. When set, the agent offers guests a choice of email or text; leave blank for email only. The Twilio account credentials must also be configured on the server, or text sends will fail."
                            : "The phone number guests receive booking-link text messages from. When it is set, the agent offers guests a choice of email or text; otherwise links are emailed only."}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="senderName" className="text-xs text-muted-foreground">
                          Reservations Sender Name
                          {!isPlatformAdmin && <PlatformOnlyHint />}
                        </Label>
                        <Input
                          id="senderName"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          disabled={!isPlatformAdmin}
                          placeholder="Hotel name"
                          className="bg-card border-border disabled:opacity-70"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Friendly name guests see on reservation-link and card-hold emails.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs text-muted-foreground">
                          Reservations Sender Email Address
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
                  {isPlatformAdmin && detail?.pms_provider === "opera" && hotelId && (
                    <OperaCancellationCard hotelId={hotelId} />
                  )}
                  {isPlatformAdmin && detail?.pms_provider === "stayntouch" && hotelId && (
                    <StaynTouchCancellationCard hotelId={hotelId} />
                  )}
                </div>
              </TabsContent>
            )}
            {savedLines.sales && (
              <TabsContent value="sales">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Hotel operators decide how their sales team splits inquiries. */}
                  <Card className="border-border lg:col-span-2">
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Inbox className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Sales Departments</CardTitle>
                          <CardDescription className="text-xs">
                            Where each recorded inquiry is emailed (Reply-To is the caller)
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <SalesDepartmentsEditor departments={salesDepartments} onChange={setSalesDepartments} />
                    </CardContent>
                  </Card>
                  <Card className="border-border">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">Sales Email Sender</CardTitle>
                      <CardDescription className="text-xs">
                        The name and address shown in the From line of sales inquiry emails.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="salesSenderName" className="text-xs text-muted-foreground">
                          Sales Sender Name
                          {!isPlatformAdmin && <PlatformOnlyHint />}
                        </Label>
                        <Input
                          id="salesSenderName"
                          value={salesSenderName}
                          onChange={(e) => setSalesSenderName(e.target.value)}
                          disabled={!isPlatformAdmin}
                          placeholder="Hotel Group Sales"
                          className="bg-card border-border disabled:opacity-70"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="salesSenderEmail" className="text-xs text-muted-foreground">
                          Sales Sender Email Address
                          {!isPlatformAdmin && <PlatformOnlyHint />}
                        </Label>
                        <Input
                          id="salesSenderEmail"
                          type="email"
                          value={salesSenderEmail}
                          onChange={(e) => setSalesSenderEmail(e.target.value)}
                          disabled={!isPlatformAdmin}
                          placeholder="groups@example.com"
                          className="bg-card border-border disabled:opacity-70"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Use an address on a domain verified for sending emails. Leave both fields blank to use
                        the reservations sender, or the platform default if no reservations sender is set.
                        Where inquiries are sent is configured under Sales Departments.
                      </p>
                    </CardContent>
                  </Card>
                  {/* Hotel operators manage the names offered on the emailed follow-up page. */}
                  <Card className="border-border">
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Sales Team</CardTitle>
                          <CardDescription className="text-xs">
                            Who can be credited with following up on a sales inquiry
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <TagInput
                        id="salesRepNames"
                        label="Salesperson names"
                        hint="Type a name and press Enter. The sales notification email goes to a shared mailbox, so whoever follows up picks their name from this list on the “Update inquiry” page — no sign-in needed — and the inquiry is assigned to them. Removing a name here never changes inquiries already logged against it."
                        values={salesRepNames}
                        onChange={setSalesRepNames}
                        placeholder="e.g. Bob Jackson"
                        max={MAX_SALES_REPS}
                        noun="names"
                        validate={(value) =>
                          value.length > MAX_SALES_REP_NAME
                            ? `Names can be at most ${MAX_SALES_REP_NAME} characters.`
                            : null
                        }
                      />
                    </CardContent>
                  </Card>
                  <Card className="border-border">
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <PhoneOff className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Hotel Phone Numbers</CardTitle>
                          <CardDescription className="text-xs">
                            Your own numbers, never treated as a caller&apos;s number
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <TagInput
                        id="ignoredNumbers"
                        label="Phone numbers"
                        hint="Type a number and press Enter. Calls forwarded from your phone system sometimes show your own number as the caller ID; add any such numbers here so they are never treated as a guest's callback number."
                        values={ignoredNumbers}
                        onChange={setIgnoredNumbers}
                        placeholder="(111) 222-3333"
                        max={MAX_IGNORED_NUMBERS}
                        noun="numbers"
                        inputType="tel"
                        validate={phoneProblem}
                      />
                      {!!detail?.sales_automatic_ignored_numbers?.length && (
                        <p className="text-[11px] text-muted-foreground">
                          Already ignored automatically:{" "}
                          {detail.sales_automatic_ignored_numbers.join(", ")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  {isPlatformAdmin && (
                    <Card className="border-border">
                      <CardHeader className="pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Megaphone className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Sales Intake Line</CardTitle>
                            <CardDescription className="text-xs">
                              A second Vapi number that takes sales inquiries when the sales team doesn&apos;t answer
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="salesVapiPhoneNumberId" className="text-xs text-muted-foreground">
                            Sales Vapi Phone Number ID
                          </Label>
                          <Input
                            id="salesVapiPhoneNumberId"
                            value={salesVapiPhoneNumberId}
                            onChange={(e) => setSalesVapiPhoneNumberId(e.target.value)}
                            placeholder="00000000-0000-4000-8000-000000000000"
                            className="bg-card border-border"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            UUID of the <em>sales</em> number in the Vapi dashboard. Its Server URL must be the
                            hotel&apos;s webhook URL with <span className="font-mono">/sales</span> appended, using
                            the same Server URL Secret. Must differ from the reservations number&apos;s ID. Leave
                            blank to disable the tenant check for this line.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
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
