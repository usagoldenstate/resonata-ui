"use client"

/**
 * The page behind the "Log follow-up outcome" button in the sales email.
 *
 * Public by design (proxy.ts lists /inquiry as unauthenticated): the email
 * goes to a shared sales mailbox whose readers have no Resonata account. The
 * signed token in the URL is the whole authorization and covers exactly this
 * one inquiry.
 *
 * These links leak, so the API sends no caller details, event details, notes
 * or activity. Salespeople read the inquiry in the email and log the outcome
 * here; the reference and received time match this page to that email.
 *
 * Built for a phone held one-handed after a call: the four outcomes are radio
 * cards rather than a dropdown, and nothing is written until Save is pressed.
 */

import { use, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Check, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OptionSelect } from "@/components/ui/option-select"
import { Textarea } from "@/components/ui/textarea"
import {
  ApiError,
  fetchPublicSalesInquiry,
  logPublicSalesUpdate,
  type SalesFollowUpOutcome,
} from "@/lib/api"

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  )
}

export default function InquiryFollowUpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const { data, error, isLoading, mutate } = useSWR(
    ["public-inquiry", token],
    () => fetchPublicSalesInquiry(token),
    { revalidateOnFocus: false },
  )

  const [rep, setRep] = useState("")
  const [outcome, setOutcome] = useState<SalesFollowUpOutcome | "">("")
  const [voicemail, setVoicemail] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Remember who they are between visits — the same person usually works the
  // mailbox, and re-picking a name on every voicemail is friction for nothing.
  // The name answers "who is viewing", so it comes only from this browser's
  // own earlier pick, never from the inquiry's assignee: the mailbox is
  // shared, and prefilling the owner would log Bob's call as Alice's. No
  // remembered name (or one since removed from the roster) → pick explicitly.
  // Initialized once, so clearing the picker doesn't snap it back.
  // Never authoritative: the server still validates against the roster.
  const repInitialized = useRef(false)
  useEffect(() => {
    if (!data || repInitialized.current) return
    repInitialized.current = true
    let remembered: string | null = null
    try {
      remembered = window.localStorage.getItem("resonata.sales_rep_name")
    } catch {
      // Private browsing / blocked storage — just start with nobody selected.
    }
    if (remembered && data.sales_reps.includes(remembered)) setRep(remembered)
  }, [data])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (error || !data) {
    const gone = error instanceof ApiError && error.status === 404
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-3 size-7 text-amber-500" />
          <h1 className="text-lg font-semibold">
            {gone ? "This link is no longer valid" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {gone
              ? "Ask the hotel to resend the inquiry, or open it from the Resonata dashboard."
              : "We couldn't load this inquiry. Check your connection and try again."}
          </p>
        </div>
      </main>
    )
  }

  const canSave = Boolean(rep) && Boolean(outcome) && !saving
  const noRoster = data.sales_reps.length === 0

  async function save() {
    if (!data || !outcome || !rep) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await logPublicSalesUpdate(token, {
        version: data.version,
        rep_name: rep,
        outcome,
        left_voicemail: outcome === "call_attempted" && voicemail,
        note: note.trim() || undefined,
      })
      try {
        window.localStorage.setItem("resonata.sales_rep_name", rep)
      } catch {
        // Storage unavailable — the save itself still went through.
      }
      await mutate(updated, { revalidate: false })
      setOutcome("")
      setVoicemail(false)
      setNote("")
      setSaved(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Someone else logged an update from the same mailbox in the meantime.
        setSaveError(
          (err.body as { detail?: string })?.detail ??
            "This inquiry was updated elsewhere. Reload the page.",
        )
        await mutate()
      } else {
        setSaveError("We couldn't save that. Please try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <header className="px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {data.hotel_display_name}
          </p>
          <h1 className="mt-1 text-xl font-semibold">Log follow-up outcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The caller&apos;s details are in the sales email.
          </p>
        </header>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <dl className="space-y-2.5">
            <Fact label="Reference">{data.reference}</Fact>
            <Fact label="Received">{data.received_at_human}</Fact>
            <Fact label="Status">{data.follow_up_status_label}</Fact>
            <Fact label="Assigned to">{data.assigned_rep || "Unassigned"}</Fact>
          </dl>
        </section>

        {/* The update form. Nothing here is written until Save. */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold">Log an update</h2>

          {noRoster ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No sales team names are set up for this hotel yet. Add them in Resonata under
              Settings → Team, then reload this page.
            </p>
          ) : (
            <>
              <label className="mt-4 block text-sm font-medium" htmlFor="rep">
                Who are you?
              </label>
              <OptionSelect
                id="rep"
                value={rep}
                onValueChange={(v) => {
                  setRep(v)
                  setSaved(false)
                }}
                placeholder="Select your name…"
                className="mt-1.5 h-11 rounded-lg text-base"
                options={data.sales_reps.map((name) => ({ value: name, label: name }))}
              />
              {data.assigned_rep && rep && rep !== data.assigned_rep && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Assigned to {data.assigned_rep}. Saving assigns it to you.
                </p>
              )}

              <fieldset className="mt-5">
                <legend className="text-sm font-medium">What happened?</legend>
                <div className="mt-1.5 space-y-2">
                  {data.outcomes.map((option) => {
                    const active = outcome === option.value
                    return (
                      <div key={option.value}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setOutcome(option.value)
                            setSaved(false)
                            if (option.value !== "call_attempted") setVoicemail(false)
                          }}
                          className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-base transition-colors ${
                            active
                              ? "border-foreground bg-foreground/5 font-medium"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          {option.label}
                          {active && <Check className="size-4 shrink-0" />}
                        </button>
                        {option.value === "call_attempted" && active && (
                          <label className="mt-2 flex items-center gap-2.5 rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
                            <input
                              type="checkbox"
                              checked={voicemail}
                              onChange={(e) => setVoicemail(e.target.checked)}
                              className="size-4 rounded border-input"
                            />
                            Left voicemail
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              </fieldset>

              <label className="mt-5 block text-sm font-medium" htmlFor="note">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  setSaved(false)
                }}
                maxLength={4000}
                rows={3}
                placeholder="Interested, but needs to confirm dates with their partner."
                className="mt-1.5 text-base"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Your note will be saved. Earlier notes aren&apos;t shown here.
              </p>

              {saveError && (
                <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {saveError}
                </p>
              )}
              {saved && !saveError && (
                <p className="mt-3 flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Update saved. You can log another any time from the same email link.
                </p>
              )}

              <Button onClick={save} disabled={!canSave} className="mt-4 h-11 w-full text-base">
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Save update"}
              </Button>
            </>
          )}
        </section>

        <p className="px-1 pb-4 text-center text-xs text-muted-foreground">
          Resonata sales intake for {data.hotel_display_name}
        </p>
      </div>
    </main>
  )
}
