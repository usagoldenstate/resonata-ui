"use client"

// Step 5 — how a call turns into a reservation. Exactly one flow per hotel:
//   booking_engine_link — the agent emails/texts a deep link; the booking
//     engine takes the payment and creates the reservation.
//   pms_payment_link — the agent creates a real PMS reservation and sends the
//     PMS card-hold pay link. StayNTouch only.

import * as React from "react"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchBookingEnginePmsCatalog,
  fetchBookingEngineState,
  previewBookingEngineLink,
  patchSetupProgress,
  updateBookingEngineConfig,
  updateHotelOperatorSettings,
  updateHotelPlatformSettings,
  type BookingEngineConfig,
  type BookingEnginePmsCatalog,
  type BookingEngineState,
  type ReservationFlow,
} from "@/lib/api"
import { cn } from "@/lib/utils"

import {
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  isAbortError,
  type StepContext,
} from "./shared"

type SynxisForm = {
  base_url: string
  chain_id: string
  synxis_hotel_id: string
  currency: string
  locale: string
}

type P3Form = {
  base_url: string
  p3_hotel_id: string
  checkout_url_style: "rates_rooms_inline" | "trailing_rate_room"
  default_child_bucket: string
}

function isoDatePlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function str(config: Record<string, unknown> | null | undefined, key: string): string {
  const v = config?.[key]
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : ""
}

function mappingOf(
  config: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, string> {
  const v = config?.[key]
  if (!v || typeof v !== "object") return {}
  const out: Record<string, string> = {}
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === "string") out[k] = value
  }
  return out
}

