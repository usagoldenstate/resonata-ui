"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ApiError,
  type BookingEnginePmsCatalog,
  type BookingEngineState,
  type P3CheckoutUrlStyle,
  type P3Config,
  fetchBookingEnginePmsCatalog,
  fetchBookingEngineState,
  previewBookingEngineLink,
  updateBookingEngineConfig,
} from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"

// ── Form state ──────────────────────────────────────────────────────────────

type MappingMode = "passthrough" | "map"

type KeyValueRow = { id: number; key: string; value: string }

type FormState = {
  baseUrl: string
  p3HotelId: string
  urlStyle: P3CheckoutUrlStyle
  childBucket: string
  roomMode: MappingMode
  // PMS room_type_id -> P3 code draft (catalog rows; blank = unmapped)
  roomCodes: Record<string, string>
  rateMode: MappingMode
  rateCodes: Record<string, string>
  // Manual rows for rates/addons the catalog sample didn't surface.
  extraRateRows: KeyValueRow[]
  addonRows: KeyValueRow[]
}

let nextRowId = 1
function newRow(key = "", value = ""): KeyValueRow {
  return { id: nextRowId++, key, value }
}

function emptyForm(): FormState {
  return {
    baseUrl: "",
    p3HotelId: "",
    urlStyle: "rates_rooms_inline",
    childBucket: "",
    roomMode: "map",
    roomCodes: {},
    rateMode: "map",
    rateCodes: {},
    extraRateRows: [],
    addonRows: [],
  }
}

function formFromConfig(
  config: Partial<P3Config> | null,
  catalog: BookingEnginePmsCatalog | null,
): FormState {
  const form = emptyForm()
  const roomMappings = config?.room_type_mappings ?? {}
  const rateMappings = config?.rate_mappings ?? {}

  form.baseUrl = config?.base_url ?? ""
  form.p3HotelId = config?.p3_hotel_id ?? ""
  form.urlStyle = config?.checkout_url_style ?? "rates_rooms_inline"
  form.childBucket =
    config?.default_child_bucket != null ? String(config.default_child_bucket) : ""

  // A saved config with empty mappings means passthrough; a missing config
  // defaults to explicit mapping (the safe choice for a fresh hotel).
  form.roomMode =
    config && Object.keys(roomMappings).length === 0 ? "passthrough" : "map"
  form.rateMode =
    config && Object.keys(rateMappings).length === 0 ? "passthrough" : "map"

  form.roomCodes = { ...roomMappings }
  const catalogRateIds = new Set(
    (catalog?.rates ?? []).map((rate) => rate.rate_id),
  )
  for (const [pmsId, p3Code] of Object.entries(rateMappings)) {
    if (catalogRateIds.has(pmsId)) {
      form.rateCodes[pmsId] = p3Code
    } else {
      form.extraRateRows.push(newRow(pmsId, p3Code))
    }
  }
  form.addonRows = Object.entries(config?.addon_mappings ?? {}).map(
    ([pmsId, p3Code]) => newRow(pmsId, p3Code),
  )
  return form
}

