# Not Booked Reasons page — review findings (2026-06-10)

Scope reviewed: `app/(protected)/reporting/not-booked/page.tsx` + the not-booked
parts of `lib/api.ts` (commit `8bc87d6`), checked against the backend contract in
`Resonata/api/reporting.py`, `Resonata/schemas/reporting.py`, and
`Resonata/analytics/not_booked_taxonomy.py`.

**Overall verdict: the page is wired correctly.** Request/response field names and
types match the backend schemas exactly (`NotBookedBreakdownResponse`,
`NotBookedSeasonalityRow`), date/month params match the query signatures, percentages
are used at the right denominators (category % of total, subcategory % of category —
matches the backend's `_pct` calls), the five hardcoded color keys match
`CATEGORY_NAMES` exactly with a safe fallback, abort/cleanup handling is correct, and
`tsc --noEmit` passes.

## Fixed directly (confirmed bug, trivial)

- **Peak Month card showed a fake peak when all 12 months are zero.** The
  `reduce` seeded with `monthlyTrend[0]` returns the first month when every count is
  0, so the card displayed e.g. "Jul" under "Highest occurrence (last 12 months)"
  for a category with zero occurrences. The Top Reason and Top Issue cards already
  guard this case with `"--"`; Peak Month now does too.

## Not fixed — for your decision

### 1. Cross-page count mismatch: call-log "Not Booked" ≠ reporting "Total Not Booked" (demo risk)

The reporting page's universe (`api/reporting.py::_not_booked_universe`) is:
`outcome == "bookable_not_booked"` AND no completed PMS attribution. The call-log
filter (`api/router.py::_outcome_condition("not_booked")`) is:
`status == "done"` AND `booking_made IS NOT TRUE` AND `booking_link_sent IS NOT TRUE` —
which **includes `not_bookable` calls** (spam, wrong numbers, existing-reservation
support). So filtering the call log to "Not Booked" will show a larger count than the
reporting page's "Total Not Booked" for the same window. If you demo both pages
side-by-side, the numbers won't reconcile. Options: add the
`outcome == 'bookable_not_booked'` predicate to the call-log filter, or add a separate
"Not bookable" filter bucket. Product decision — not touched.

### 2. Call-log "Booked" filter is dead for new calls

`_outcome_condition("booked")` checks `CallAnalytics.booking_made IS TRUE`, but the
new lead classifier (`analytics/extractor.py::_apply_classification`) always sets
`booking_made = None`. Reporting derives "booked" from reservation attribution
(`_booked_exists_clause`) instead. Net effect: the call-log "Booked" filter returns
nothing for any call classified by the current pipeline. Fixing it means switching the
call-log condition to the attribution-exists clause (multi-line, touches `api/router.py`)
— flagging rather than fixing.

### 3. Seasonality is refetched on every category click

The `/not-booked/seasonality` response already contains all 5 categories × 12 months;
the category filter is client-side. But the effect depends on `selectedReason`, so each
drill-in refetches the identical payload and flashes "..." on the Peak Month card. You
could fetch once per `hotelId` (drop `selectedReason` from the deps and fetch when the
page mounts). Behavior today is correct, just wasteful — left alone.

### 4. Timezone seam between browser and hotel

The UI computes `start_date`/`end_date` from the **browser's** local clock
(`new Date()`), while the backend interprets those dates in the **hotel's** timezone.
An operator in a different timezone than the hotel can see today's calls fall outside
"Last 7 days" near midnight. Same pattern as the other reporting pages, so it's at
least consistent; a real fix would derive "today" from the hotel's timezone. Also: the
`range` memo is computed once per timespan selection, so a tab left open past midnight
keeps yesterday's range until the user touches the selector. Both minor, both
speculative impact — not touched.

### 5. Distribution bar segments look clickable but aren't

The summary-bar segments have `cursor-pointer` and a hover effect but no `onClick`.
Either wire them to `setSelectedReason(reason.category)` (nice drill-in affordance) or
drop the pointer cursor. Product polish call.

### 6. `fetchNotBookedTaxonomy` is exported but never called

The backend taxonomy endpoint exists so the UI can stop hardcoding labels, and
`lib/api.ts` has the fetcher + types, but the page never uses it — category names
arrive implicitly via the breakdown response (fine), and colors are the only hardcoded
mapping (with a gray fallback for unknown categories). Harmless today; if you want the
"single source of truth" goal fully realized, the detail-view subcategory ordering and
the call-log's hardcoded `notBookedReasonOptions` array could both come from this
endpoint instead.

### 7. Peak Month window is fixed at 12 months regardless of the timespan selector

Intentional-looking (the card label says "last 12 months"), but worth confirming
that's the product intent: the timespan dropdown changes Total Cases / subcategories
but never the Monthly Trend or Peak Month.
