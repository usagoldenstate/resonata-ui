"use client"

import { useState } from "react"
import { CalendarDays, Check, ChevronDown } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  type DateRange,
  formatShortDate,
  todayInTimeZone,
  toDateInput,
} from "@/lib/date-range"

// One preset choice inside the picker. `label` names the active window on the
// trigger; `pill` labels the compact button inside the popover.
export type TimespanPreset = { value: string; label: string; pill: string }

// Builds the preset list from short values: numeric day counts ("7", "30"),
// "year" (year to date), and "all" (no date filter).
export function makePresets(values: readonly string[]): TimespanPreset[] {
  return values.map((value) => {
    if (value === "year") return { value, label: "This year", pill: "This year" }
    if (value === "all") return { value, label: "All dates", pill: "All time" }
    return { value, label: `Last ${value} days`, pill: `${value} days` }
  })
}

// The label shown on the trigger: the preset name, or a formatted span for a
// custom range.
export function timespanLabel(
  timespan: string,
  range: DateRange,
  presets: readonly TimespanPreset[],
): string {
  if (timespan === "custom") {
    if (!range.start || !range.end) return "Custom range"
    return `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`
  }
  return presets.find((o) => o.value === timespan)?.label ?? "Select range"
}

// The shared date-range control for every insights page. One interaction
// model — preset pills plus an optional custom range — folded into a compact
// popover so it fits anywhere. `variant` only changes the trigger's skin: a
// quiet inline label for page headers, a bordered button that matches
// neighboring filters in a toolbar.
export function DateRangeFilter({
  variant,
  presets,
  timespan,
  range,
  customStart,
  customEnd,
  rangeError,
  onSelectTimespan,
  onCustomStart,
  onCustomEnd,
  allowCustom = true,
  label,
}: {
  variant: "header" | "toolbar"
  presets: readonly TimespanPreset[]
  timespan: string
  range: DateRange
  customStart?: string
  customEnd?: string
  rangeError?: string | null
  onSelectTimespan: (value: string) => void
  onCustomStart?: (value: string) => void
  onCustomEnd?: (value: string) => void
  allowCustom?: boolean
  // Overrides the derived trigger label (e.g. open-ended custom ranges).
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerLabel = label ?? timespanLabel(timespan, range, presets)

  const trigger =
    variant === "header" ? (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {triggerLabel}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    ) : (
      <button
        type="button"
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-xs transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {triggerLabel}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={variant === "header" ? "start" : "end"}
        className="w-56 p-1.5"
      >
        <div className="flex flex-col gap-0.5">
          {presets.map((option) => {
            const selected = timespan === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelectTimespan(option.value)
                  setOpen(false)
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/70 ${
                  selected ? "font-medium text-foreground" : "text-foreground/80"
                }`}
              >
                {option.label}
                {selected ? <Check className="h-4 w-4 text-[#6b7a4a]" /> : null}
              </button>
            )
          })}
          {allowCustom ? (
            <button
              type="button"
              onClick={() => onSelectTimespan("custom")}
              className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/70 ${
                timespan === "custom" ? "font-medium text-foreground" : "text-foreground/80"
              }`}
            >
              Custom range
              {timespan === "custom" ? <Check className="h-4 w-4 text-[#6b7a4a]" /> : null}
            </button>
          ) : null}
        </div>
        {allowCustom && timespan === "custom" ? (
          <div className="mt-1.5 border-t border-border px-2.5 pb-1.5 pt-2.5">
            <DateRangeInputs
              stacked
              start={customStart ?? ""}
              end={customEnd ?? ""}
              onStart={onCustomStart ?? (() => {})}
              onEnd={onCustomEnd ?? (() => {})}
              error={rangeError}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// Bare start/end date inputs — the primitive DateRangeFilter renders for its
// custom mode, also usable standalone for chart-scoped ranges.
export function DateRangeInputs({
  start,
  end,
  onStart,
  onEnd,
  error,
  stacked = false,
}: {
  start: string
  end: string
  onStart: (value: string) => void
  onEnd: (value: string) => void
  error?: string | null
  // Stacks the inputs full-width for narrow containers (the filter popover).
  stacked?: boolean
}) {
  const today = toDateInput(todayInTimeZone(null))
  const inputClass = `h-9 ${stacked ? "w-full" : "w-36"} bg-card text-sm text-foreground`
  return (
    <div className="flex flex-col gap-1">
      <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap items-end gap-2"}>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Start
          <Input
            type="date"
            value={start}
            max={end || today}
            onChange={(event) => onStart(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          End
          <Input
            type="date"
            value={end}
            max={today}
            onChange={(event) => onEnd(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export function MonthRangeInputs({
  start,
  end,
  onStart,
  onEnd,
  error,
}: {
  start: string
  end: string
  onStart: (value: string) => void
  onEnd: (value: string) => void
  error?: string | null
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Start
          <Input
            type="month"
            value={start}
            onChange={(event) => onStart(event.target.value)}
            className="h-9 w-36 bg-card text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          End
          <Input
            type="month"
            value={end}
            onChange={(event) => onEnd(event.target.value)}
            className="h-9 w-36 bg-card text-sm text-foreground"
          />
        </label>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
