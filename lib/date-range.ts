// Shared date-range math for the insights pages. All ranges are inclusive
// YYYY-MM-DD strings (YYYY-MM for month ranges) and all "today" anchors go
// through the hotel's IANA timezone when one is available — the backend
// buckets records in hotel-local time, so browser-local presets can be a day
// off for hotels ahead of (or behind) the viewer.

export type DateRange = { start: string; end: string }

// "Today" as a UTC-anchored Date for the given IANA zone (falls back to the
// browser zone when the hotel list hasn't loaded yet or the zone is unknown
// to Intl). UTC anchoring keeps the day arithmetic below immune to browser
// DST transitions.
export function todayInTimeZone(timeZone: string | null): Date {
  let formatted: string
  try {
    // en-CA formats as YYYY-MM-DD.
    formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? undefined,
    }).format(new Date())
  } catch {
    formatted = new Intl.DateTimeFormat("en-CA").format(new Date())
  }
  const [year, month, day] = formatted.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

// The `days`-long window ending today (inclusive), e.g. 30 spans today-29 .. today.
export function rangeForLastDays(
  days: number,
  timeZone: string | null = null,
): DateRange {
  const end = todayInTimeZone(timeZone)
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - days + 1)
  return { start: toDateInput(start), end: toDateInput(end) }
}

export function rangeForLastMonths(
  months: number,
  timeZone: string | null = null,
): DateRange {
  const end = todayInTimeZone(timeZone)
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months + 1, 1))
  return { start: toMonthInput(start), end: toMonthInput(end) }
}

// Resolves a preset value ("7", "90", "year", ...) to a concrete range.
// Unknown/invalid values fall back to the last 30 days.
export function rangeForTimespan(
  timespan: string,
  timeZone: string | null = null,
): DateRange {
  if (timespan === "year") {
    const today = todayInTimeZone(timeZone)
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
    return { start: toDateInput(start), end: toDateInput(today) }
  }
  const days = Number(timespan)
  return rangeForLastDays(Number.isFinite(days) && days > 0 ? days : 30, timeZone)
}

export function toDateInput(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function toMonthInput(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

// UTC ms for a YYYY-MM-DD input value; null for empty/partial input.
export function parseDateInputMs(value: string): number | null {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return null
  return Date.UTC(year, month - 1, day)
}

// The same date shifted by `days` (negative to go back). Returns the input
// unchanged if it isn't a complete date.
export function shiftDateInput(value: string, days: number): string {
  const ms = parseDateInputMs(value)
  if (ms === null) return value
  return toDateInput(new Date(ms + days * 86_400_000))
}

// Inclusive day count of a complete range, or null while it's mid-edit.
export function rangeLengthDays(range: DateRange): number | null {
  const startMs = parseDateInputMs(range.start)
  const endMs = parseDateInputMs(range.end)
  if (startMs === null || endMs === null) return null
  return Math.round((endMs - startMs) / 86_400_000) + 1
}

// The same-length window ending the day before `range` begins, e.g. for a
// 7-day range this is the 7 days immediately before it.
export function precedingRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range) ?? 30
  const end = shiftDateInput(range.start, -1)
  const start = shiftDateInput(end, -(length - 1))
  return { start, end }
}

// Validation shared by every custom range. `capDays` mirrors the backend's
// per-endpoint range caps so an out-of-range request never hits the network.
export function dateRangeError(
  start: string,
  end: string,
  capDays?: number,
): string | null {
  if (!start || !end) return "Select both a start and an end date."
  const startMs = parseDateInputMs(start)
  const endMs = parseDateInputMs(end)
  if (startMs === null || endMs === null) return "Enter valid dates."
  if (endMs < startMs) return "End date must be on or after the start date."
  if (capDays !== undefined) {
    const days = (endMs - startMs) / 86_400_000 + 1
    if (days > capDays) return `Date range is limited to ${capDays} days.`
  }
  return null
}

export function monthRangeError(
  start: string,
  end: string,
  capMonths: number,
): string | null {
  if (!start || !end) return "Select both a start and an end month."
  const [startYear, startMonth] = start.split("-").map(Number)
  const [endYear, endMonth] = end.split("-").map(Number)
  if (!startYear || !startMonth || !endYear || !endMonth) return "Enter valid months."
  const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
  if (months < 1) return "End month must be on or after the start month."
  if (months > capMonths) return `Month range is limited to ${capMonths} months.`
  return null
}

export function formatShortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
