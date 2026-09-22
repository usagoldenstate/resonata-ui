"use client"

// The wizard's left rail: every step with its server-computed status. Steps
// that don't apply to this hotel (a sales-only hotel's PMS step, say) are
// greyed out and not clickable — the backend decides applicability, the rail
// only renders it.

import { Check, Circle, CircleDashed, MinusCircle, Rocket } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SetupStatus, SetupStepStatus } from "@/lib/api"

import { STEP_LABELS, WIZARD_STEPS, type WizardStep } from "./shared"

function statusIcon(status: SetupStepStatus) {
  switch (status) {
    case "done":
      return <Check className="h-3.5 w-3.5 text-emerald-600" />
    case "skipped":
      return <CircleDashed className="h-3.5 w-3.5 text-amber-500" />
    case "not_applicable":
      return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

export function StepRail({
  status,
  current,
  onSelect,
}: {
  status: SetupStatus | null
  current: WizardStep
  onSelect: (step: WizardStep) => void
}) {
  const byKey = new Map(status?.steps.map((s) => [s.key, s]) ?? [])

  return (
    <nav aria-label="Setup steps" className="w-56 shrink-0">
      <ol className="space-y-0.5">
        {WIZARD_STEPS.map((step) => {
          if (step === "review") {
            const active = current === "review"
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => onSelect("review")}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{STEP_LABELS.review}</span>
                </button>
              </li>
            )
          }
          const entry = byKey.get(step)
          const stepStatus: SetupStepStatus = entry?.status ?? "incomplete"
          const disabled = stepStatus === "not_applicable"
          const active = current === step
          return (
            <li key={step}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(step)}
                title={entry?.detail ?? undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                {statusIcon(stepStatus)}
                <span className="flex-1 truncate">{STEP_LABELS[step]}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
