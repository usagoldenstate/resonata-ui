"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { ToolActivity } from "@/lib/reporting-chat"

// Human labels for the backend tool names — fall back to the raw name so a
// new backend tool degrades gracefully instead of hiding.
const TOOL_LABELS: Record<string, string> = {
  get_call_metrics_summary: "Call metrics",
  get_call_volume: "Call volume",
  get_not_booked_breakdown: "Not-booked breakdown",
  get_not_booked_seasonality: "Not-booked seasonality",
  get_faqs: "FAQs",
  get_revenue_summary: "Revenue",
  get_csat_feedback: "Guest feedback",
  search_calls: "Searching calls",
  top_facets: "Ranking themes",
  get_booking_funnel: "Booking funnel",
  get_call_summaries: "Reading summaries",
  get_call_transcript: "Reading transcript",
  lookup_knowledge_base: "Knowledge base",
  deep_scan_calls: "Deep transcript scan",
}

function ActivityChip({ activity }: { activity: ToolActivity }) {
  const [open, setOpen] = useState(false)
  const label = TOOL_LABELS[activity.name] ?? activity.name
  const expandable = activity.status !== "running" && (activity.data !== undefined || activity.error)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={!expandable}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
          activity.status === "error"
            ? "border-destructive/40 text-destructive"
            : "border-border text-muted-foreground",
          expandable && "hover:bg-muted cursor-pointer",
        )}
      >
        {activity.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : activity.status === "ok" ? (
          <Check className="h-3 w-3 text-brand-insights" />
        ) : (
          <X className="h-3 w-3" />
        )}
        <span>{label}</span>
        {activity.elapsedMs !== undefined && activity.status !== "running" && (
          <span className="opacity-60">{(activity.elapsedMs / 1000).toFixed(1)}s</span>
        )}
        {expandable && (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-snug">
          {activity.error ? (
            <p className="text-destructive">{activity.error}</p>
          ) : activity.truncated ? (
            <p className="text-muted-foreground">Result too large to display — the assistant read it in full.</p>
          ) : (
            <pre className="whitespace-pre-wrap break-all font-mono">
              {JSON.stringify({ input: activity.input, result: activity.data }, null, 2)}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ToolActivityList({ tools }: { tools: ToolActivity[] }) {
  if (tools.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((activity) => (
        <ActivityChip key={activity.id} activity={activity} />
      ))}
    </div>
  )
}
