"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  ApiError,
  fetchLeadDeliveryTestPreview,
  sendLeadDeliveryTest,
  updateHotelPlatformSettings,
  type HotelDetail,
  type LeadDeliveryConfig,
  type LeadDeliveryExtraField,
  type LeadDeliveryTestPreview,
} from "@/lib/api"
import { leadReasonText } from "@/lib/lead-delivery-labels"

const PROVIDER = "salesforce_web_to_lead"
const DEFAULT_LEAD_SOURCE = "Resonata - phone inquiry"
const MAX_EXTRA_FIELDS = 20

function errorText(cause: unknown): string {
  if (cause instanceof ApiError && cause.body && typeof cause.body === "object") {
    const detail = (cause.body as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail
        .map(item => (typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)))
        .join("; ")
    }
  }
  return cause instanceof Error ? cause.message : String(cause)
}

function sameConfig(a: LeadDeliveryConfig | null, b: LeadDeliveryConfig | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Platform admins only (it lives on the Advanced tab). Saves on its own, like
// the cancellation cards, so a lead destination never rides along with an
// unrelated settings save. There is deliberately no debug option: every
// request, test included, is the production request.
type Props = {
  hotelId: string
  saved: LeadDeliveryConfig | null
  onSaved: (detail: HotelDetail) => void
}

export function LeadDeliveryCard(props: Props) {
  return <LeadDeliveryEditor key={props.hotelId} {...props} />
}

function emptyDraft(saved: LeadDeliveryConfig | null): LeadDeliveryConfig {
  return saved ?? { provider: PROVIDER, enabled: false, org_id: "", lead_source: DEFAULT_LEAD_SOURCE, extra_fields: [] }
}

function LeadDeliveryEditor({ hotelId, saved, onSaved }: Props) {
  const [baseline, setBaseline] = useState(saved)
  const [draftValue, setDraftValue] = useState(() => emptyDraft(saved))
  const { enabled, org_id: orgId, lead_source: leadSource, extra_fields: fields } = draftValue
  const setEnabled = (value: boolean) => setDraftValue(d => ({ ...d, enabled: value }))
  const setOrgId = (value: string) => setDraftValue(d => ({ ...d, org_id: value }))
  const setLeadSource = (value: string) => setDraftValue(d => ({ ...d, lead_source: value }))
  const setFields = (value: LeadDeliveryExtraField[]) => setDraftValue(d => ({ ...d, extra_fields: value }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<LeadDeliveryTestPreview | null>(null)
  const [testing, setTesting] = useState(false)

  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const testInFlight = useRef(false)
  const conflict = !sameConfig(baseline, saved)
  // New object identity from an unrelated settings save is not a change.
  // Adopt a changed server value only while this form has no local edits.
  if (conflict && sameConfig(draftValue, emptyDraft(baseline))) {
    setBaseline(saved)
    setDraftValue(emptyDraft(saved))
    setPreview(null)
    setError(null)
  }

  const loadSaved = () => {
    setBaseline(saved)
    setDraftValue(emptyDraft(saved))
    setPreview(null)
    setError(null)
  }

  const draft: LeadDeliveryConfig = {
    provider: PROVIDER,
    enabled,
    org_id: orgId.trim(),
    lead_source: leadSource.trim(),
    extra_fields: fields.map(field => ({ name: field.name.trim(), value: field.value.trim() })),
  }
  const dirty = !sameConfig(emptyDraft(saved), draft)
  const complete = Boolean(draft.org_id && draft.lead_source) && draft.extra_fields.every(field => field.name && field.value)

  const save = async (value: LeadDeliveryConfig | null) => {
    setSaving(true)
    setError(null)
    try {
      const detail = await updateHotelPlatformSettings(hotelId, { lead_delivery: value })
      if (!active.current) return
      setBaseline(detail.lead_delivery ?? null)
      setDraftValue(emptyDraft(detail.lead_delivery ?? null))
      setPreview(null)
      onSaved(detail)
      toast.success(value ? "Lead delivery saved" : "Lead delivery removed")
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  const openPreview = async () => {
    if (testInFlight.current) return
    testInFlight.current = true
    setTesting(true)
    setError(null)
    try {
      setPreview(await fetchLeadDeliveryTestPreview(hotelId))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      testInFlight.current = false
      setTesting(false)
    }
  }

  const sendTest = async () => {
    if (!preview || testInFlight.current || dirty || conflict) return
    testInFlight.current = true
    setTesting(true)
    try {
      const result = await sendLeadDeliveryTest(hotelId, {
        test_id: preview.test_id,
        destination_fingerprint: preview.destination_fingerprint,
      })
      setPreview(null)
      if (result.status === "submitted") {
        toast.success("Test lead submitted. Check Salesforce to confirm the lead was created.")
      } else {
        toast.error(leadReasonText(result.reason) ?? "The test lead was not submitted.")
      }
    } catch (cause) {
      setPreview(null)
      setError(errorText(cause))
    } finally {
      testInFlight.current = false
      setTesting(false)
    }
  }

  return <Card className="border-border">
    <CardHeader className="pb-4">
      <CardTitle className="text-base">Lead delivery</CardTitle>
      <CardDescription className="text-xs">
        Send this hotel&apos;s sales leads to Salesforce through Web-to-Lead, after each call is finished and classified.
        Set per hotel, because hotels in one company can use different lead software.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <fieldset disabled={saving || testing} className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
        <div className="space-y-0.5">
          <Label htmlFor="leadDeliveryEnabled" className="text-sm">Deliver new leads</Label>
          <p className="text-[11px] text-muted-foreground">
            Save to apply this switch. Turning it off holds queued leads for review in Sales inquiries. Re-enabling does not resend them; a platform admin retries each one. Requests already in flight may still finish.
          </p>
        </div>
        <Switch id="leadDeliveryEnabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Provider</Label>
        <p className="text-sm">Salesforce Web-to-Lead</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="leadDeliveryOrgId" className="text-xs text-muted-foreground">Org ID</Label>
          <Input id="leadDeliveryOrgId" value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="00D…" className="bg-card border-border font-mono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="leadDeliverySource" className="text-xs text-muted-foreground">Lead Source</Label>
          <Input id="leadDeliverySource" value={leadSource} onChange={e => setLeadSource(e.target.value)} className="bg-card border-border" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Custom fields</Label>
        <p className="text-[11px] text-muted-foreground">
          Sent on every lead, such as Property / Company. Use the Salesforce field ID, which starts with 00N.
        </p>
        {fields.map((field, index) => <div key={index} className="flex items-center gap-2">
          <Input aria-label={`Custom field ${index + 1} ID`} value={field.name} placeholder="00N…" className="bg-card border-border font-mono" onChange={e => setFields(fields.map((item, at) => at === index ? { ...item, name: e.target.value } : item))} />
          <Input aria-label={`Custom field ${index + 1} value`} value={field.value} placeholder="Value" className="bg-card border-border" onChange={e => setFields(fields.map((item, at) => at === index ? { ...item, value: e.target.value } : item))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove custom field ${index + 1}`} onClick={() => setFields(fields.filter((_, at) => at !== index))}><Trash2 className="size-4" /></Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" disabled={fields.length >= MAX_EXTRA_FIELDS} onClick={() => setFields([...fields, { name: "", value: "" }])}>
          <Plus className="size-3.5" />Add field
        </Button>
      </div>
      {conflict && <div role="alert" className="space-y-2 text-xs text-destructive">
        <p>The saved lead settings changed while you were editing. Your edits are still here. Choose which version to use before saving.</p>
        <Button type="button" variant="outline" size="sm" onClick={loadSaved}>Load saved settings</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setBaseline(saved); setPreview(null) }}>Keep my edits</Button>
      </div>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {saved && dirty && <p className="text-[11px] text-muted-foreground">
        Changing the Org ID or a custom field pauses waiting leads until a platform admin reviews each one.
      </p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={saving || conflict || !dirty || !complete} onClick={() => void save(draft)}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}Save lead delivery
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!saved || dirty || conflict || testing} title={dirty ? "Save first" : undefined} onClick={() => void openPreview()}>
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}Preview test lead
        </Button>
        {saved && <Button type="button" variant="ghost" size="sm" disabled={saving || conflict} onClick={() => void save(null)}>Remove</Button>}
      </div>
      </fieldset>
    </CardContent>

    <Dialog open={preview !== null} onOpenChange={open => { if (!open) setPreview(null) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a test lead?</DialogTitle>
          <DialogDescription>
            This sends one made-up lead to this hotel&apos;s real Salesforce, exactly as a real lead is sent. Exactly these fields go out.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-xs">
          {Object.entries(preview?.fields ?? {}).map(([name, value]) => <div key={name}>
            <dt className="font-mono text-muted-foreground">{name}</dt>
            <dd className="whitespace-pre-wrap break-words">{value}</dd>
          </div>)}
        </dl>
        <p className="text-[11px] text-muted-foreground">
          A successful result only means Salesforce received the request. Check Salesforce to confirm the lead was created, then delete it.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
          <Button type="button" disabled={testing || dirty || conflict} onClick={() => void sendTest()}>
            {testing && <Loader2 className="size-3.5 animate-spin" />}Send test lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
}
