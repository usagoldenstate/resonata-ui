"use client"

// Step 1 — identity. This is the only step that CREATES anything: it POSTs
// the hotel row inactive, then records the lines choice with the setup
// progress PATCH and hands over to the wizard at `?hotel=<new id>`.
// Everything after it edits an existing row.
//
// Two things live here that logically belong later but cannot:
//   • pms_provider — the platform-settings PATCH can't change it, so it has
//     to ride the create call.
//   • one transfer department — POST /hotels requires at least one, so the
//     agent always has somewhere to send a caller it can't help. The persona
//     step is where the full routing table gets built.

import * as React from "react"
import { useRouter } from "next/navigation"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  createHotel,
  createOrganization,
  fetchOrganizations,
  patchSetupProgress,
  updateHotelOperatorSettings,
  updateHotelPlatformSettings,
  type HotelPlatformUpdate,
  type LinesMode,
  type Organization,
} from "@/lib/api"

import {
  Field,
  Notice,
  PMS_CHOICES,
  RadioCard,
  StepCard,
  StepNav,
  describeApiError,
  hotelSetupHref,
  isAbortError,
  type StepContext,
} from "./shared"

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
]

const HOTEL_ID_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const E164_RE = /^\+[1-9]\d{9,14}$/

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

// Basis points ↔ percent. The column stores basis points (1000 = 10%); the
// operator types a percentage.
function percentToBasisPoints(value: string): number | null {
  const pct = Number(value)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null
  return Math.round(pct * 100)
}

export const LINE_CHOICES: Array<{ value: LinesMode; label: string; blurb: string }> = [
  {
    value: "reservations",
    label: "Reservations only",
    blurb: "One number. The agent quotes availability and sends the booking link.",
  },
  {
    value: "sales",
    label: "Sales intake only",
    blurb: "One number for the sales department's no-answer forward. No PMS.",
  },
  {
    value: "both",
    label: "Both lines",
    blurb: "A reservations number and a separate sales intake number.",
  },
]

function useOrganizations(enabled: boolean) {
  const [organizations, setOrganizations] = React.useState<Organization[] | null>(null)
  React.useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetchOrganizations({ signal: controller.signal })
      .then(setOrganizations)
      .catch((e) => {
        if (isAbortError(e)) return
        setOrganizations([])
      })
    return () => controller.abort()
  }, [enabled])
  return organizations
}

// ── Create form (the Hotel Setup tab's landing view) ────────────────────────