export function ReservationFlowStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext, goBack, hasBack } = ctx

  const [flow, setFlow] = React.useState<ReservationFlow>(
    detail.reservation_flow ?? "booking_engine_link",
  )
  const [beState, setBeState] = React.useState<BookingEngineState | null>(null)
  const [catalog, setCatalog] = React.useState<BookingEnginePmsCatalog | null>(null)
  const [provider, setProvider] = React.useState(detail.booking_engine_provider ?? "")
  const [preferredRateCode, setPreferredRateCode] = React.useState(
    detail.preferred_rate_code ?? "",
  )
  const [synxis, setSynxis] = React.useState<SynxisForm>({
    base_url: str(detail.booking_engine_config, "base_url"),
    chain_id: str(detail.booking_engine_config, "chain_id"),
    synxis_hotel_id: str(detail.booking_engine_config, "synxis_hotel_id"),
    currency: str(detail.booking_engine_config, "currency") || detail.currency,
    locale: str(detail.booking_engine_config, "locale") || "en-US",
  })
  const [p3, setP3] = React.useState<P3Form>({
    base_url: str(detail.booking_engine_config, "base_url"),
    p3_hotel_id: str(detail.booking_engine_config, "p3_hotel_id"),
    checkout_url_style:
      str(detail.booking_engine_config, "checkout_url_style") === "trailing_rate_room"
        ? "trailing_rate_room"
        : "rates_rooms_inline",
    default_child_bucket: str(detail.booking_engine_config, "default_child_bucket") || "3",
  })
  const [roomMappings, setRoomMappings] = React.useState<Record<string, string>>(
    mappingOf(detail.booking_engine_config, "room_type_mappings"),
  )
  const [rateMappings, setRateMappings] = React.useState<Record<string, string>>(
    mappingOf(detail.booking_engine_config, "rate_mappings"),
  )
  const [gatewayAck, setGatewayAck] = React.useState(false)
  const [sourceAck, setSourceAck] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewing, setPreviewing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetchBookingEngineState(hotelId, { signal: controller.signal })
      .then((s) => {
        setBeState(s)
        if (!provider && s.booking_engine_provider) setProvider(s.booking_engine_provider)
      })
      .catch((e) => {
        if (isAbortError(e)) return
        setError(describeApiError(e))
      })
    return () => controller.abort()
    // Provider is seeded once; re-running on its change would fight the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  React.useEffect(() => {
    if (flow !== "booking_engine_link") return
    const controller = new AbortController()
    fetchBookingEnginePmsCatalog(hotelId, { signal: controller.signal })
      .then(setCatalog)
      .catch((e) => {
        if (isAbortError(e)) return
        // A catalog failure is not fatal — mappings can be filled by hand.
        setCatalog(null)
      })
    return () => controller.abort()
  }, [hotelId, flow])

  const configurable = provider === "synxis" || provider === "p3"
  const payLinkAvailable = detail.pms_provider === "stayntouch"

  const buildConfig = (): BookingEngineConfig | null => {
    if (provider === "synxis") {
      return {
        base_url: synxis.base_url.trim(),
        chain_id: synxis.chain_id.trim(),
        synxis_hotel_id: synxis.synxis_hotel_id.trim(),
        currency: synxis.currency.trim().toUpperCase(),
        locale: synxis.locale.trim(),
        room_type_mappings: cleanMapping(roomMappings),
        rate_mappings: cleanMapping(rateMappings),
      }
    }
    if (provider === "p3") {
      return {
        base_url: p3.base_url.trim(),
        p3_hotel_id: p3.p3_hotel_id.trim(),
        checkout_url_style: p3.checkout_url_style,
        default_child_bucket: Number(p3.default_child_bucket) || 3,
        room_type_mappings: cleanMapping(roomMappings),
        rate_mappings: cleanMapping(rateMappings),
        addon_mappings: mappingOf(detail.booking_engine_config, "addon_mappings"),
      }
    }
    return null
  }

  const preview = async () => {
    const config = buildConfig()
    if (!config) return
    const firstRoom = catalog?.room_types[0]
    const firstRate = catalog?.rates[0]
    if (!firstRoom) {
      setError("No room types cached — run the catalog sync first to preview a link.")
      return
    }
    setPreviewing(true)
    setError(null)
    try {
      const res = await previewBookingEngineLink(hotelId, {
        config: config as unknown as Record<string, unknown>,
        check_in: isoDatePlus(14),
        check_out: isoDatePlus(16),
        adults: 2,
        children: 0,
        room_type_id: firstRoom.room_type_id,
        rate_id: firstRate?.rate_id,
      })
      setPreviewUrl(res.url)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setPreviewing(false)
    }
  }

  const save = async () => {
    if (flow === "pms_payment_link" && (!gatewayAck || !sourceAck)) {
      setError("Confirm both StayNTouch prerequisites before choosing the pay-link flow.")
      return
    }
    if (flow === "booking_engine_link" && !provider) {
      setError("Pick a booking engine.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateHotelOperatorSettings(hotelId, {
        preferred_rate_code: preferredRateCode.trim() || null,
      })
      await updateHotelPlatformSettings(hotelId, {
        reservation_flow: flow,
        ...(flow === "booking_engine_link" ? { booking_engine_provider: provider } : {}),
      })
      if (flow === "booking_engine_link" && configurable) {
        const config = buildConfig()
        if (config) await updateBookingEngineConfig(hotelId, config)
      }
      await patchSetupProgress(hotelId, { step: "reservation_flow", status: "done" })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <StepCard
        title="How does a call become a reservation?"
        description="Exactly one path per hotel."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FlowCard
            checked={flow === "booking_engine_link"}
            onSelect={() => setFlow("booking_engine_link")}
            title="Booking-engine link"
            recommended
            points={[
              "The agent emails or texts a pre-filled deep link.",
              "Payment and reservation creation happen on the booking engine.",
              "Works with any PMS.",
            ]}
          />
          <FlowCard
            checked={flow === "pms_payment_link"}
            onSelect={() => payLinkAvailable && setFlow("pms_payment_link")}
            disabled={!payLinkAvailable}
            title="PMS payment link"
            points={[
              "The agent creates a real reservation in the PMS and holds the room for one hour.",
              "The guest only enters card details on the PMS pay link.",
              payLinkAvailable
                ? "StayNTouch only."
                : "Unavailable — this flow requires StayNTouch.",
            ]}
          />
        </div>

        {flow === "pms_payment_link" ? (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-300">
              Confirm these in StayNTouch before choosing this flow:
            </p>
            <label className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-300">
              <input
                type="checkbox"
                checked={gatewayAck}
                onChange={(e) => setGatewayAck(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5"
              />
              <span>
                The payment gateway is Adyen or Shift4 — pay links are not issued for any
                other gateway.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-300">
              <input
                type="checkbox"
                checked={sourceAck}
                onChange={(e) => setSourceAck(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5"
              />
              <span>
                A source with code <span className="font-mono">RESONATA</span> exists
                (Settings → Sources), or an override is set on the PMS step. An unconfigured
                source is silently dropped, which kills booking attribution.
              </span>
            </label>
          </div>
        ) : null}
      </StepCard>

      {flow === "booking_engine_link" ? (
        <StepCard
          title="Booking engine"
          description="The deep link the agent sends is built by this provider's adapter."
        >
          <Field label="Provider" htmlFor="beProvider">
            <select
              id="beProvider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">Select…</option>
              {(beState?.registered_providers ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          {provider === "synxis" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Base URL" htmlFor="synxisBase">
                <Input
                  id="synxisBase"
                  value={synxis.base_url}
                  onChange={(e) => setSynxis({ ...synxis, base_url: e.target.value })}
                  placeholder="https://be.synxis.com/"
                />
              </Field>
              <Field label="Chain ID" htmlFor="synxisChain">
                <Input
                  id="synxisChain"
                  value={synxis.chain_id}
                  onChange={(e) => setSynxis({ ...synxis, chain_id: e.target.value })}
                />
              </Field>
              <Field label="Synxis hotel ID" htmlFor="synxisHotel">
                <Input
                  id="synxisHotel"
                  value={synxis.synxis_hotel_id}
                  onChange={(e) =>
                    setSynxis({ ...synxis, synxis_hotel_id: e.target.value })
                  }
                />
              </Field>
              <Field label="Currency" htmlFor="synxisCurrency">
                <Input
                  id="synxisCurrency"
                  value={synxis.currency}
                  onChange={(e) =>
                    setSynxis({ ...synxis, currency: e.target.value.toUpperCase() })
                  }
                  className="font-mono"
                />
              </Field>
              <Field label="Locale" htmlFor="synxisLocale">
                <Input
                  id="synxisLocale"
                  value={synxis.locale}
                  onChange={(e) => setSynxis({ ...synxis, locale: e.target.value })}
                  placeholder="en-US"
                />
              </Field>
            </div>
          ) : null}

          {provider === "p3" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Base URL" htmlFor="p3Base">
                <Input
                  id="p3Base"
                  value={p3.base_url}
                  onChange={(e) => setP3({ ...p3, base_url: e.target.value })}
                />
              </Field>
              <Field label="P3 hotel ID" htmlFor="p3Hotel">
                <Input
                  id="p3Hotel"
                  value={p3.p3_hotel_id}
                  onChange={(e) => setP3({ ...p3, p3_hotel_id: e.target.value })}
                />
              </Field>
              <Field label="Checkout URL style" htmlFor="p3Style">
                <select
                  id="p3Style"
                  value={p3.checkout_url_style}
                  onChange={(e) =>
                    setP3({
                      ...p3,
                      checkout_url_style: e.target
                        .value as P3Form["checkout_url_style"],
                    })
                  }
                  className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <option value="rates_rooms_inline">rates_rooms_inline</option>
                  <option value="trailing_rate_room">trailing_rate_room</option>
                </select>
              </Field>
              <Field label="Default child bucket" htmlFor="p3Child">
                <Input
                  id="p3Child"
                  inputMode="numeric"
                  value={p3.default_child_bucket}
                  onChange={(e) =>
                    setP3({ ...p3, default_child_bucket: e.target.value.replace(/\D/g, "") })
                  }
                />
              </Field>
            </div>
          ) : null}

          {configurable ? (
            <>
              <MappingTable
                title="Room type codes"
                blurb="Leave a row blank to pass the PMS id through unchanged. An unmapped id omits the URL parameter, which degrades the link to the search page."
                rows={(catalog?.room_types ?? []).map((r) => ({
                  id: r.room_type_id,
                  label: r.room_name,
                  pmsCode: r.room_code,
                }))}
                values={roomMappings}
                onChange={setRoomMappings}
              />
              <MappingTable
                title="Rate codes"
                blurb={
                  catalog?.rates_error
                    ? `Rate sample unavailable: ${catalog.rates_error}`
                    : "Sampled from a live availability search, so this list is indicative rather than exhaustive."
                }
                rows={(catalog?.rates ?? []).map((r) => ({
                  id: r.rate_id,
                  label: r.rate_name ?? r.rate_id,
                  pmsCode: r.rate_code,
                }))}
                values={rateMappings}
                onChange={setRateMappings}
              />
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={preview}
                  disabled={previewing}
                >
                  {previewing ? "Building…" : "Preview link"}
                </Button>
                {previewUrl ? (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-start gap-2 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {previewUrl}
                  </a>
                ) : null}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Open it and check the dates, room and rate are pre-selected. A wrong code
                  produces a valid-looking link that lands on the wrong room.
                </p>
              </div>
            </>
          ) : provider ? (
            <Notice>
              <span className="font-mono">{provider}</span> takes no configuration here.
            </Notice>
          ) : null}
        </StepCard>
      ) : null}

      <StepCard title="Rate preference">
        <Field
          label="Preferred rate code"
          htmlFor="preferredRateCode"
          hint="The rate the agent leads with when several are available. Optional."
        >
          <Input
            id="preferredRateCode"
            value={preferredRateCode}
            onChange={(e) => setPreferredRateCode(e.target.value)}
            placeholder="BAR"
            className="font-mono"
          />
        </Field>
      </StepCard>

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={save}
        saving={saving}
        error={error}
      />
    </div>
  )
}

function cleanMapping(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    const trimmed = value.trim()
    if (trimmed) out[key] = trimmed
  }
  return out
}

function FlowCard({
  checked,
  onSelect,
  title,
  points,
  disabled,
  recommended,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  points: string[]
  disabled?: boolean
  recommended?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "flex h-full w-full flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
        {recommended ? (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            default
          </span>
        ) : null}
      </span>
      <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        {points.map((p) => (
          <li key={p}>• {p}</li>
        ))}
      </ul>
    </button>
  )
}

function MappingTable({
  title,
  blurb,
  rows,
  values,
  onChange,
}: {
  title: string
  blurb: string
  rows: Array<{ id: string; label: string; pmsCode: string | null }>
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium">{title}</p>
        <Notice>Nothing to map yet — {blurb}</Notice>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{title}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{blurb}</p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs">
              {row.label}
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                {row.id}
                {row.pmsCode ? ` · ${row.pmsCode}` : ""}
              </span>
            </span>
            <Input
              value={values[row.id] ?? ""}
              onChange={(e) => onChange({ ...values, [row.id]: e.target.value })}
              placeholder={row.pmsCode ?? "code"}
              className="h-8 w-40 font-mono text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
