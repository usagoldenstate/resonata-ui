"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Loader2, RefreshCw, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  ApiError,
  fetchLeadDeliveryDiagnostics,
  retryLeadDelivery,
  type LeadDeliveryDiagnostics,
  type LeadDeliveryState,
} from "@/lib/api"
import {
  LEAD_CREATION_CAVEAT,
  leadBadgeLabel,
  leadCanRetry,
  leadReasonText,
} from "@/lib/lead-delivery-labels"

const TONE = {
  pending: "border-border bg-muted text-muted-foreground",
  sending: "border-border bg-muted text-muted-foreground",
  submitted: "border-success/30 bg-success/10 text-success",
  failed: "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  gave_up: "border-destructive/30 bg-destructive/10 text-destructive",
  needs_review: "border-destructive/30 bg-destructive/10 text-destructive",
  skipped: "border-border bg-muted text-muted-foreground",
} as const

function BadgeIcon({ status }: { status: LeadDeliveryState["status"] }) {
  if (status === "submitted") return <CheckCircle2 className="size-3.5" />
  if (status === "gave_up" || status === "needs_review") return <AlertTriangle className="size-3.5" />
  if (status === "sending") return <Send className="size-3.5" />
  return <Clock3 className="size-3.5" />
}

export function LeadDeliveryBadge({ state }: { state: LeadDeliveryState }) {
  const label = leadBadgeLabel(state)
  if (!label) return null
  return <span title={label} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[state.status]}`}>
    <BadgeIcon status={state.status} />
    <span className="truncate">{label}</span>
  </span>
}

function errorText(cause: unknown): string {
  if (cause instanceof ApiError && cause.body && typeof cause.body === "object") {
    const detail = (cause.body as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
  }
  return "Something went wrong. Try again."
}

function Diagnostics({ data, format }: { data: LeadDeliveryDiagnostics; format: (value: string | null) => string }) {
  return <div className="mt-3 space-y-2 rounded-lg bg-muted p-3 text-xs">
    <p className="break-all"><span className="text-muted-foreground">Org ID: </span>{String(data.destination.org_id ?? "—")}</p>
    <p className="break-all"><span className="text-muted-foreground">Call: </span>{data.provider_call_id}</p>
    {data.has_late_submission && <p className="text-destructive">A later submission arrived after sending began. It was not sent.</p>}
    {data.processing_failures > 0 && <p>
      Preparation failures: {data.processing_failures}. Error type: {data.processing_error_class ?? "unknown"}.
      These are separate from send attempts.
    </p>}
    {data.attempts.length === 0 ? <p className="text-muted-foreground">No send attempts yet.</p> : <ol className="space-y-1">
      {data.attempts.map(attempt => <li key={attempt.id} className="flex flex-wrap gap-x-2">
        <span className="font-medium">#{attempt.attempt_number}</span>
        <span>{attempt.outcome.replaceAll("_", " ")}</span>
        {attempt.error_class && <span className="text-muted-foreground">{attempt.error_class}</span>}
        <span className="text-muted-foreground">{format(attempt.started_at)}</span>
      </li>)}
    </ol>}
  </div>
}

// The detail panel's card. Hotel users get the safe status; platform admins
// also get the attempt ledger and the retry action. The retry only queues the
// delivery: the next run still has to pass every check, so there is no way to
// force an unclassified inquiry out from here.
export function LeadDeliveryPanel({ hotelId, state, isPlatformAdmin, format, onChanged }: {
  hotelId: string
  state: LeadDeliveryState
  isPlatformAdmin: boolean
  format: (value: string | null) => string
  onChanged: () => void
}) {
  const [diagnostics, setDiagnostics] = useState<LeadDeliveryDiagnostics | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const reason = leadReasonText(state.reason)
  const deliveryId = state.delivery_id

  const toggleDiagnostics = async () => {
    if (open) return setOpen(false)
    if (!deliveryId) return
    setBusy(true)
    try {
      setDiagnostics(await fetchLeadDeliveryDiagnostics(hotelId, deliveryId))
      setOpen(true)
    } catch (cause) {
      toast.error(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    if (!deliveryId) return
    setBusy(true)
    try {
      setDiagnostics(await retryLeadDelivery(hotelId, deliveryId))
      toast.success("Queued. It goes out on the next delivery run if every check passes.")
      onChanged()
    } catch (cause) {
      toast.error(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return <div className="rounded-xl border bg-card p-3.5 shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">{state.provider_label} lead</p>
      <LeadDeliveryBadge state={state} />
    </div>
    {state.status === "sending" && <p className="mt-2 text-xs text-muted-foreground">Request in progress.</p>}
    {state.status === "submitted" && <p className="mt-2 text-xs text-muted-foreground">
      Submitted {format(state.submitted_at)}. {LEAD_CREATION_CAVEAT}
    </p>}
    {state.status === "failed" && <p className="mt-2 text-xs text-muted-foreground">
      Next retry {format(state.next_attempt_at)}. The email to your sales team is tracked separately.
    </p>}
    {state.status === "gave_up" && <p className="mt-2 text-xs text-muted-foreground">
      Automatic attempts are used up. A platform admin can retry after checking the cause.
    </p>}
    {reason && <p className="mt-2 text-xs text-muted-foreground">{reason}</p>}
    {isPlatformAdmin && deliveryId && <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void toggleDiagnostics()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
        Diagnostics
      </Button>
      {leadCanRetry(state.status) && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void retry()}>
        <RefreshCw className="size-3.5" />Retry
      </Button>}
    </div>}
    {open && diagnostics && <Diagnostics data={diagnostics} format={format} />}
  </div>
}
