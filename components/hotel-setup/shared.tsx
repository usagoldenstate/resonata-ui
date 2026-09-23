"use client"

// Shared scaffolding for the new-hotel setup wizard.
//
// Every step is a small card with a Next/Back footer; "Next" is what triggers
// the save, so a step's work is always persisted server-side before the
// wizard moves on. That is what makes the wizard resumable: reopening it
// re-reads GET /setup and jumps to the first incomplete step.

import * as React from "react"
import { Check, Loader2, SkipForward } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  ApiError,
  type HotelDetail,
  type LinesMode,
  type SetupStatus,
  type SetupStepKey,
  type SetupStepStatus,
} from "@/lib/api"

// The wizard's own step order. `identity` is filled by the create form on the
// landing view but stays navigable afterwards so the review screen's "Edit"
// links work. `review` is UI-only — the backend has no step key for it.
export type WizardStep = SetupStepKey | "review"

export const WIZARD_STEPS: WizardStep[] = [
  "identity",
  "lines",
  "pms",
  "catalog",
  "reservation_flow",
  "delivery",
  "sales",
  "persona",
  "knowledge",
  "telephony",
  "access",
  "review",
]

export const STEP_LABELS: Record<WizardStep, string> = {
  identity: "Hotel identity",
  lines: "Phone lines",
  pms: "PMS connection",
  catalog: "Room catalog",
  reservation_flow: "Reservation flow",
  delivery: "Guest delivery",
  sales: "Sales intake",
  persona: "Voice persona",
  knowledge: "Knowledge base",
  telephony: "Telephony",
  access: "Team access",
  review: "Review & activate",
}

export function isWizardStep(value: string | null): value is WizardStep {
  return value !== null && (WIZARD_STEPS as string[]).includes(value)
}

// The wizard lives in a Dev Pages tab, not on a route of its own, so every
// link to it (resume, review "Edit", Settings' setup-health card) is built
// here rather than hand-assembled at each call site.
export function hotelSetupHref(hotelId?: string, step?: WizardStep): string {
  const params = new URLSearchParams({ tab: "hotel-setup" })
  if (hotelId) params.set("hotel", hotelId)
  if (step) params.set("step", step)
  return `/dev-pages?${params.toString()}`
}

// ── Error formatting ────────────────────────────────────────────────────────

type FastApiDetailItem = { loc?: unknown[]; msg?: string }

// Surface the backend's own `detail` text — a plain string for the hand-raised
// 422s, or the field-by-field list Pydantic produces. Callers render this
// inline next to the step's Next button.
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail =
      error.body && typeof error.body === "object" && "detail" in error.body
        ? (error.body as { detail?: unknown }).detail
        : undefined
    if (typeof detail === "string" && detail.trim()) return detail
    if (Array.isArray(detail)) {
      const parts = (detail as FastApiDetailItem[])
        .map((item) => {
          const field = Array.isArray(item.loc)
            ? item.loc.filter((p) => p !== "body").join(".")
            : ""
          const msg = typeof item.msg === "string" ? item.msg : ""
          return field ? `${field}: ${msg}` : msg
        })
        .filter(Boolean)
      if (parts.length) return parts.join(" · ")
    }
    return `${error.status} ${error.message}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError"
}

// ── Step context ────────────────────────────────────────────────────────────

export type StepContext = {
  hotelId: string
  detail: HotelDetail
  status: SetupStatus
  linesMode: LinesMode
  // Re-reads the hotel + setup status. Every step calls this after a save so
  // the rail and the review screen reflect what actually landed.
  reload: () => Promise<void>
  goTo: (step: WizardStep) => void
  goNext: () => void
  goBack: () => void
  // True when the previous step in the applicable order exists.
  hasBack: boolean
}

export function linesModeOf(detail: HotelDetail | null): LinesMode {
  return detail?.lines ?? "reservations"
}

export function includesReservations(mode: LinesMode): boolean {
  return mode === "reservations" || mode === "both"
}

export function includesSales(mode: LinesMode): boolean {
  return mode === "sales" || mode === "both"
}

export function stepStatus(
  status: SetupStatus | null,
  key: SetupStepKey,
): SetupStepStatus {
  return status?.steps.find((s) => s.key === key)?.status ?? "incomplete"
}

// ── Presentational bits ─────────────────────────────────────────────────────

export function StepCard({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-xs leading-relaxed">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

export function StepNav({
  onBack,
  onNext,
  onSkip,
  saving,
  error,
  nextLabel = "Save & continue",
  skipLabel = "Skip for now",
  nextDisabled,
  hasBack = true,
}: {
  onBack?: () => void
  onNext?: () => void
  onSkip?: () => void
  saving?: boolean
  error?: string | null
  nextLabel?: string
  skipLabel?: string
  nextDisabled?: boolean
  hasBack?: boolean
}) {
  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        {hasBack && onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
            Back
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {onSkip ? (
            <Button type="button" variant="outline" onClick={onSkip} disabled={saving}>
              <SkipForward className="mr-2 h-4 w-4" />
              {skipLabel}
            </Button>
          ) : null}
          {onNext ? (
            <Button type="button" onClick={onNext} disabled={saving || nextDisabled}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : nextLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Notice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error" | "warn" | "success"
  children: React.ReactNode
}) {
  const toneClass = {
    muted: "border-border text-muted-foreground",
    error: "border-destructive/30 bg-destructive/5 text-destructive",
    warn: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  }[tone]
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs leading-relaxed", toneClass)}>
      {children}
    </div>
  )
}

// A read-only value with a copy button — used for every URL and secret the
// operator has to paste into a third-party dashboard.
export function CopyBox({
  label,
  value,
  mono = true,
}: {
  label?: string
  value: string
  mono?: boolean
}) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (insecure origin / permission) — the value is
      // selectable on screen, so this is not worth an error state.
    }
  }
  return (
    <div className="space-y-1">
      {label ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <span
          className={cn(
            "min-w-0 flex-1 break-all text-xs",
            mono && "font-mono",
          )}
        >
          {value}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={copy} className="shrink-0">
          {copied ? <Check className="h-3.5 w-3.5" /> : "Copy"}
        </Button>
      </div>
    </div>
  )
}

export function StatusPill({ status }: { status: SetupStepStatus }) {
  const map: Record<SetupStepStatus, { label: string; className: string }> = {
    done: {
      label: "Done",
      className:
        "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    skipped: {
      label: "Skipped",
      className:
        "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
    },
    incomplete: { label: "To do", className: "border-border text-muted-foreground" },
    not_applicable: {
      label: "N/A",
      className: "border-border text-muted-foreground opacity-60",
    },
  }
  const { label, className } = map[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        className,
      )}
    >
      {label}
    </span>
  )
}

// ── Shared step primitives ──────────────────────────────────────────────────

// The PMS connectors a hotel can be pointed at. Used by the identity step
// (which sets it at creation) and the PMS step (which can still change it
// while the hotel is inactive) — one list so the two can never disagree
// about what is on offer.
export const PMS_CHOICES = [
  { value: "stayntouch", label: "StayNTouch", blurb: "Live availability, quoting, card-hold pay links." },
  { value: "opera", label: "OPERA (OHIP)", blurb: "Live availability and quoting via the OHIP APIs." },
  { value: "mock", label: "Mock / demo", blurb: "Fixture data — demos and pilots without a real PMS." },
]

export function RadioCard({
  checked,
  onSelect,
  label,
  blurb,
  disabled,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  blurb: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "border-border hover:border-foreground/30 hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] leading-relaxed text-muted-foreground">{blurb}</span>
    </button>
  )
}