function buildConfig(form: FormState): P3Config {
  const roomMappings: Record<string, string> = {}
  if (form.roomMode === "map") {
    for (const [pmsId, code] of Object.entries(form.roomCodes)) {
      if (code.trim()) roomMappings[pmsId.trim()] = code.trim()
    }
  }
  const rateMappings: Record<string, string> = {}
  if (form.rateMode === "map") {
    for (const [pmsId, code] of Object.entries(form.rateCodes)) {
      if (code.trim()) rateMappings[pmsId.trim()] = code.trim()
    }
    for (const row of form.extraRateRows) {
      if (row.key.trim() && row.value.trim()) {
        rateMappings[row.key.trim()] = row.value.trim()
      }
    }
  }
  const addonMappings: Record<string, string> = {}
  for (const row of form.addonRows) {
    if (row.key.trim() && row.value.trim()) {
      addonMappings[row.key.trim()] = row.value.trim()
    }
  }
  return {
    base_url: form.baseUrl.trim(),
    p3_hotel_id: form.p3HotelId.trim(),
    checkout_url_style: form.urlStyle,
    default_child_bucket: Number(form.childBucket) || 3,
    room_type_mappings: roomMappings,
    rate_mappings: rateMappings,
    addon_mappings: addonMappings,
  }
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function BookingEnginePanel() {
  const { hotelId, hotels, loading: hotelLoading } = useHotel()
  const hotelName =
    hotels.find((h) => h.hotel_id === hotelId)?.display_name ?? hotelId

  const [state, setState] = React.useState<BookingEngineState | null>(null)
  const [catalog, setCatalog] = React.useState<BookingEnginePmsCatalog | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormState>(emptyForm())
  const [savedSnapshot, setSavedSnapshot] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const dirty =
    state?.configurable === true &&
    JSON.stringify(buildConfig(form)) !== savedSnapshot

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!hotelId) return
      setLoading(true)
      setLoadError(null)
      setCatalog(null)
      try {
        const engineState = await fetchBookingEngineState(hotelId, { signal })
        setState(engineState)
        let cat: BookingEnginePmsCatalog | null = null
        if (engineState.configurable) {
          // Catalog needs a live PMS round-trip; tolerate failure so the
          // form still renders for manual entry.
          try {
            cat = await fetchBookingEnginePmsCatalog(hotelId, { signal })
            setCatalog(cat)
          } catch (e) {
            if (isAbortError(e)) return
            toast.error(`PMS catalog unavailable: ${describeError(e)}`)
          }
        }
        const nextForm = formFromConfig(engineState.config, cat)
        setForm(nextForm)
        setSavedSnapshot(
          engineState.config_valid && engineState.config
            ? JSON.stringify(buildConfig(nextForm))
            : "",
        )
        setLoading(false)
      } catch (e) {
        if (isAbortError(e)) return
        setLoadError(describeError(e))
        setLoading(false)
      }
    },
    [hotelId],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const dirtyRef = React.useRef(dirty)
  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  React.useEffect(() => {
    return registerUnsavedGuard(() =>
      dirtyRef.current ? "You have unsaved booking engine changes. Leave anyway?" : null,
    )
  }, [])
  React.useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const save = async () => {
    if (!hotelId) return
    const config = buildConfig(form)
    if (!config.base_url) {
      toast.error("Booking engine base URL is required.")
      return
    }
    if (!config.p3_hotel_id) {
      toast.error("P3 hotel id is required.")
      return
    }
    setSaving(true)
    try {
      const next = await updateBookingEngineConfig(hotelId, config)
      setState(next)
      const nextForm = formFromConfig(next.config, catalog)
      setForm(nextForm)
      setSavedSnapshot(JSON.stringify(buildConfig(nextForm)))
      toast.success("Booking engine configuration saved.")
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  if (hotelLoading || loading) {
    return <Notice tone="muted" message="Loading booking engine configuration..." />
  }
  if (!hotelId) {
    return <Notice tone="muted" message="Select a hotel to configure its booking engine." />
  }
  if (loadError) {
    return <Notice tone="error" message={loadError} />
  }
  if (!state) return null

  return (
    <div className="max-w-6xl space-y-6">
      <section className="rounded-lg border border-border p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Booking Engine — {hotelName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="default">
                {state.booking_engine_provider ?? "not set"}
              </Badge>
              {state.config_valid ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Config valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Invalid config
                </span>
              )}
              {dirty ? (
                <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
              ) : null}
            </div>
            {!state.config_valid && state.config_error ? (
              <p className="mt-2 text-xs text-destructive">{state.config_error}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved booking engine changes?")) return
                void load()
              }}
              disabled={saving}
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </Button>
            {state.configurable ? (
              <Button type="button" onClick={save} disabled={saving || !dirty}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {!state.configurable ? (
        <Notice
          tone="muted"
          message={
            state.booking_engine_provider
              ? `The "${state.booking_engine_provider}" booking engine has no UI-editable configuration. Only P3 is configurable here.`
              : "This hotel has no booking engine provider set. Assign one via the platform settings API first."
          }
        />
      ) : (
        <>
          <BasicsSection form={form} setForm={setForm} />
          <MappingSection
            kind="room"
            title="Room type mapping"
            mode={form.roomMode}
            onModeChange={(roomMode) => setForm((f) => ({ ...f, roomMode }))}
            rows={(catalog?.room_types ?? []).map((rt) => ({
              pmsId: rt.room_type_id,
              label: rt.room_name,
            }))}
            extraConfigIds={Object.keys(form.roomCodes).filter(
              (id) => !(catalog?.room_types ?? []).some((rt) => rt.room_type_id === id),
            )}
            codes={form.roomCodes}
            onCodeChange={(pmsId, code) =>
              setForm((f) => ({ ...f, roomCodes: { ...f.roomCodes, [pmsId]: code } }))
            }
            catalogNote={
              catalog
                ? `${catalog.room_types.length} room types from the PMS catalog cache.`
                : "PMS catalog unavailable — room types could not be listed."
            }
          />
          <MappingSection
            kind="rate"
            title="Rate mapping"
            mode={form.rateMode}
            onModeChange={(rateMode) => setForm((f) => ({ ...f, rateMode }))}
            rows={(catalog?.rates ?? []).map((rate) => ({
              pmsId: rate.rate_id,
              label: rate.rate_name
                ? `${rate.rate_name}${rate.rate_code ? ` (${rate.rate_code})` : ""}`
                : rate.rate_id,
            }))}
            extraConfigIds={[]}
            codes={form.rateCodes}
            onCodeChange={(pmsId, code) =>
              setForm((f) => ({ ...f, rateCodes: { ...f.rateCodes, [pmsId]: code } }))
            }
            catalogNote={
              catalog?.rates_error
                ? catalog.rates_error
                : catalog
                  ? `Rates discovered from a live availability sample (${catalog.sample_check_in} → ${catalog.sample_check_out}); the list may be incomplete — add missing rates below.`
                  : "PMS catalog unavailable — enter rates manually below."
            }
            manualRows={form.extraRateRows}
            onManualRowsChange={(extraRateRows) => setForm((f) => ({ ...f, extraRateRows }))}
            manualKeyPlaceholder="PMS rate id"
            manualValuePlaceholder="P3 rate code"
          />
          <AddonSection form={form} setForm={setForm} />
          <PreviewSection hotelId={hotelId} form={form} catalog={catalog} />
        </>
      )}
    </div>
  )
}

// ── Basics ──────────────────────────────────────────────────────────────────

function BasicsSection({
  form,
  setForm,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
}) {
  return (
    <section className="rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground">P3 engine basics</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="be-base-url">Booking engine base URL</Label>
          <Input
            id="be-base-url"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://bookings.example.com"
          />
          <p className="text-xs text-muted-foreground">
            HTTPS, no query string. Copy it from the hotel&apos;s live P3 checkout URL
            (everything before <code>/details</code>).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="be-p3-hotel-id">P3 hotel id</Label>
          <Input
            id="be-p3-hotel-id"
            value={form.p3HotelId}
            onChange={(e) => setForm((f) => ({ ...f, p3HotelId: e.target.value }))}
            placeholder="63240"
          />
          <p className="text-xs text-muted-foreground">
            The number after <code>/hotel/</code> in a live checkout URL.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label>Checkout URL style</Label>
        <RadioGroup
          value={form.urlStyle}
          onValueChange={(value) =>
            setForm((f) => ({ ...f, urlStyle: value as P3CheckoutUrlStyle }))
          }
          className="gap-3"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
            <RadioGroupItem value="rates_rooms_inline" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Inline rates/rooms <span className="font-normal text-muted-foreground">(most properties)</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                Selection encoded mid-path: <code>.../rates/RACK/rooms/QQNS/adults/2/...</code>
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
            <RadioGroupItem value="trailing_rate_room" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Trailing rate/room</span>
              <span className="block text-xs text-muted-foreground">
                Codes at the end of the path. Only pick this if verified against a URL
                captured from this property&apos;s live checkout.
              </span>
            </span>
          </label>
        </RadioGroup>
      </div>

      <div className="mt-5 max-w-sm space-y-1.5">
        <Label htmlFor="be-child-bucket">Default child age</Label>
        <Input
          id="be-child-bucket"
          type="number"
          min={1}
          value={form.childBucket}
          onChange={(e) => setForm((f) => ({ ...f, childBucket: e.target.value }))}
          placeholder="3"
        />
        <Alert className="mt-2 border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Stamped on every child</AlertTitle>
          <AlertDescription>
            We never collect child ages on calls — this age goes on the link for every
            child. Only safe if the hotel has confirmed in writing that it does not
            price or gate rooms by child age.
          </AlertDescription>
        </Alert>
      </div>
    </section>
  )
}

// ── Mapping sections ────────────────────────────────────────────────────────

function MappingSection({
  kind,
  title,
  mode,
  onModeChange,
  rows,
  extraConfigIds,
  codes,
  onCodeChange,
  catalogNote,
  manualRows,
  onManualRowsChange,
  manualKeyPlaceholder,
  manualValuePlaceholder,
}: {
  kind: "room" | "rate"
  title: string
  mode: MappingMode
  onModeChange: (mode: MappingMode) => void
  rows: Array<{ pmsId: string; label: string }>
  extraConfigIds: string[]
  codes: Record<string, string>
  onCodeChange: (pmsId: string, code: string) => void
  catalogNote: string
  manualRows?: KeyValueRow[]
  onManualRowsChange?: (rows: KeyValueRow[]) => void
  manualKeyPlaceholder?: string
  manualValuePlaceholder?: string
}) {
  const unmappedCount =
    mode === "map" ? rows.filter((row) => !(codes[row.pmsId] ?? "").trim()).length : 0

  return (
    <section className="rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <RadioGroup
        value={mode}
        onValueChange={(value) => onModeChange(value as MappingMode)}
        className="mt-3 gap-3"
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
          <RadioGroupItem value="passthrough" className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium text-foreground">
              No mapping — use PMS codes as-is
            </span>
            <span className="block text-xs text-muted-foreground">
              The PMS {kind} codes ARE the P3 codes. Verify with a preview link before
              going live: a mismatch produces emailed dead links, not errors.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
          <RadioGroupItem value="map" className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Map PMS codes to P3 codes
            </span>
            <span className="block text-xs text-muted-foreground">
              Unmapped {kind}s fail safe at call time: no link is sent and the caller is
              transferred to the front desk.
            </span>
          </span>
        </label>
      </RadioGroup>

      {mode === "map" ? (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{catalogNote}</p>
          {unmappedCount > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              {unmappedCount} {kind}
              {unmappedCount === 1 ? "" : "s"} unmapped — callers selecting them will be
              transferred instead of receiving a link.
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <div key={row.pmsId} className="flex items-center gap-3">
                <div className="w-1/2 min-w-0">
                  <p className="truncate text-sm text-foreground">{row.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{row.pmsId}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <Input
                  value={codes[row.pmsId] ?? ""}
                  onChange={(e) => onCodeChange(row.pmsId, e.target.value)}
                  placeholder={`P3 ${kind} code`}
                  className="max-w-48 font-mono"
                />
              </div>
            ))}
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing to prepopulate from the PMS.
              </p>
            ) : null}
            {extraConfigIds.map((pmsId) => (
              <div key={pmsId} className="flex items-center gap-3">
                <div className="w-1/2 min-w-0">
                  <p className="truncate text-sm text-foreground">
                    <span className="font-mono">{pmsId}</span>{" "}
                    <span className="text-xs text-amber-700">(in saved config, not in PMS catalog)</span>
                  </p>
                </div>
                <span className="text-muted-foreground">→</span>
                <Input
                  value={codes[pmsId] ?? ""}
                  onChange={(e) => onCodeChange(pmsId, e.target.value)}
                  className="max-w-48 font-mono"
                />
              </div>
            ))}
          </div>

          {manualRows && onManualRowsChange ? (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Additional {kind}s not shown above:
              </p>
              <div className="mt-2 space-y-2">
                {manualRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <Input
                      value={row.key}
                      onChange={(e) =>
                        onManualRowsChange(
                          manualRows.map((r) =>
                            r.id === row.id ? { ...r, key: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder={manualKeyPlaceholder}
                      className="max-w-56 font-mono"
                    />
                    <span className="text-muted-foreground">→</span>
                    <Input
                      value={row.value}
                      onChange={(e) =>
                        onManualRowsChange(
                          manualRows.map((r) =>
                            r.id === row.id ? { ...r, value: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder={manualValuePlaceholder}
                      className="max-w-48 font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        onManualRowsChange(manualRows.filter((r) => r.id !== row.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onManualRowsChange([...manualRows, newRow()])}
              >
                <Plus className="h-4 w-4" />
                Add {kind}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

// ── Add-ons ─────────────────────────────────────────────────────────────────

function AddonSection({
  form,
  setForm,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
}) {
  const setRows = (addonRows: KeyValueRow[]) => setForm((f) => ({ ...f, addonRows }))
  return (
    <section className="rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground">Add-on mapping (optional)</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Maps PMS add-on ids (what <code>lookup_available_addons</code> returns, e.g.{" "}
        <code>pet_fee</code>) to P3 &quot;Choose Extras&quot; query keys (e.g. <code>PET</code>,
        from a captured checkout URL). Leave empty if the hotel sells no add-ons via the
        link — there is no pass-through for add-ons: an unmapped add-on blocks the link
        and transfers the caller.
      </p>
      <div className="mt-3 space-y-2">
        {form.addonRows.map((row) => (
          <div key={row.id} className="flex items-center gap-3">
            <Input
              value={row.key}
              onChange={(e) =>
                setRows(
                  form.addonRows.map((r) =>
                    r.id === row.id ? { ...r, key: e.target.value } : r,
                  ),
                )
              }
              placeholder="PMS add-on id (pet_fee)"
              className="max-w-56 font-mono"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              value={row.value}
              onChange={(e) =>
                setRows(
                  form.addonRows.map((r) =>
                    r.id === row.id ? { ...r, value: e.target.value } : r,
                  ),
                )
              }
              placeholder="P3 extras key (PET)"
              className="max-w-48 font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setRows(form.addonRows.filter((r) => r.id !== row.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => setRows([...form.addonRows, newRow()])}
      >
        <Plus className="h-4 w-4" />
        Add add-on
      </Button>
    </section>
  )
}

// ── Preview ─────────────────────────────────────────────────────────────────

function isoDatePlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function PreviewSection({
  hotelId,
  form,
  catalog,
}: {
  hotelId: string
  form: FormState
  catalog: BookingEnginePmsCatalog | null
}) {
  const [checkIn, setCheckIn] = React.useState(() => isoDatePlus(14))
  const [checkOut, setCheckOut] = React.useState(() => isoDatePlus(16))
  const [adults, setAdults] = React.useState("2")
  const [children, setChildren] = React.useState("0")
  const [roomTypeId, setRoomTypeId] = React.useState("")
  const [rateId, setRateId] = React.useState("")
  const [building, setBuilding] = React.useState(false)
  const [url, setUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const roomOptions = catalog?.room_types ?? []
  const rateOptions = [
    ...(catalog?.rates ?? []).map((r) => ({
      id: r.rate_id,
      label: r.rate_name ?? r.rate_id,
    })),
    ...form.extraRateRows
      .filter((r) => r.key.trim())
      .map((r) => ({ id: r.key.trim(), label: `${r.key.trim()} (manual)` })),
  ]

  const generate = async () => {
    setError(null)
    setUrl(null)
    if (!roomTypeId || !rateId) {
      setError("Pick a room type and a rate first.")
      return
    }
    setBuilding(true)
    try {
      const result = await previewBookingEngineLink(hotelId, {
        config: buildConfig(form),
        check_in: checkIn,
        check_out: checkOut,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        room_type_id: roomTypeId,
        rate_id: rateId,
      })
      setUrl(result.url)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <section className="rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground">Preview a checkout link</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Builds a link from the form above — including unsaved changes — without saving or
        emailing anything. Open it to verify it lands on a working P3 checkout page.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="prev-check-in">Check-in</Label>
          <Input
            id="prev-check-in"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prev-check-out">Check-out</Label>
          <Input
            id="prev-check-out"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Room type</Label>
          {roomOptions.length > 0 ? (
            <Select value={roomTypeId} onValueChange={setRoomTypeId}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Pick a room" />
              </SelectTrigger>
              <SelectContent>
                {roomOptions.map((rt) => (
                  <SelectItem key={rt.room_type_id} value={rt.room_type_id}>
                    {rt.room_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
              placeholder="PMS room_type_id"
              className="font-mono"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Rate</Label>
          {rateOptions.length > 0 ? (
            <Select value={rateId} onValueChange={setRateId}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Pick a rate" />
              </SelectTrigger>
              <SelectContent>
                {rateOptions.map((rate) => (
                  <SelectItem key={rate.id} value={rate.id}>
                    {rate.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={rateId}
              onChange={(e) => setRateId(e.target.value)}
              placeholder="PMS rate_id"
              className="font-mono"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prev-adults">Adults</Label>
          <Input
            id="prev-adults"
            type="number"
            min={1}
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prev-children">Children</Label>
          <Input
            id="prev-children"
            type="number"
            min={0}
            value={children}
            onChange={(e) => setChildren(e.target.value)}
          />
        </div>
      </div>
      <Button type="button" className="mt-4" onClick={generate} disabled={building}>
        {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        Generate preview link
      </Button>
      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : null}
      {url ? (
        <div className="mt-3 rounded-md border border-border bg-card p-3">
          <p className="break-all font-mono text-xs text-foreground">{url}</p>
          <Button asChild type="button" variant="outline" size="sm" className="mt-2">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </a>
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function Notice({ tone, message }: { tone: "muted" | "error"; message: string }) {
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

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    return `${error.status} ${error.message}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
