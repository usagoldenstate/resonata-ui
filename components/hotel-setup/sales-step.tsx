"use client"

// Step 7 — the sales intake line's intake details: where inquiries are sent
// and who can be credited with following one up.
//
// This step deliberately does NOT switch the line on. The backend refuses
// `sales_line_enabled` without a `sales_vapi_phone_number_id`, because the
// tenant-binding guard is mismatch-only: with no binding on file, any Vapi
// number presenting the webhook secret would be served this hotel's sales
// assistant. The switch therefore lives on the Telephony step, next to the
// binding it depends on.

import * as React from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
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

export function SalesStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext, goBack, hasBack } = ctx
  const [email, setEmail] = React.useState(detail.sales_inquiry_email ?? "")
  const [reps, setReps] = React.useState<string[]>(detail.sales_rep_names ?? [])
  const [repDraft, setRepDraft] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const addRep = () => {
    const name = repDraft.trim()
    if (!name) return
    if (reps.some((r) => r.toLowerCase() === name.toLowerCase())) {
      setRepDraft("")
      return
    }
    setReps([...reps, name])
    setRepDraft("")
  }

  const save = async () => {
    if (!email.trim()) {
      setError("A sales inquiry email is required — the intake has nowhere to send inquiries otherwise.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateHotelOperatorSettings(hotelId, { sales_rep_names: reps })
      await updateHotelPlatformSettings(hotelId, {
        sales_inquiry_email: email.trim(),
      })
      await patchSetupProgress(hotelId, { step: "sales", status: "done" })
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
        title="Sales intake line"
        description="A second number that answers when the sales department doesn't. The agent takes a short structured intake, records the inquiry, and emails it."
      >
        <Field
          label="Sales inquiry email"
          htmlFor="salesEmail"
          hint="Where each recorded inquiry is sent (Reply-To is the caller). Usually a shared sales mailbox."
        >
          <Input
            id="salesEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sales@example.com"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Sales team</p>
          <div className="flex flex-wrap gap-1.5">
            {reps.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs"
              >
                {name}
                <button
                  type="button"
                  onClick={() => setReps(reps.filter((r) => r !== name))}
                  aria-label={`Remove ${name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {reps.length === 0 ? (
              <span className="text-xs text-muted-foreground">No names yet.</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              value={repDraft}
              onChange={(e) => setRepDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addRep()
                }
              }}
              placeholder="Maria Santos"
              className="max-w-xs"
            />
            <Button type="button" variant="outline" onClick={addRep}>
              Add
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The notification email goes to a shared mailbox, so whoever follows up picks
            their name from this list on the no-login &ldquo;Update inquiry&rdquo; page and the
            inquiry is assigned to them. Editable later under Settings → Sales Team.
          </p>
        </div>

        <Notice>
          The sales line is switched on in the Telephony step, once its Vapi number is
          bound.
        </Notice>
      </StepCard>
      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={save}
        saving={saving}
        error={error}
        nextLabel="Save & continue"
      />
    </div>
  )
}
