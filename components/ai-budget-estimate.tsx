"use client"

import { CircleHelp } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type AiBudgetFields = {
  estimated_budget_min: string | null
  estimated_budget_max: string | null
  budget_estimation_status: "pending" | "complete" | "failed"
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function formatAiBudget(row: AiBudgetFields): string {
  if (row.budget_estimation_status === "pending") return "Estimating…"
  if (row.budget_estimation_status === "failed") return "Estimate unavailable"
  const low = row.estimated_budget_min === null ? null : Number(row.estimated_budget_min)
  const high = row.estimated_budget_max === null ? null : Number(row.estimated_budget_max)
  if (low === null && high === null) return "Not enough information"
  if (low !== null && high !== null) {
    return low === high ? money.format(low) : `${money.format(low)}–${money.format(high)}`
  }
  if (low !== null) return `${money.format(low)}+`
  return `Up to ${money.format(high!)}`
}

export function AiBudgetHelp({ label = "AI-estimated budget" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About AI-estimated budgets"
            className="inline-flex rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            onClick={event => event.stopPropagation()}
          >
            <CircleHelp className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72" sideOffset={6}>
          Estimated by AI from the call transcript. It may be inaccurate when dates,
          attendance, room counts, or budget details are unclear. Confirm the amount
          with the caller before relying on it.
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
