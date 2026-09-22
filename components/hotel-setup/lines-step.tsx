"use client"

// Step 2 — the lines choice made on the identity page, confirmable here.
// It is the switch that makes whole later steps apply or not, so it gets its
// own page rather than being buried in the create form's summary.

import * as React from "react"

import {
  patchSetupProgress,
  type LinesMode,
} from "@/lib/api"

import { LINE_CHOICES } from "./identity-step"
import { Notice, StepCard, StepNav, describeApiError, type StepContext } from "./shared"
import { cn } from "@/lib/utils"

export function LinesStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, linesMode, reload, goNext, goBack, hasBack } = ctx
  const [mode, setMode] = React.useState<LinesMode>(linesMode)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await patchSetupProgress(hotelId, {
        lines_mode: mode,
        step: "lines",
        status: "done",
      })
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
        title="Which lines does this hotel run?"
        description="Reservations answers guests booking a room. Sales intake answers the sales department's no-answer forward and records event inquiries."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {LINE_CHOICES.map((choice) => (
            <button
              type="button"
              key={choice.value}
              onClick={() => setMode(choice.value)}
              aria-pressed={mode === choice.value}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                mode === choice.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <span className="text-sm font-medium">{choice.label}</span>
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                {choice.blurb}
              </span>
            </button>
          ))}
        </div>
        {mode !== linesMode ? (
          <Notice tone="warn">
            Changing this changes which steps apply. Anything already saved on a step that
            stops applying is kept, just no longer asked for.
          </Notice>
        ) : null}
      </StepCard>
      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={save}
        saving={saving}
        error={error}
      />
    </div>
  )
}
