"use client"

/**
 * The page behind the "Update inquiry" button in the sales notification email.
 *
 * Public by design (proxy.ts lists /inquiry as unauthenticated): the email
 * goes to a shared sales mailbox whose readers have no Resonata account. The
 * signed token in the URL is the whole authorization and covers exactly this
 * one inquiry.
 *
 * Built for a phone held one-handed after a call: the caller's number is the
 * biggest tap target on the screen, the four outcomes are radio cards rather
 * than a dropdown, and nothing is written until Save is pressed.
 */

import { use, useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareText,
  Phone,
  Users,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ApiError,
  fetchPublicSalesInquiry,
  logPublicSalesUpdate,
  type PublicSalesInquiry,
  type SalesFollowUpOutcome,
} from "@/lib/api"

function timestamp(value: string) {
  // SQLite fixtures return naive UTC; production returns timezone-aware dates.
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(normalized))
}

// The caller's words lead; the parsed figure rides in parentheses when it adds
// something. Most callers hedge ("we're flexible"), so text-only is normal.
function budget(inquiry: PublicSalesInquiry): string | null {
  const amount =
    inquiry.budget_amount === null
      ? null
      : Number(inquiry.budget_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (!amount) return inquiry.budget_text
  return inquiry.budget_text ? `${inquiry.budget_text} (${amount})` : amount
}

function stayDates(inquiry: PublicSalesInquiry) {
  const parsed = [inquiry.event_start_date, inquiry.event_end_date !== inquiry.event_start_date ? inquiry.event_end_date : null]
    .filter(Boolean)
    .join(" – ")
  const base = inquiry.event_dates_text || parsed || "Dates not provided"
  return `${base}${inquiry.dates_flexible ? " · Flexible" : ""}`
}

function Detail({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <span className="mt-0.5 shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
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
  // Never authoritative: the server still validates against the roster.
  useEffect(() => {
    if (!data || rep) return
    let remembered: string | null = null
    try {
      remembered = window.localStorage.getItem("resonata.sales_rep_name")
    } catch {
      // Private browsing / blocked storage — just start with nobody selected.
    }
    setRep(data.assigned_rep || (remembered && data.sales_reps.includes(remembered) ? remembered : ""))
  }, [data, rep])

  const history = useMemo(() => [...(data?.activity ?? [])].reverse(), [data])

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
          <h1 className="mt-1 text-xl font-semibold">Sales inquiry follow-up</h1>
        </header>

        {/* Who called and what they want — enough to know which inquiry this
            is without opening the original email again. */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{data.caller_name || "Caller"}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{data.event_type}</p>
            </div>
            <span className="shrink-0 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium">
              {data.follow_up_status_label}
            </span>
          </div>

          {data.callback_phone_e164 && (
            <a
              href={`tel:${data.callback_phone_e164}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-base font-semibold text-background"
            >
              <Phone className="size-4" />
              {data.callback_phone_e164}
            </a>
          )}

          <div className="mt-4 space-y-2 border-t pt-4">
            <Detail icon={<CalendarDays className="size-4" />}>{stayDates(data)}</Detail>
            {data.headcount !== null && (
              <Detail icon={<Users className="size-4" />}>{data.headcount} people</Detail>
            )}
            {budget(data) && <Detail icon={<Wallet className="size-4" />}>{budget(data)}</Detail>}
            {data.needs_guest_rooms !== null && (
              <Detail icon={<BedDouble className="size-4" />}>
                {data.needs_guest_rooms ? "Needs guest rooms" : "No guest rooms needed"}
              </Detail>
            )}
            {data.email && <Detail icon={<MessageSquareText className="size-4" />}>{data.email}</Detail>}
            <Detail icon={<Clock3 className="size-4" />}>Called {timestamp(data.created_at)}</Detail>
            {data.notes && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg border-l-2 border-muted-foreground/30 bg-muted/50 px-3 py-2 text-sm">
                {data.notes}
              </p>
            )}
          </div>
        </section>

        {/* The update form. Nothing here is written until Save. */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold">Log an update</h2>

          {noRoster ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No sales team names are set up for this hotel yet. Add them in Resonata under
              Settings → Sales team, then reload this page.
            </p>
          ) : (
            <>
              <label className="mt-4 block text-sm font-medium" htmlFor="rep">
                Who are you?
              </label>
              <select
                id="rep"
                value={rep}
                onChange={(e) => {
                  setRep(e.target.value)
                  setSaved(false)
                }}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select your name…</option>
                {data.sales_reps.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

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

              {saveError && (
                <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {saveError}
                </p>
              )}
              {saved && !saveError && (
                <p className="mt-3 flex items-center gap-2 text-sm text-[#6b7a4a]">
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

        {/* Everything logged so far, newest first — attempts and notes stay
            visible so the next person picks up where the last one left off. */}
        {history.length > 0 && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Activity</h2>
            <ol className="mt-3 space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-xl border bg-background p-3.5">
                  <p className="text-sm font-medium">{item.text}</p>
                  {item.note && (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {item.note}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.actor}
                    <span className="mx-1.5">·</span>
                    {timestamp(item.at)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="px-1 pb-4 text-center text-xs text-muted-foreground">
          Resonata sales intake for {data.hotel_display_name}
        </p>
      </div>
    </main>
  )
}
