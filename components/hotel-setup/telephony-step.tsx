"use client"

// Step 10 — record the number the AI agent answers on for each line.
//
// Calls reach Resonata over a Twilio Elastic SIP trunk into LiveKit, and each
// call is matched to a hotel + line by the number dialed. So one number is one
// line of one hotel: the backend 409s a number another hotel holds and 422s the
// same number on both lines. There is no per-hotel URL or secret to hand over;
// what's left happens in the Twilio console and the LiveKit telephony
// provisioning, which the setup checklist ("Outside this app") lists.
//
// This is also where the SALES LINE is switched on, in the same PATCH that
// saves its number: the backend refuses `sales_line_enabled` without a
// `sales_agent_phone_number`, because an enabled sales line with no number
// never rings — activating the hotel would ship a sales line that answers
// nothing.

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  ApiError,
  patchSetupProgress,
  updateHotelPlatformSettings,
  type HotelPlatformUpdate,
} from "@/lib/api"

import {
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  includesReservations,
  includesSales,
  type StepContext,
} from "./shared"

// Same check as the other wizard steps; the backend normalizes and re-validates.
const E164_RE = /^\+[1-9]\d{9,14}$/

export function TelephonyStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, linesMode, reload, goNext, goBack, hasBack } = ctx

  const [reservationsNumber, setReservationsNumber] = React.useState(
    detail.agent_phone_number ?? "",
  )
  const [salesNumber, setSalesNumber] = React.useState(detail.sales_agent_phone_number ?? "")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const salesEnabled = detail.sales_line_enabled
  const salesPending = includesSales(linesMode) && !salesEnabled

  // Skipping writes nothing, so only a line with no saved number is affected.
  const skipWarnings: string[] = []
  if (includesReservations(linesMode) && !detail.agent_phone_number) {
    skipWarnings.push(
      "Skipping leaves the reservations line without a number: no calls reach this hotel's reservations agent until one is set.",
    )
  }
  if (salesPending) {
    skipWarnings.push(
      skipWarnings.length > 0
        ? "It also leaves the sales line switched off — it cannot be enabled until its number is set."
        : "Skipping leaves the sales line switched off — it cannot be enabled until its number is set.",
    )
  }

  const validate = (): string | null => {
    const reservations = includesReservations(linesMode) ? reservationsNumber.trim() : ""
    const sales = includesSales(linesMode) ? salesNumber.trim() : ""
    if (reservations && !E164_RE.test(reservations)) {
      return "The reservations agent number must be E.164, e.g. +14075551234."
    }
    if (sales && !E164_RE.test(sales)) {
      return "The sales agent number must be E.164, e.g. +14075551234."
    }
    if (reservations && reservations === sales) {
      return "The reservations and sales agent numbers must differ — one number is one line."
    }
    return null
  }

  const finish = async (status: "done" | "skipped") => {
    if (status === "done") {
      const problem = validate()
      if (problem) {
        setError(problem)
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      if (status === "done") {
        const body: HotelPlatformUpdate = {}
        if (includesReservations(linesMode)) {
          body.agent_phone_number = reservationsNumber.trim() || null
        }
        if (includesSales(linesMode)) {
          body.sales_agent_phone_number = salesNumber.trim() || null
          // One PATCH: the number and the switch land together, which is the
          // only ordering the backend accepts. With no number yet, the line
          // stays off rather than failing the save.
          if (salesNumber.trim()) body.sales_line_enabled = true
        }
        await updateHotelPlatformSettings(hotelId, body)
      }
      await patchSetupProgress(hotelId, { step: "telephony", status })
      await reload()
      goNext()
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setError(
          "The server is missing the sales follow-up link key (SALES_FOLLOW_UP_LINK_KEY). " +
            "Set it on the backend and retry — the sales line cannot be enabled without it.",
        )
      } else {
        setError(describeApiError(e))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {includesReservations(linesMode) ? (
        <StepCard
          title="Reservations number"
          description="The phone number the AI agent answers for reservations. Calls to it come in through the LiveKit SIP trunk and are matched to this hotel by the number dialed."
        >
          <Field
            label="Reservations agent number"
            htmlFor="agentPhoneNumber"
            hint="E.164. It can belong to only one hotel, and can differ from the guest-facing number when the hotel forwards its own line here. A wrong number means callers reach no one — make a test call after saving."
          >
            <Input
              id="agentPhoneNumber"
              type="tel"
              value={reservationsNumber}
              onChange={(e) => setReservationsNumber(e.target.value)}
              placeholder="+14075551234"
              className="font-mono"
            />
          </Field>
        </StepCard>
      ) : null}

      {includesSales(linesMode) ? (
        <StepCard
          title={
            <span className="flex items-center gap-2">
              Sales intake number
              {salesEnabled ? (
                <Badge
                  variant="outline"
                  className="border-emerald-300 text-[10px] text-emerald-700 dark:border-emerald-900 dark:text-emerald-400"
                >
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Not enabled yet
                </Badge>
              )}
            </span>
          }
          description="The number the sales department's phone system forwards unanswered calls to. The AI agent answers it as this hotel's sales intake line."
        >
          <Field
            label="Sales agent number"
            htmlFor="salesAgentPhoneNumber"
            hint="E.164, and must differ from the reservations number. Saving it is what turns the sales line on — the backend refuses to enable the line without its number."
          >
            <Input
              id="salesAgentPhoneNumber"
              type="tel"
              value={salesNumber}
              onChange={(e) => setSalesNumber(e.target.value)}
              placeholder="+14075551234"
              className="font-mono"
            />
          </Field>
          {salesPending ? (
            <Notice tone="warn">
              The sales line is <strong>off</strong>. It switches on when you save this
              step with the number filled in; until then calls to the sales number
              aren&apos;t answered and no inquiries are taken.
            </Notice>
          ) : null}
        </StepCard>
      ) : null}

      <StepCard title="If the number is a Twilio number">
        <p className="text-xs leading-relaxed text-muted-foreground">
          In the Twilio console, assign the number to the Elastic SIP trunk that routes calls
          to LiveKit (Elastic SIP Trunking → the LiveKit trunk → Numbers). Assigning it to the
          trunk replaces the number&apos;s Voice webhook. That trunk is shared by every hotel
          and must have Call Transfer (SIP REFER) enabled so the agent can transfer callers to
          the hotel&apos;s departments. The agent plays the recording disclosure itself, before
          its greeting.
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A new number also has to be added to LiveKit: re-run the LiveKit telephony
          provisioning after saving it (and after removing a number). Moving a number that is
          already set up between lines needs no provisioning — calls follow the saved
          assignment. The exact steps are listed under &ldquo;Outside this app&rdquo; on the
          Review step.
        </p>
      </StepCard>

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={() => finish("done")}
        onSkip={() => finish("skipped")}
        saving={saving}
        error={error}
      />
      {skipWarnings.length > 0 ? <Notice tone="warn">{skipWarnings.join(" ")}</Notice> : null}
    </div>
  )
}