export function IdentityCreateForm() {
  const router = useRouter()
  const organizations = useOrganizations(true)

  const [displayName, setDisplayName] = React.useState("")
  const [hotelId, setHotelId] = React.useState("")
  const [hotelIdTouched, setHotelIdTouched] = React.useState(false)
  const [organizationId, setOrganizationId] = React.useState("")
  const [newOrgName, setNewOrgName] = React.useState("")
  const [timezone, setTimezone] = React.useState("America/New_York")
  const [currency, setCurrency] = React.useState("USD")
  const [inboundNumber, setInboundNumber] = React.useState("")
  const [maxCallMinutes, setMaxCallMinutes] = React.useState("15")
  const [commissionPercent, setCommissionPercent] = React.useState("10")
  const [linesMode, setLinesMode] = React.useState<LinesMode>("reservations")
  const [pmsProvider, setPmsProvider] = React.useState("stayntouch")
  const [deptPhone, setDeptPhone] = React.useState("")
  const [deptName, setDeptName] = React.useState("Front Desk")
  const [deptRules, setDeptRules] = React.useState(
    "The caller asks for a person, or asks about something the agent can't handle.",
  )

  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Set once the row exists, so a failure in a follow-up call never creates a
  // second hotel when the operator hits the button again.
  const [createdId, setCreatedId] = React.useState<string | null>(null)

  const effectiveHotelId = hotelIdTouched ? hotelId : slugify(displayName)
  const salesOnly = linesMode === "sales"

  const validate = (): string | null => {
    if (!displayName.trim()) return "Enter the hotel's display name."
    if (!HOTEL_ID_RE.test(effectiveHotelId)) {
      return "Hotel ID must be lowercase letters, digits and single underscores (e.g. anchorage_by_the_sea)."
    }
    if (!/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) {
      return "Currency must be a 3-letter ISO 4217 code, e.g. USD."
    }
    if (organizationId === "__new__" && !newOrgName.trim()) {
      return "Name the new organization, or pick an existing one."
    }
    if (inboundNumber.trim() && !E164_RE.test(inboundNumber.trim())) {
      return "The guest-facing phone number must be E.164, e.g. +14075551234."
    }
    if (!E164_RE.test(deptPhone.trim())) {
      return "Enter the transfer number in E.164 format, e.g. +14075551234."
    }
    if (!deptName.trim()) return "Name the transfer destination."
    if (!deptRules.trim()) return "Describe when calls should transfer there."
    const bp = percentToBasisPoints(commissionPercent)
    if (bp === null) return "Commission must be a percentage between 0 and 100."
    const minutes = Number(maxCallMinutes)
    if (maxCallMinutes.trim() && (!Number.isInteger(minutes) || minutes < 1 || minutes > 120)) {
      return "Max call length must be a whole number of minutes between 1 and 120."
    }
    return null
  }

  const submit = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      let id = createdId
      if (!id) {
        const created = await createHotel({
          hotel_id: effectiveHotelId,
          display_name: displayName.trim(),
          timezone,
          currency: currency.trim().toUpperCase(),
          pms_provider: salesOnly ? "mock" : pmsProvider,
          // A sales-only hotel never builds a booking-engine link, but the
          // backend still requires a registered provider to activate a
          // booking_engine_link hotel — "mock" keeps that path unblocked.
          // Reservations hotels choose for real on the reservation-flow step.
          booking_engine_provider: salesOnly ? "mock" : null,
          max_call_minutes: maxCallMinutes.trim() ? Number(maxCallMinutes) : null,
          commission_rate_basis_points: percentToBasisPoints(commissionPercent) ?? 1000,
          is_active: false,
          departments: [
            {
              name: deptName.trim(),
              phone_number: deptPhone.trim(),
              routing_rules: deptRules.trim(),
              is_default: true,
              sales_line_transfer: salesOnly,
            },
          ],
        })
        id = created.hotel_id
        setCreatedId(id)
      }

      // Organization + inbound DID are platform-settings fields, not part of
      // the create schema.
      const platform: HotelPlatformUpdate = {}
      if (organizationId === "__new__") {
        const org = await createOrganization({
          organization_id: slugify(newOrgName).slice(0, 63),
          display_name: newOrgName.trim(),
        })
        platform.organization_id = org.organization_id
      } else if (organizationId) {
        platform.organization_id = organizationId
      }
      if (inboundNumber.trim()) platform.inbound_phone_number = inboundNumber.trim()
      if (Object.keys(platform).length > 0) {
        await updateHotelPlatformSettings(id, platform)
      }

      await patchSetupProgress(id, {
        lines_mode: linesMode,
        step: "identity",
        status: "done",
      })
      router.replace(hotelSetupHref(id, "lines"))
    } catch (e) {
      setError(describeApiError(e))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <StepCard
        title="The property"
        description="The name callers hear, and the permanent ID this hotel is addressed by."
      >
        <Field label="Hotel name" htmlFor="displayName">
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Anchorage by the Sea"
          />
        </Field>
        <Field
          label="Hotel ID"
          htmlFor="hotelId"
          hint={
            <>
              Permanent — it forms this hotel&apos;s webhook URL and can never be changed.
              Lowercase letters, digits and underscores only.
            </>
          }
        >
          <Input
            id="hotelId"
            value={effectiveHotelId}
            onChange={(e) => {
              setHotelIdTouched(true)
              setHotelId(e.target.value)
            }}
            placeholder="anchorage_by_the_sea"
            className="font-mono"
          />
        </Field>
        <Field
          label="Organization"
          htmlFor="organizationId"
          hint="The management company this hotel belongs to. Users granted the organization see the hotel automatically."
        >
          <select
            id="organizationId"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            disabled={organizations === null}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-70"
          >
            <option value="">Independent (no organization)</option>
            {(organizations ?? []).map((org) => (
              <option key={org.organization_id} value={org.organization_id}>
                {org.display_name}
              </option>
            ))}
            <option value="__new__">Create new…</option>
          </select>
        </Field>
        {organizationId === "__new__" ? (
          <Field
            label="New organization name"
            htmlFor="newOrgName"
            hint={
              newOrgName.trim()
                ? `Will be created as ${slugify(newOrgName).slice(0, 63)}`
                : "A slug is derived from the name."
            }
          >
            <Input
              id="newOrgName"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Coastal Hospitality"
            />
          </Field>
        ) : null}
      </StepCard>

      <StepCard title="Locale and commercials">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Timezone" htmlFor="timezone">
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" htmlFor="currency" hint="ISO 4217, e.g. USD, EUR, GBP.">
            <Input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              className="font-mono uppercase"
            />
          </Field>
          <Field
            label="Guest-facing phone number"
            htmlFor="inboundNumber"
            hint="E.164. Shown to guests in booking emails as the number to call back. Optional."
          >
            <Input
              id="inboundNumber"
              value={inboundNumber}
              onChange={(e) => setInboundNumber(e.target.value)}
              placeholder="+14075551234"
            />
          </Field>
          <Field label="Max call length (minutes)" htmlFor="maxCallMinutes">
            <Input
              id="maxCallMinutes"
              inputMode="numeric"
              value={maxCallMinutes}
              onChange={(e) => setMaxCallMinutes(e.target.value.replace(/\D/g, ""))}
              placeholder="15"
            />
          </Field>
          <Field
            label="Commission rate (%)"
            htmlFor="commission"
            hint="Used by revenue reporting to project Resonata's share of attributed bookings."
          >
            <Input
              id="commission"
              inputMode="decimal"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              placeholder="10"
            />
          </Field>
        </div>
      </StepCard>

      <StepCard
        title="Which lines does this hotel run?"
        description="This decides which of the later steps apply."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {LINE_CHOICES.map((choice) => (
            <RadioCard
              key={choice.value}
              checked={linesMode === choice.value}
              onSelect={() => setLinesMode(choice.value)}
              label={choice.label}
              blurb={choice.blurb}
            />
          ))}
        </div>
        {salesOnly ? (
          <Notice>
            A sales-only hotel needs no PMS — it is created on the mock adapter and the
            reservations steps are skipped.
          </Notice>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Property management system</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {PMS_CHOICES.map((choice) => (
                <RadioCard
                  key={choice.value}
                  checked={pmsProvider === choice.value}
                  onSelect={() => setPmsProvider(choice.value)}
                  label={choice.label}
                  blurb={choice.blurb}
                />
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The PMS cannot be changed after the hotel is created — it is the one
              field this wizard can only set here.
            </p>
          </div>
        )}
      </StepCard>

      <StepCard
        title="First transfer destination"
        description="Every hotel needs at least one place to send a caller the agent can't help. Add the rest on the Voice persona step."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Department name" htmlFor="deptName">
            <Input
              id="deptName"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="Front Desk"
            />
          </Field>
          <Field label="Transfer number" htmlFor="deptPhone" hint="E.164, e.g. +14075551234.">
            <Input
              id="deptPhone"
              value={deptPhone}
              onChange={(e) => setDeptPhone(e.target.value)}
              placeholder="+14075551234"
            />
          </Field>
        </div>
        <Field
          label="When should calls transfer here?"
          htmlFor="deptRules"
          hint="Write the situations the way a guest would say them — one per line."
        >
          <Textarea
            id="deptRules"
            value={deptRules}
            onChange={(e) => setDeptRules(e.target.value)}
            rows={3}
          />
        </Field>
      </StepCard>

      {createdId ? (
        <Notice tone="warn">
          The hotel <span className="font-mono">{createdId}</span> was created, but a
          follow-up save failed. Fix the error and continue — the hotel will not be
          created twice.
        </Notice>
      ) : null}

      <StepNav
        hasBack={false}
        onNext={submit}
        saving={saving}
        error={error}
        nextLabel="Create hotel & continue"
      />
    </div>
  )
}

// ── Edit form (setup page, reachable from the review screen) ────────────────

export function IdentityStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext } = ctx
  const organizations = useOrganizations(true)

  const [displayName, setDisplayName] = React.useState(detail.display_name)
  const [timezone, setTimezone] = React.useState(detail.timezone)
  const [organizationId, setOrganizationId] = React.useState(detail.organization_id ?? "")
  const [inboundNumber, setInboundNumber] = React.useState(detail.inbound_phone_number ?? "")
  const [maxCallMinutes, setMaxCallMinutes] = React.useState(
    detail.max_call_minutes === null || detail.max_call_minutes === undefined
      ? ""
      : String(detail.max_call_minutes),
  )
  const [commissionPercent, setCommissionPercent] = React.useState(
    String((detail.commission_rate_basis_points ?? 1000) / 100),
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const save = async () => {
    if (inboundNumber.trim() && !E164_RE.test(inboundNumber.trim())) {
      setError("The guest-facing phone number must be E.164, e.g. +14075551234.")
      return
    }
    const bp = percentToBasisPoints(commissionPercent)
    if (bp === null) {
      setError("Commission must be a percentage between 0 and 100.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateHotelOperatorSettings(hotelId, {
        display_name: displayName.trim(),
        timezone,
        max_call_minutes: maxCallMinutes.trim() ? Number(maxCallMinutes) : null,
      })
      await updateHotelPlatformSettings(hotelId, {
        organization_id: organizationId || null,
        inbound_phone_number: inboundNumber.trim() || null,
        commission_rate_basis_points: bp,
      })
      await patchSetupProgress(hotelId, { step: "identity", status: "done" })
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
        title="Hotel identity"
        description={
          <>
            Hotel ID <span className="font-mono">{detail.hotel_id}</span> and PMS{" "}
            <span className="font-mono">{detail.pms_provider}</span> are fixed at creation
            and cannot be changed here.
          </>
        }
      >
        <Field label="Hotel name" htmlFor="editDisplayName">
          <Input
            id="editDisplayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Timezone" htmlFor="editTimezone">
            <select
              id="editTimezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map(
                (tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Organization" htmlFor="editOrganizationId">
            <select
              id="editOrganizationId"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              disabled={organizations === null}
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-70"
            >
              <option value="">Independent (no organization)</option>
              {(organizations ?? []).map((org) => (
                <option key={org.organization_id} value={org.organization_id}>
                  {org.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Guest-facing phone number" htmlFor="editInbound">
            <Input
              id="editInbound"
              value={inboundNumber}
              onChange={(e) => setInboundNumber(e.target.value)}
              placeholder="+14075551234"
            />
          </Field>
          <Field label="Max call length (minutes)" htmlFor="editMaxMinutes">
            <Input
              id="editMaxMinutes"
              inputMode="numeric"
              value={maxCallMinutes}
              onChange={(e) => setMaxCallMinutes(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Commission rate (%)" htmlFor="editCommission">
            <Input
              id="editCommission"
              inputMode="decimal"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
            />
          </Field>
          <Field label="Currency" htmlFor="editCurrency" hint="Set at creation.">
            <Input id="editCurrency" value={detail.currency} disabled className="font-mono" />
          </Field>
        </div>
      </StepCard>
      <StepNav
        onBack={ctx.goBack}
        hasBack={ctx.hasBack}
        onNext={save}
        saving={saving}
        error={error}
      />
    </div>
  )
}
