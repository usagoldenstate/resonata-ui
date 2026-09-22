"use client"

// The shared read-out of GET /setup: one row per step, the outside-this-app
// checklist, and whatever is blocking activation. Rendered both by the
// wizard's review screen and by the "Setup health" card on Settings.

import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SetupStatus, SetupStepKey } from "@/lib/api"

import { STEP_LABELS, StatusPill } from "./shared"

export function SetupStatusPanel({
  status,
  onEdit,
  editHref,
}: {
  status: SetupStatus
  // In-wizard: jump to the step in place. On Settings there is no wizard
  // mounted, so `editHref` links into the Dev Pages tab instead.
  onEdit?: (step: SetupStepKey) => void
  editHref?: (step: SetupStepKey) => string
}) {
  const applicable = status.steps.filter((s) => s.status !== "not_applicable")

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border rounded-md border border-border">
        {applicable.map((step) => (
          <li key={step.key} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 text-sm">
              {STEP_LABELS[step.key] ?? step.key}
              {step.detail ? (
                <span className="block text-[11px] leading-relaxed text-muted-foreground">
                  {step.detail}
                </span>
              ) : null}
            </span>
            {step.blocking && step.status === "incomplete" ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
                Required
              </span>
            ) : null}
            <StatusPill status={step.status} />
            {onEdit ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onEdit(step.key)}
              >
                Edit
              </Button>
            ) : editHref ? (
              <Link href={editHref(step.key)}>
                <Button type="button" size="sm" variant="ghost">
                  Edit
                </Button>
              </Link>
            ) : null}
          </li>
        ))}
      </ul>

      {status.external_tasks.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium">Outside this app</p>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            Resonata can&apos;t verify these — they happen in someone else&apos;s dashboard.
          </p>
          <ul className="space-y-2">
            {status.external_tasks.map((task) => (
              <li key={task.key} className="text-xs">
                <span className="font-medium">{task.title}</span>
                <span className="block text-[11px] leading-relaxed text-muted-foreground">
                  {task.detail}
                </span>
                {task.url_hint ? (
                  <a
                    href={task.url_hint}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 inline-flex items-center gap-1 break-all font-mono text-[11px] text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {task.url_hint}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status.blockers.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive">
            Blocking activation
          </p>
          <ul className="mt-1 space-y-0.5">
            {status.blockers.map((blocker) => (
              <li key={blocker} className="text-[11px] leading-relaxed text-destructive">
                • {blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
