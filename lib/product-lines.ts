// Which products a hotel bought — `hotels.lines` on the backend: the
// reservations line, the sales intake line, or both. The dashboard derives its
// nav, its page guards and the Agent Configuration sections from it, so a
// sales-only hotel never sees reservation reports that could only ever be
// empty (and never a link into them).
//
// Distinct from `sales_line_enabled`, which is the live on/off switch for the
// sales phone line: pausing the line must not hide the inquiries still being
// followed up.

export type HotelLines = "reservations" | "sales" | "both"

export type LineSet = { reservations: boolean; sales: boolean }

// A hotel row from an older backend carries no `lines`; every hotel onboarded
// before the field existed is a reservations hotel, so that is the fallback.
export function lineSetOf(lines: HotelLines | null | undefined): LineSet {
  const value = lines ?? "reservations"
  return {
    reservations: value === "reservations" || value === "both",
    sales: value === "sales" || value === "both",
  }
}

// The union across a scope (one hotel, or an organization's hotels): a page is
// available when at least one hotel in the scope has its line. Null while the
// hotel list has not loaded yet.
export function scopeLineSet(hotels: { lines?: HotelLines | null }[]): LineSet | null {
  if (hotels.length === 0) return null
  return hotels.reduce<LineSet>(
    (acc, h) => {
      const own = lineSetOf(h.lines)
      return {
        reservations: acc.reservations || own.reservations,
        sales: acc.sales || own.sales,
      }
    },
    { reservations: false, sales: false },
  )
}

type LineRule = { line: keyof LineSet; matches: (pathname: string) => boolean }

const prefix = (p: string) => (pathname: string) =>
  pathname === p || pathname.startsWith(`${p}/`)

// Routes that only make sense for one line. Everything unlisted (call log,
// knowledge base, agent configuration, settings, admin pages) is shared.
// Ask Insights lives under /reporting, so it follows the reservation reports.
const LINE_RULES: LineRule[] = [
  { line: "reservations", matches: (pathname) => pathname === "/" },
  { line: "reservations", matches: prefix("/reporting") },
  { line: "reservations", matches: prefix("/faqs") },
  { line: "reservations", matches: prefix("/room-mapping") },
  { line: "sales", matches: prefix("/sales-inquiries") },
]

// The line a route needs, or null for a route every hotel has.
export function lineRequiredFor(pathname: string): keyof LineSet | null {
  return LINE_RULES.find((rule) => rule.matches(pathname))?.line ?? null
}

export function routeAvailable(pathname: string, lines: LineSet): boolean {
  const needed = lineRequiredFor(pathname)
  return needed === null || lines[needed]
}

// Where a scope lands when the page it asked for is not part of its plan
// (and where a sales-only hotel lands instead of the dashboard).
export function homeRouteFor(lines: LineSet): string {
  if (!lines.reservations && lines.sales) return "/sales-inquiries"
  return "/"
}
