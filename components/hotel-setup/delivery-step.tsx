"use client"

// Step 6 — how the guest receives the link. The sender address is what the
// booking-link email comes from; a Twilio number is what makes the agent ask
// "emailed or texted?" instead of assuming email.

import * as React from "react"

import { Input } from "@/components/ui/input"
import {
  patchSetupProgress,
  updateHotelOperatorSettings,
  updateHotelPlatformSettings,
} from "@/lib/api"

import {
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  type StepContext,
} from "./shared"

const E164_RE = /^\+[1-9]\d{9,14}$/

// The column stores one RFC 5322 string; the form edits the two halves.
function splitEmailFrom(value: string | null | undefined): { name: string; email: string } {
  const v = (value ?? "").trim()
  if (!v) return { name: "", email: "" }
  const m = v.match(/^(.*?)<([^>]+)>\s*$/)
  if (!m) return { name: "", email: v }
  let name = m[1].trim()
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\(["\\])/g, "$1")
  }
  return { name, email: m[2].trim() }
}

function composeEmailFrom(name: string, email: string): string | null {
  const e = email.trim()
  if (!e) return null
  const n = name.trim()
  if (!n) return e
  const display = /[(),:;<>@[\]\\"]/.test(n) ? `"${n.replace(/(["\\])/g, "\\$1")}"` : n
  return `${display} <${e}>`
}

export function DeliveryStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext, goBack, hasBack } = ctx
  const initial = splitEmailFrom(detail.email_from)
  const [senderName, setSenderName] = React.useState(initial.name)
  const [senderEmail, setSenderEmail] = React.useState(initial.email)
  const [twilioFrom, setTwilioFrom] = React.useState(detail.twilio_from_number ?? "")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const finish = async (status: "done" | "skipped") => {
    if (status === "done" && twilioFrom.trim() && !E164_RE.test(twilioFrom.trim())) {
      setError("The text-message sender must be E.164, e.g. +13602180737.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (status === "done") {
        await updateHotelOperatorSettings(hotelId, {
          email_from: composeEmailFrom(senderName, senderEmail),
        })
        await updateHotelPlatformSettings(hotelId, {
          twilio_from_number: twilioFrom.trim() || null,
        })
      }
      await patchSetupProgress(hotelId, { step: "delivery", status })
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
        title="Guest delivery"
        description="Who the booking link comes from, and whether the guest can choose a text instead of an email."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Sender name"
            htmlFor="senderName"
            hint="The friendly name guests see in their inbox."
          >
            <Input
              id="senderName"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Anchorage by the Sea"
            />
          </Field>
          <Field label="Sender email address" htmlFor="senderEmail">
            <Input
              id="senderEmail"
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="reservations@example.com"
            />
          </Field>
        </div>
        <Field
          label="Text message sender number"
          htmlFor="twilioFrom"
          hint="A Twilio number, E.164. With one set the agent offers the caller email or text; leave it blank and links are emailed only. The Twilio account credentials must also be configured on the server."
        >
          <Input
            id="twilioFrom"
            value={twilioFrom}
            onChange={(e) => setTwilioFrom(e.target.value)}
            placeholder="+13602180737"
          />
        </Field>
        <Notice>
          The sending domain has to be verified with Resend before real guest email
          goes out — that part happens outside this app.
        </Notice>
      </StepCard>
      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={() => finish("done")}
        onSkip={() => finish("skipped")}
        saving={saving}
        error={error}
      />
    </div>
  )
}
