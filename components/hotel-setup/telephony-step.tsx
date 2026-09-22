"use client"

// Step 10 — bind each line's Vapi number to this tenant and hand over the
// exact values to paste into the Vapi dashboard.
//
// The webhook secret is shown exactly once: only its SHA-256 hash is stored.
// Between the rotate and pasting it into Vapi, that hotel's calls 401 — so
// the warning is not decoration.
//
// This is also where the SALES LINE is switched on, in the same PATCH that
// saves its binding: the backend refuses `sales_line_enabled` without a
// `sales_vapi_phone_number_id`, because with no binding on file any Vapi
// number presenting the shared webhook secret would be served this hotel's
// sales assistant.

import * as React from "react"
import { KeyRound, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ApiError,
  apiBaseUrl,
  patchSetupProgress,
  rotateVapiWebhookSecret,
  updateHotelPlatformSettings,
  type HotelPlatformUpdate,
} from "@/lib/api"

import {
  CopyBox,
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  includesReservations,
  includesSales,
  type StepContext,
} from "./shared"

export function TelephonyStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, linesMode, reload, goNext, goBack, hasBack } = ctx
  const base = apiBaseUrl() || "<API base URL>"

  const [reservationsId, setReservationsId] = React.useState(
    detail.vapi_phone_number_id ?? "",
  )
  const [salesId, setSalesId] = React.useState(detail.sales_vapi_phone_number_id ?? "")
  const [secret, setSecret] = React.useState<string | null>(null)
  const [rotating, setRotating] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const rotate = async () => {
    setRotating(true)
    setError(null)
    try {
      const res = await rotateVapiWebhookSecret(hotelId)
      setSecret(res.vapi_webhook_secret)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setRotating(false)
    }
  }

  const salesEnabled = detail.sales_line_enabled
  const salesPending = includesSales(linesMode) && !salesEnabled

  const finish = async (status: "done" | "skipped") => {
    setSaving(true)
    setError(null)
    try {
      if (status === "done") {
        const body: HotelPlatformUpdate = {}
        if (includesReservations(linesMode)) {
          body.vapi_phone_number_id = reservationsId.trim() || null
        }
        if (includesSales(linesMode)) {
          body.sales_vapi_phone_number_id = salesId.trim() || null
          // One PATCH: the binding and the switch land together, which is the
          // only ordering the backend accepts. With no id yet, the line stays
          // off rather than failing the save.
          if (salesId.trim()) body.sales_line_enabled = true
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
          description="In the Vapi dashboard: Phone Numbers → pick the number → copy its ID, and set its Server URL to the address below."
        >
          <Field
            label="Vapi phone number ID"
            htmlFor="vapiId"
            hint="When set, webhooks arriving from any other Vapi number are rejected. A wrong value blocks this hotel's calls — make a test call after saving."
          >
            <Input
              id="vapiId"
              value={reservationsId}
              onChange={(e) => setReservationsId(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              className="font-mono"
            />
          </Field>
          <CopyBox label="Server URL" value={`${base}/webhooks/vapi/${hotelId}`} />
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
          description="A second Vapi number, same Server URL Secret, with /sales appended to the Server URL."
        >
          <Field
            label="Sales Vapi phone number ID"
            htmlFor="salesVapiId"
            hint="Must differ from the reservations number's ID. Saving this is what turns the sales line on — the backend refuses to enable it without the binding, since an unbound line would answer for any number carrying the webhook secret."
          >
            <Input
              id="salesVapiId"
              value={salesId}
              onChange={(e) => setSalesId(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              className="font-mono"
            />
          </Field>
          <CopyBox label="Server URL" value={`${base}/webhooks/vapi/${hotelId}/sales`} />
          {salesPending ? (
            <Notice tone="warn">
              The sales line is <strong>off</strong>. It switches on when you save this
              step with the number id filled in; until then the sales webhook path 404s
              and no inquiries are taken.
            </Notice>
          ) : null}
        </StepCard>
      ) : null}

      <StepCard
        title="Webhook secret"
        description="Both lines share one Server URL Secret. Generating a new one takes effect immediately."
      >
        <Button type="button" variant="outline" onClick={rotate} disabled={rotating}>
          <KeyRound className="mr-2 h-4 w-4" />
          {rotating ? "Generating…" : "Generate webhook secret"}
        </Button>
        {secret ? (
          <div className="space-y-2">
            <Notice tone="warn">
              <span className="inline-flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Shown once — only its hash is stored, so this value cannot be recovered.
                  Paste it into <strong>every</strong> one of this hotel&apos;s Vapi numbers
                  as the Server URL Secret now: calls 401 until you do.
                </span>
              </span>
            </Notice>
            <CopyBox label="Server URL Secret" value={secret} />
          </div>
        ) : null}
      </StepCard>

      <StepCard title="If the number is a Twilio number">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Point its Voice webhook at Vapi&apos;s inbound endpoint rather than at Resonata —
          Vapi runs the call and announces the recording consent itself.
        </p>
        <CopyBox value="https://api.vapi.ai/twilio/inbound_call" />
      </StepCard>

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={() => finish("done")}
        onSkip={() => finish("skipped")}
        saving={saving}
        error={error}
      />
      <Notice tone="warn">
        Skipping leaves the tenant binding off: any Vapi number carrying the shared secret
        can write calls into this hotel.
        {salesPending
          ? " It also leaves the sales line switched off — it cannot be enabled until its number is bound."
          : ""}
      </Notice>
    </div>
  )
}
