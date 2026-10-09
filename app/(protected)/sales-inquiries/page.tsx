"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { AlertTriangle, ArrowUpRight, CheckCircle2, Headphones, ChevronLeft, ChevronRight, Inbox, Link2, Loader2, Mail, Phone, RefreshCw, Search, Users, CalendarDays, BedDouble, MessageSquareText, Clock3, UserRound, Sparkles, Send, History, Wallet, X, Plus, Check, ChevronDown, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OptionSelect } from "@/components/ui/option-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog"
import { AiBudgetHelp, formatAiBudget } from "@/components/ai-budget-estimate"
import { CallRecordingPlayer } from "@/components/call-recording-player"
import { useHotel, type HotelListItem } from "@/lib/hotel-context"
type Selection = { id: string; hotelId: string }
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { confirmDiscardUnsaved, registerUnsavedGuard } from "@/lib/unsaved-guard"
import { ApiError, fetchSalesAssignees, fetchSalesDepartmentOptions, formatHeadcount, fetchSalesInquiries, fetchSalesInquiry, updateSalesInquiry, type SalesFollowUpStatus, type SalesInquiryItem, type SalesInquiryPatch } from "@/lib/api"
import { EVENT_CATEGORY_LABELS, INQUIRY_KIND_LABELS } from "@/lib/sales-inquiry-labels"

// The response status: what the sales team has done since the call. Not "New"
// — that word belongs to the inquiry type (an existing inquiry nobody has
// called back yet is "Not started").
const statuses: Record<SalesFollowUpStatus, string> = { not_started: "Not started", call_attempted: "Call attempted", contacted: "Spoke with caller", booked: "Booked / Won", closed: "Closed / Not proceeding" }
const statusStyle: Record<SalesFollowUpStatus, string> = {
  not_started: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200",
  call_attempted: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200",
  contacted: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200",
  booked: "bg-success/10 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
}
const selectClass = "w-auto max-w-full"
const PAGE_SIZE = 25

function timestamp(value: string | null, timezone: string) {
  if (!value) return "—"
  // SQLite fixtures return naive UTC; production returns timezone-aware dates.
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(normalized))
}
const isExisting = (row: Pick<SalesInquiryItem, "inquiry_kind">) => row.inquiry_kind === "existing_inquiry"
// The headline for a row: the caller's own words for the event, or — for an
// existing inquiry that never named it — who they're working with.
function requestLabel(row: SalesInquiryItem) {
  if (row.event_type) return row.event_type
  if (isExisting(row)) return row.existing_contact_name ? `Working with ${row.existing_contact_name}` : "Event not mentioned"
  return row.erased ? "Erased inquiry" : "Event not specified"
}
// Use the structured count for the compact list; the detail panel retains
// the caller's wording and any qualifiers.
function partySize(row: SalesInquiryItem) {
  if (row.headcount_min !== null && row.headcount_max !== null) {
    const count = row.headcount_min === row.headcount_max
      ? row.headcount_min.toLocaleString()
      : `${row.headcount_min.toLocaleString()}–${row.headcount_max.toLocaleString()}`
    return `${count} ${row.headcount_min === 1 && row.headcount_max === 1 ? "guest" : "guests"}`
  }
  return row.headcount_text
}
function RequestSummary({ row }: { row: SalesInquiryItem }) {
  const headline = requestLabel(row)
  const count = partySize(row)
  const secondary = isExisting(row)
    ? (row.event_type && row.existing_contact_name ? `Working with ${row.existing_contact_name}` : "Follow-up on an open inquiry")
    : dates(row)
  return <div className="space-y-1.5">
    <p className="line-clamp-2 break-words font-medium leading-5" title={headline}>{headline}</p>
    <p className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground" title={secondary}>{secondary}</p>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <KindBadge row={row} />
      {count && <span className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground" title={count}><Users aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{count}</span></span>}
    </div>
  </div>
}
function KindBadge({ row }: { row: Pick<SalesInquiryItem, "inquiry_kind"> }) {
  const existing = isExisting(row)
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${existing ? "border-brand-insights/30 bg-brand-insights/10 text-brand-insights" : "border-border bg-muted text-muted-foreground"}`}>{INQUIRY_KIND_LABELS[row.inquiry_kind ?? "initial_inquiry"]}</span>
}
function dates(row: SalesInquiryItem) {
  const parts = row.event_dates_text || [row.event_start_date, row.event_end_date !== row.event_start_date ? row.event_end_date : null].filter(Boolean).join(" – ") || "Dates not provided"
  return `${parts}${row.dates_flexible ? " · Flexible" : ""}`
}
// What a hotelier needs to know about the sales-team email, in three states.
// The stored status is more detailed (sending / failed / sent / gave_up /
// not_sent) and stays visible to ops in the API and logs; for the hotel,
// "still going out" and "retrying" are the same thing — nothing to do — and
// a delivery that gave up or an email that was never composed is the same
// action: work the inquiry from here. The reason is in the detail panel.
type EmailView = "emailed" | "sending" | "not_sent"
const EMAIL_VIEW_STATUSES: Record<EmailView, SalesInquiryItem["email_status"][]> = {
  emailed: ["sent"],
  sending: ["sending", "failed"],
  not_sent: ["not_sent", "gave_up"],
}
function emailView(status: SalesInquiryItem["email_status"]): EmailView {
  return status === "sent" ? "emailed" : status === "not_sent" || status === "gave_up" ? "not_sent" : "sending"
}
const EMAIL_VIEW_LABEL: Record<EmailView, string> = { emailed: "Emailed", sending: "Sending", not_sent: "Email not sent" }

// Filters. Search, received date, response status and salesperson are what a
// sales team triages by every day, so they stay on screen. The rest are added
// from "+ Filter" and shown as tags: click a tag to edit it, × to remove it.
// Each attribute is one tag holding one condition (the backend takes a single
// value per filter).
type FilterKey = "kind" | "category" | "department" | "email" | "event" | "budget"
const FILTER_LABELS: Record<FilterKey, string> = { kind: "Inquiry type", category: "Event category", department: "Department", email: "Email status", event: "Event date", budget: "Potential budget" }
type Option = { value: string; label: string }
type FilterValues = { kind: string; category: string; department: string; email: string; eventFrom: string; eventTo: string; budget: string }
type ChoiceKey = "kind" | "category" | "department" | "email"
function clearFilter(values: FilterValues, key: FilterKey): FilterValues {
  if (key === "event") return { ...values, eventFrom: "", eventTo: "" }
  return { ...values, [key]: "" }
}
const sameFilters = (a: FilterValues, b: FilterValues) => (Object.keys(a) as (keyof FilterValues)[]).every(k => a[k] === b[k])
const toOptions = (labels: Record<string, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label }))
const triggerClass = "inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20"
const budgetMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
// Calendar days as YYYY-MM-DD, the format the date inputs and API use.
function todayIn(timezone?: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}
function shiftDay(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function shortDate(day: string) {
  const d = new Date(`${day}T00:00:00Z`)
  const sameYear = d.getUTCFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: "UTC" }).format(d)
}
function rangeLabel(from: string, to: string) {
  if (from && to) return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`
  return from ? `From ${shortDate(from)}` : `Through ${shortDate(to)}`
}
const RECEIVED_PRESETS = [{ label: "Today", days: 1 }, { label: "Last 7 days", days: 7 }, { label: "Last 30 days", days: 30 }, { label: "Last 90 days", days: 90 }]
const pillTone: Record<EmailView, string> = {
  emailed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  not_sent: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  sending: "border-border bg-muted text-muted-foreground",
}
// Why an inquiry has no email, shown as a banner at the top of its panel.
function notSentReason(row: Pick<SalesInquiryItem, "email_status">): string | null {
  if (row.email_status === "not_sent") return "The call ended before the intake finished, so no email was sent. These details were pulled from the call transcript and may be incomplete — listen to the call before calling back."
  if (row.email_status === "gave_up") return "The email to your sales team could not be delivered after repeated attempts. Check the department's email address in Settings, and follow up from here."
  return null
}
function EmailBadge({ row }: { row: Pick<SalesInquiryItem, "email_status"> }) {
  const view = emailView(row.email_status)
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${pillTone[view]}`}>
    {view === "not_sent" ? <AlertTriangle className="size-3.5" /> : view === "emailed" ? <CheckCircle2 className="size-3.5" /> : <Mail className="size-3.5" />}
    {EMAIL_VIEW_LABEL[view]}
  </span>
}
function StatusSelect({ row, disabled, onChange }: { row: SalesInquiryItem; disabled: boolean; onChange: (status: SalesFollowUpStatus) => void }) {
  return <OptionSelect aria-label={`Status for ${row.caller_name || "inquiry"}`} size="sm" className={`w-full rounded-lg px-2.5 text-xs font-medium ${statusStyle[row.follow_up_status]}`} value={row.follow_up_status} disabled={disabled} onValueChange={v => onChange(v as SalesFollowUpStatus)} options={Object.entries(statuses).map(([value, label]) => ({ value, label }))} />
}
function OwnerSelect({ row, reps, disabled, onChange }: { row: SalesInquiryItem; reps: string[]; disabled: boolean; onChange: (name: string | null) => void }) {
  // Names come from the hotel's sales-team roster (Settings), not user
  // accounts. A name since removed from the roster still shows on the rows it
  // was saved against — history is never rewritten by a roster edit.
  return <OptionSelect aria-label={`Assigned salesperson for ${row.caller_name || "inquiry"}`} size="sm" className="w-full rounded-lg px-2.5 text-xs" value={row.assigned_rep || ""} disabled={disabled} onValueChange={v => onChange(v || null)} options={[
    { value: "", label: "Unassigned" },
    ...(row.assigned_rep && !reps.includes(row.assigned_rep) ? [{ value: row.assigned_rep, label: `${row.assigned_rep} (no longer on the team)` }] : []),
    ...reps.map(name => ({ value: name, label: name })),
  ]} />
}

export default function SalesInquiriesPage() {
  return <Suspense><SalesPage /></Suspense>
}
function SalesPage() {
  // One hotel, or an organization's accessible hotels (the portfolio view).
  const { scope, scopeHotels, setHotelId, loading, error } = useHotel()
  const params = useSearchParams()
  const scopeKey = scopeHotels.map(h => h.hotel_id).join(",")
  return <div className="flex h-screen bg-background"><Sidebar /><main className="app-content min-w-0 flex-1 overflow-auto">
    {scopeHotels.length ? <Workspace key={`${scopeKey}:${params.toString()}`} hotels={scopeHotels} portfolio={scope?.kind === "org"} setHotelId={setHotelId} initialInquiry={params.get("inquiry_id")} initialCall={params.get("call_id")} /> : <div className="p-8 text-muted-foreground">{loading ? "Loading hotel…" : error || "Select a hotel to view sales inquiries."}</div>}
  </main></div>
}
// Every hotel's own roster, keyed by hotel id. Editing an assignment uses the
// ROW's hotel roster (a name from hotel A can't be assigned at hotel B); the
// owner filter merges every roster in scope, which works because
// `assigned_rep` is stored as plain text and simply matches wherever it occurs.
type Rosters = Record<string, string[]>
function mergeRosters(rosters: Rosters | undefined, hotelIds: string[]): string[] {
  const seen = new Set<string>()
  for (const id of hotelIds) for (const name of rosters?.[id] ?? []) seen.add(name)
  return [...seen]
}
function Workspace({ hotels, portfolio, setHotelId, initialInquiry, initialCall }: { hotels: HotelListItem[]; portfolio: boolean; setHotelId: (id: string) => void; initialInquiry: string | null; initialCall: string | null }) {
  const hotelIds = hotels.map(h => h.hotel_id)
  const hotelById = new Map(hotels.map(h => [h.hotel_id, h]))
  const tzOf = (hotelId: string) => hotelById.get(hotelId)?.timezone || "UTC"
  const nameOf = (hotelId: string) => hotelById.get(hotelId)?.display_name || hotelId
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [kind, setKind] = useState("")
  const [status, setStatus] = useState("")
  const [owner, setOwner] = useState("")
  const [department, setDepartment] = useState("")
  const [email, setEmail] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [eventFrom, setEventFrom] = useState("")
  const [eventTo, setEventTo] = useState("")
  const [budgetMinimum, setBudgetMinimum] = useState("")
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(0)
  const [callId, setCallId] = useState(initialCall)
  // "+ Filter" is one popover: the attribute list, then that attribute's
  // editor in place (a menu opening a second popover closed it on the spot).
  // A tag edits in its own popover.
  const [addOpen, setAddOpen] = useState(false)
  const [addKey, setAddKey] = useState<FilterKey | null>(null)
  const [editingTag, setEditingTag] = useState<FilterKey | null>(null)
  const [receivedOpen, setReceivedOpen] = useState(false)
  // The selection carries its hotel so the detail request survives the row
  // leaving the current page (e.g. a status change while filtering by status).
  // A deep link (`?inquiry_id=`) arrives with `?hotel_id=`, which on a full
  // load forces single-hotel scope, so the one hotel in scope is its hotel.
  const [selected, setSelected] = useState<Selection | null>(initialInquiry && hotels.length === 1 ? { id: initialInquiry, hotelId: hotels[0].hotel_id } : null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const saving = useRef(false)
  const q = useDebouncedValue(search, 300)
  const invalidDates = !!(dateFrom && dateTo && dateFrom > dateTo)
  const invalidEventDates = !!(eventFrom && eventTo && eventFrom > eventTo)
  const filters = { q, event_category: category || undefined, inquiry_kind: kind || undefined, status, assigned_rep: owner && owner !== "unassigned" ? owner : undefined, unassigned: owner === "unassigned", department_id: department || undefined, email_status: email ? EMAIL_VIEW_STATUSES[email as EmailView] : undefined, date_from: dateFrom, date_to: dateTo, event_from: eventFrom, event_to: eventTo, budget_value_gte: budgetMinimum, sort, call_id: callId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const { data, error, isLoading, isValidating, mutate } = useSWR(invalidDates || invalidEventDates ? null : ["sales-inquiries", hotelIds.join(","), filters], () => fetchSalesInquiries(hotelIds, filters), { refreshInterval: 30000 })
  const staff = useSWR<Rosters>(["sales-assignees", hotelIds.join(",")], async () => Object.fromEntries(await Promise.all(hotelIds.map(async id => [id, await fetchSalesAssignees(id)] as const))))
  const linkedRow = !dismissed && callId ? data?.items[0] : undefined
  const current: Selection | null = selected || (linkedRow ? { id: linkedRow.id, hotelId: linkedRow.hotel_id } : null)
  const selectedId = current?.id ?? null
  const detail = useSWR(current ? ["sales-inquiry", current.hotelId, current.id] : null, () => fetchSalesInquiry(current!.hotelId, current!.id), { refreshInterval: 30000 })
  const reps = mergeRosters(staff.data, hotelIds)
  // Current departments plus any its inquiries were routed to before being
  // deleted. Only worth a filter once there is more than one.
  const departments = useSWR(["sales-departments", hotelIds.join(",")], () => fetchSalesDepartmentOptions(hotelIds))
  const departmentLabel = (option: { name: string; hotel_id: string; current: boolean }) =>
    `${option.name}${portfolio ? ` · ${nameOf(option.hotel_id)}` : ""}${option.current ? "" : " (removed)"}`
  async function save(row: SalesInquiryItem, patch: Omit<SalesInquiryPatch, "version">) {
    if (saving.current) return false
    saving.current = true
    setBusy(row.id)
    try {
      const updated = await updateSalesInquiry(row.hotel_id, row.id, { ...patch, version: row.version })
      if (selectedId === row.id) await detail.mutate(updated, { revalidate: false })
      void mutate()
      toast.success("Inquiry updated")
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Someone updated this inquiry. The latest version is loading; please try again.")
        void mutate()
        void detail.mutate()
      } else toast.error("Could not save changes. Please try again.")
      return false
    } finally { saving.current = false; setBusy(null) }
  }
  function clearFilters() { setSearch(""); setCategory(""); setKind(""); setStatus(""); setOwner(""); setDepartment(""); setEmail(""); setDateFrom(""); setDateTo(""); setEventFrom(""); setEventTo(""); setBudgetMinimum(""); setCallId(null); setEditingTag(null); setPage(0) }
  // Received presets count back from today in the hotel's own calendar; a
  // portfolio spans timezones, so it uses the viewer's.
  const receivedToday = todayIn(portfolio ? undefined : tzOf(hotelIds[0]))
  const receivedPreset = RECEIVED_PRESETS.find(p => dateTo === receivedToday && dateFrom === shiftDay(receivedToday, 1 - p.days))
  const receivedLabel = !dateFrom && !dateTo ? "Any time" : receivedPreset?.label ?? rangeLabel(dateFrom, dateTo)
  function setReceived(from: string, to: string) { setDateFrom(from); setDateTo(to); setPage(0); setReceivedOpen(false) }
  const applied: FilterValues = { kind, category, department, email, eventFrom, eventTo, budget: budgetMinimum }
  function applyFilters(next: FilterValues) {
    setKind(next.kind); setCategory(next.category); setDepartment(next.department); setEmail(next.email)
    setEventFrom(next.eventFrom); setEventTo(next.eventTo); setBudgetMinimum(next.budget); setPage(0)
  }
  const choiceOptions: Partial<Record<ChoiceKey, Option[]>> = {
    kind: toOptions(INQUIRY_KIND_LABELS),
    category: toOptions(EVENT_CATEGORY_LABELS),
    // Only worth filtering once there is more than one department.
    ...((departments.data?.length ?? 0) > 1 ? { department: departments.data!.map(o => ({ value: o.id, label: departmentLabel(o) })) } : {}),
    email: toOptions(EMAIL_VIEW_LABEL),
  }
  const available = (Object.keys(FILTER_LABELS) as FilterKey[]).filter(key => key === "event" || key === "budget" || choiceOptions[key])
  function tagValue(key: FilterKey, values: FilterValues = applied): string | null {
    if (key === "event") return values.eventFrom || values.eventTo ? rangeLabel(values.eventFrom, values.eventTo) : null
    if (key === "budget") return values.budget ? `at least ${budgetMoney.format(Number(values.budget))}` : null
    // A department filter stays visible even if the list later drops to one.
    const value = values[key]
    return value ? choiceOptions[key]?.find(o => o.value === value)?.label ?? "Removed option" : null
  }
  const tags = (Object.keys(FILTER_LABELS) as FilterKey[]).filter(key => tagValue(key) !== null)
  function removeFilter(key: FilterKey) {
    applyFilters(clearFilter(applied, key))
    if (editingTag === key) setEditingTag(null)
  }
  // One editor per attribute, working on a set of values: the applied ones
  // when editing a tag, the "+ Filter" draft when adding.
  function filterEditor(key: FilterKey, values: FilterValues, onChange: (next: FilterValues) => void, onCancel: () => void, applyLabel?: string) {
    if (key === "event") return <DateRangeEditor title="Event date" from={values.eventFrom} to={values.eventTo} applyLabel={applyLabel} onCancel={onCancel} onApply={(from, to) => onChange({ ...values, eventFrom: from, eventTo: to })} />
    if (key === "budget") return <BudgetEditor value={values.budget} applyLabel={applyLabel} onCancel={onCancel} onApply={budget => onChange({ ...values, budget })} />
    const options = choiceOptions[key]
    return options ? <ChoiceEditor title={FILTER_LABELS[key]} options={options} value={values[key]} onPick={v => onChange({ ...values, [key]: v })} /> : null
  }
  // "+ Filter" collects changes into a draft so several can be set up before
  // the list reloads once, on Apply.
  const [draft, setDraft] = useState<FilterValues>(applied)
  const draftChanged = !sameFilters(draft, applied)
  function openAdd(open: boolean) { setAddOpen(open); setAddKey(null); if (open) setDraft(applied) }
  const anyFilter = !!(search || status || owner || dateFrom || dateTo || tags.length || callId)
  const counts = data?.counts
  const cards = [
    { label: "Response not started", value: counts?.not_started || 0, icon: Inbox, color: "text-blue-600" },
    { label: "Response in progress", value: (counts?.call_attempted || 0) + (counts?.contacted || 0), icon: Phone, color: "text-amber-600" },
    { label: "Booked", value: counts?.booked || 0, icon: CheckCircle2, color: "text-success" },
    { label: "Closed / Not booked", value: counts?.closed || 0, icon: Users, color: "text-muted-foreground" },
  ]
  return <>
    <header className="flex items-center justify-between gap-4 border-b bg-card px-8 py-6">
      <div><p className="app-eyebrow mb-2">Your sales pipeline</p><h1 className="text-2xl font-semibold tracking-tight">Sales inquiries</h1><p className="mt-1 text-sm text-muted-foreground">Every sales call captured. Every follow-up in one place.</p></div>
      <Button variant="outline" size="sm" disabled={isValidating} onClick={() => { void mutate(); void staff.mutate(); void detail.mutate() }}><RefreshCw className={`size-4 ${isValidating ? "animate-spin" : ""}`} />Refresh</Button>
    </header>
    <div className="space-y-6 p-6 lg:p-8">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{cards.map(card => <div key={card.label} className="metric-card rounded-2xl border border-border/80 bg-card p-5 shadow-xs"><div className="flex items-center justify-between text-sm text-muted-foreground">{card.label}<card.icon className={`size-4 ${card.color}`} /></div><p className="metric-value mt-3 text-3xl font-semibold tabular-nums">{!data || error || invalidDates || invalidEventDates ? "—" : card.value}</p></div>)}</div>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Sales inquiries">
        <div className="space-y-4 border-b p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Incoming inquiries</h2><p className="mt-1 text-xs text-muted-foreground">Automatically captured by your voice agent · Received times in {portfolio ? "each hotel's local time" : tzOf(hotelIds[0])}</p></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Sort by</span><OptionSelect aria-label="Sort inquiries" className={selectClass} value={sort} onValueChange={v => { setSort(v); setPage(0) }} options={[{ value: "newest", label: "Newest first" }, { value: "budget_desc", label: "Highest AI-estimated budget" }, { value: "event_date_asc", label: "Soonest event" }, { value: "headcount_desc", label: "Largest party" }]} /></div></div>
          <div className="flex flex-wrap gap-3">
            <label className="relative min-w-60 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search inquiries" placeholder="Search name, phone, email, request, or rep…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} className="pl-9" /></label>
            <Popover open={receivedOpen} onOpenChange={setReceivedOpen}>
              <PopoverTrigger className={triggerClass} aria-label={`Received date: ${receivedLabel}`}><CalendarDays className="size-4 text-muted-foreground" /><span className="text-muted-foreground">Received:</span>{receivedLabel}<ChevronDown className="size-4 text-muted-foreground" /></PopoverTrigger>
              <PopoverContent align="start" className="w-80 rounded-xl p-0">
                <div className="grid gap-0.5 p-2">
                  {[{ label: "Any time", from: "", to: "" }, ...RECEIVED_PRESETS.map(p => ({ label: p.label, from: shiftDay(receivedToday, 1 - p.days), to: receivedToday }))].map(p => {
                    const active = p.label === receivedLabel
                    return <button key={p.label} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setReceived(p.from, p.to)}>{p.label}{active && <Check className="size-4" />}</button>
                  })}
                </div>
                <div className="border-t p-3"><DateRangeEditor title="Custom range" from={dateFrom} to={dateTo} onCancel={() => setReceivedOpen(false)} onApply={setReceived} /></div>
              </PopoverContent>
            </Popover>
            <OptionSelect aria-label="Filter by response status" className={selectClass} value={status} onValueChange={v => { setStatus(v); setPage(0) }} options={[{ value: "", label: "All response statuses" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} />
            <OptionSelect aria-label="Filter by salesperson" className={selectClass} value={owner} onValueChange={v => { setOwner(v); setPage(0) }} options={[{ value: "", label: "All salespeople" }, { value: "unassigned", label: "Unassigned" }, ...reps.map(name => ({ value: name, label: name }))]} />
            <Popover open={addOpen} onOpenChange={openAdd}>
              <PopoverTrigger className={triggerClass}><Plus className="size-4" />Filter</PopoverTrigger>
              <PopoverContent align="start" className="w-80 rounded-xl p-0">
                {addKey ? <div className="space-y-2 p-3">
                  <button className="flex items-center gap-1 rounded-md px-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setAddKey(null)}><ArrowLeft className="size-3.5" />All filters</button>
                  {filterEditor(addKey, draft, next => { setDraft(next); setAddKey(null) }, () => setAddKey(null), "Done")}
                </div> : <>
                  <div className="grid gap-0.5 p-1.5" role="menu" aria-label="Add a filter">
                    {available.map(key => {
                      const value = tagValue(key, draft)
                      return <div key={key} className="flex items-center rounded-lg hover:bg-muted">
                        <button role="menuitem" className="min-w-0 flex-1 px-2.5 py-1.5 text-left text-sm" onClick={() => setAddKey(key)}>
                          {FILTER_LABELS[key]}
                          {value && <span className="block truncate text-xs font-medium text-brand-insights">{value}</span>}
                        </button>
                        {value && <button aria-label={`Remove ${FILTER_LABELS[key]} filter`} className="mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => setDraft(d => clearFilter(d, key))}><X className="size-3.5" /></button>}
                      </div>
                    })}
                  </div>
                  <div className="flex justify-end gap-2 border-t p-2.5"><Button variant="ghost" size="sm" onClick={() => openAdd(false)}>Cancel</Button><Button size="sm" disabled={!draftChanged} onClick={() => { applyFilters(draft); openAdd(false) }}>Apply filters</Button></div>
                </>}
              </PopoverContent>
            </Popover>
          </div>
          {(tags.length > 0 || callId || anyFilter) && <div className="flex flex-wrap items-center gap-2">
            {tags.map(key => <span key={key} className="inline-flex h-8 items-center rounded-full border border-brand-insights/30 bg-brand-insights/10 text-xs text-foreground">
              <Popover open={editingTag === key} onOpenChange={open => setEditingTag(open ? key : null)}>
                <PopoverTrigger className="h-full rounded-l-full pl-3 pr-1.5 hover:underline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Edit ${FILTER_LABELS[key]} filter`}><span className="text-muted-foreground">{FILTER_LABELS[key]}:</span> <span className="font-medium">{tagValue(key)}</span></PopoverTrigger>
                <PopoverContent align="start" className="w-80 rounded-xl p-3">{filterEditor(key, applied, next => { applyFilters(next); setEditingTag(null) }, () => setEditingTag(null))}</PopoverContent>
              </Popover>
              <button aria-label={`Remove ${FILTER_LABELS[key]} filter`} className="mr-1 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-insights/15 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => removeFilter(key)}><X className="size-3.5" /></button>
            </span>)}
            {callId && <span className="inline-flex h-8 items-center gap-1 rounded-full border bg-muted pl-3 pr-1 text-xs">Showing inquiry from linked call<button aria-label="Show all inquiries" className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => { setCallId(null); setPage(0) }}><X className="size-3.5" /></button></span>}
            {anyFilter && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>Clear all</Button>}
          </div>}
          {staff.error && <p role="alert" className="text-sm text-destructive">Employees could not be loaded. <button className="underline" onClick={() => void staff.mutate()}>Retry</button></p>}
        </div>
        {invalidDates || invalidEventDates ? <p role="alert" className="p-8 text-sm text-destructive">{invalidDates ? "The received-from date must be on or before the end date." : "The event-from date must be on or before the event-through date."}</p> : error ? <div role="alert" className="p-10 text-center"><AlertTriangle className="mx-auto mb-3 size-6 text-destructive" /><p>Could not load sales inquiries.</p><Button className="mt-4" variant="outline" onClick={() => void mutate()}>Try again</Button></div> : isLoading ? <div role="status" className="flex justify-center gap-2 p-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Loading inquiries…</div> : !data?.items.length ? <div className="p-16 text-center"><Inbox className="mx-auto mb-4 size-8 text-muted-foreground" /><h3 className="font-medium">{anyFilter ? "No inquiries match these filters" : "Your sales inquiries will appear here"}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">When your voice agent captures a sales request, its details and email-send status are added automatically.</p>{!!data?.total && <Button variant="outline" className="mt-4" onClick={() => setPage(0)}>Return to first page</Button>}</div> : <>
          <div className="overflow-x-auto" role="region" aria-label="Inquiry list; scroll horizontally for more columns" tabIndex={0}>
            <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
              <colgroup><col className="w-[180px]" /><col /><col className="w-[150px]" /><col className="w-[185px]" /><col className="w-[150px]" /><col className="w-[165px]" /></colgroup>
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>
                {["Caller / received", "Request / dates", "AI-estimated budget", "Response status", "Assigned to", "Department / email"].map(h => <th key={h} scope="col" className="px-3 py-3 font-medium first:pl-4 last:pr-4">{h === "AI-estimated budget" ? <AiBudgetHelp label="AI budget estimate" /> : h}</th>)}
              </tr></thead>
              <tbody className="divide-y">{data.items.map(row => <tr key={row.id} className={`cursor-pointer align-top transition-colors hover:bg-muted/30 ${selectedId === row.id ? "bg-muted/40" : ""}`} onClick={() => { setSelected({ id: row.id, hotelId: row.hotel_id }); setDismissed(false) }}>
                <td className="py-3 pl-4 pr-3">
                  <button className="max-w-full truncate text-left font-medium hover:underline focus-visible:outline-ring" title={row.caller_name || "Name not provided"} onClick={() => setSelected({ id: row.id, hotelId: row.hotel_id })}>{row.caller_name || "Name not provided"}</button>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={row.callback_phone_e164 || row.caller_id_phone_e164 || row.email || undefined}>{row.callback_phone_e164 || row.caller_id_phone_e164 || row.email || "No contact provided"}</p>
                  <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{timestamp(row.created_at, tzOf(row.hotel_id))}</p>
                  {portfolio && <p className="mt-1 truncate text-xs font-medium text-muted-foreground" title={nameOf(row.hotel_id)}>{nameOf(row.hotel_id)}</p>}
                </td>
                <td className="px-3 py-3"><RequestSummary row={row} /></td>
                <td className={`px-3 py-3 text-xs leading-5 tabular-nums ${row.estimated_budget_min !== null || row.estimated_budget_max !== null ? "font-medium" : "text-muted-foreground"}`}>{formatAiBudget(row)}</td>
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}><StatusSelect row={row} disabled={!!busy || row.erased} onChange={v => void save(row, { follow_up_status: v })} /></td>
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}><OwnerSelect row={row} reps={staff.data?.[row.hotel_id] ?? []} disabled={!!busy || !staff.data || row.erased} onChange={name => void save(row, { assigned_rep: name })} /></td>
                <td className="py-3 pl-3 pr-4"><p className="mb-1.5 truncate text-xs leading-5" title={row.department_name || undefined}>{row.department_name || "No department"}</p><EmailBadge row={row} /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-5 py-4 text-xs text-muted-foreground"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total} inquiries</span><div className="flex items-center gap-2"><Button aria-label="Previous page" variant="outline" size="icon" disabled={!page} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button><Button aria-label="Next page" variant="outline" size="icon" disabled={(page + 1) * PAGE_SIZE >= data.total} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button></div></div>
        </>}
      </section>
      <p className="text-xs text-muted-foreground">Summary cards reflect your filters across all statuses. Booked outcomes are recorded by your sales team.</p>
    </div>
    <Dialog open={!!selectedId} onOpenChange={open => { if (!open && confirmDiscardUnsaved()) { setSelected(null); setDismissed(true) } }}>
      <DialogContent showCloseButton={false} className="[--brand-insights:#e8622d] [--primary:#e8622d] [--primary-foreground:#29140c] dark:[--brand-insights:#ff975c] dark:[--primary:#ff975c] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0 shadow-2xl sm:max-w-6xl">
        <DialogHeader className="relative shrink-0 border-b bg-card px-4 py-4 pr-14 text-left sm:px-6 sm:pr-14">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-insights/10 text-brand-insights"><Inbox className="size-4" /></span>
            <div><DialogTitle className="text-base tracking-tight">Sales inquiry</DialogTitle><DialogDescription className="mt-0.5 text-xs">Guest details &amp; follow-up</DialogDescription></div>
            <DialogClose asChild><button aria-label="Close inquiry" className="absolute right-4 top-5 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button></DialogClose>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {detail.error && !detail.data ? <div role="alert" className="p-6">Could not load this inquiry. <button className="underline" onClick={() => void detail.mutate()}>Retry</button></div> : !detail.data ? <div className="p-6" role="status">Loading inquiry…</div> : <InquiryPanel key={detail.data.id} row={detail.data} timezone={tzOf(detail.data.hotel_id)} hotelName={portfolio ? nameOf(detail.data.hotel_id) : null} reps={staff.data?.[detail.data.hotel_id] ?? []} staffReady={!!staff.data} busy={!!busy} save={save} setHotelId={setHotelId} />}
        </div>
      </DialogContent>
    </Dialog>
  </>
}

// A single-choice filter applies as soon as an option is picked.
function ChoiceEditor({ title, options, value, onPick }: { title: string; options: Option[]; value: string; onPick: (value: string) => void }) {
  return <div className="space-y-2">
    <p className="px-1 text-xs font-medium text-muted-foreground">{title} is</p>
    <div className="grid max-h-72 gap-0.5 overflow-y-auto">{options.map(o => <button key={o.value} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted" onClick={() => onPick(o.value)}>{o.label}{o.value === value && <Check className="size-4 shrink-0" />}</button>)}</div>
  </div>
}
function DateRangeEditor({ title, from: initialFrom, to: initialTo, applyLabel = "Apply", onApply, onCancel }: { title: string; from: string; to: string; applyLabel?: string; onApply: (from: string, to: string) => void; onCancel: () => void }) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const invalid = !!(from && to && from > to)
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!invalid && (from || to)) onApply(from, to) }}>
    <p className="text-xs font-medium text-muted-foreground">{title}</p>
    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <label className="space-y-1">From<Input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
      <label className="space-y-1">Through<Input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
    </div>
    {invalid && <p role="alert" className="text-xs text-destructive">The start date must be on or before the end date.</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" disabled={invalid || (!from && !to)}>{applyLabel}</Button></div>
  </form>
}
function BudgetEditor({ value: initial, applyLabel = "Apply", onApply, onCancel }: { value: string; applyLabel?: string; onApply: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  const valid = value !== "" && Number(value) >= 0
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (valid) onApply(value) }}>
    <label className="block space-y-1 text-xs font-medium text-muted-foreground">AI-estimated budget is at least
      <Input autoFocus inputMode="decimal" min="0" type="number" placeholder="e.g. 10000" value={value} onChange={e => setValue(e.target.value)} />
    </label>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" disabled={!valid}>{applyLabel}</Button></div>
  </form>
}

function InquiryPanel({ row, timezone, hotelName, reps, staffReady, busy, save, setHotelId }: { row: Awaited<ReturnType<typeof fetchSalesInquiry>>; timezone: string; hotelName: string | null; reps: string[]; staffReady: boolean; busy: boolean; save: (row: SalesInquiryItem, patch: Omit<SalesInquiryPatch, "version">) => Promise<boolean>; setHotelId: (id: string) => void }) {
  const [note, setNote] = useState("")
  // An erased inquiry is read-only: the server refuses every PATCH (409), so
  // the controls are disabled rather than letting a save bounce.
  const locked = busy || row.erased
  useEffect(() => {
    if (!note.trim()) return
    const unregister = registerUnsavedGuard(() => "Discard your unsaved follow-up note?")
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", beforeUnload)
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload) }
  }, [note])
  const initials = (row.caller_name || "Guest").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()
  const existing = isExisting(row)
  const category = row.event_category ? EVENT_CATEGORY_LABELS[row.event_category] : row.event_category_status === "failed" ? "Could not be categorized" : "Categorizing…"
  // An existing inquiry skipped the event questions, so their "Not provided"
  // rows would only be noise; anything the caller volunteered still shows.
  const discovery = existing ? [
    { label: "Working with", value: row.existing_contact_name || "Caller did not remember", icon: UserRound },
    { label: "Event", value: row.event_type || "Not mentioned", icon: Sparkles },
    { label: "Event category", value: category, icon: Sparkles },
    ...(row.event_dates_text || row.event_start_date ? [{ label: "Dates mentioned", value: dates(row), icon: CalendarDays }] : []),
  ] : [
    { label: "Request", value: requestLabel(row), icon: Sparkles },
    { label: "Event category", value: category, icon: Sparkles },
    { label: "Event dates", value: dates(row), icon: CalendarDays },
    { label: "Party size", value: formatHeadcount(row) ? `${formatHeadcount(row)} guests` : "Not provided", icon: Users },
    { label: "Budget stated by caller", value: row.budget_text ?? "Not provided", icon: Wallet },
    { label: "Guest rooms", value: row.needs_guest_rooms === null ? "Not provided" : row.needs_guest_rooms ? "Rooms needed" : "Not needed", icon: BedDouble },
  ]
  // Delivery is stored on the inquiry rather than in the follow-up log.
  // Merge it into the same newest-first timeline without changing server data.
  const activityTime = (value: string) => new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`).getTime()
  const activity = [
    ...[...row.activity].reverse().map(item => ({ kind: "follow_up" as const, id: item.id, at: item.at, item })),
    { kind: "notification" as const, id: `notification-${row.id}`, at: row.sent_at || row.created_at },
  ].sort((a, b) => activityTime(b.at) - activityTime(a.at))
  const panelControl = "h-11! w-full min-w-0 rounded-lg border-border bg-card text-sm shadow-xs focus-visible:ring-brand-insights/20"
  return <div className="space-y-5 p-4 sm:p-6">
    {notSentReason(row) && <p role="status" className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><span className="font-semibold">Email not sent.</span> {notSentReason(row)}</span></p>}
    <section className="relative overflow-hidden rounded-2xl border border-brand-insights/30 bg-card shadow-sm">
      <div className="h-1.5 bg-brand-insights" />
      <div className="bg-linear-to-br from-brand-insights/10 via-brand-insights/5 to-transparent p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Clock3 className="size-3.5" />{timestamp(row.created_at, timezone)}{hotelName && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{hotelName}</span>}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusStyle[row.follow_up_status]}`}><span className="size-1.5 rounded-full bg-current" />{statuses[row.follow_up_status]}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-brand-insights/20 bg-card text-lg font-semibold text-brand-insights shadow-xs">{initials}</div>
          <div className="min-w-0"><h2 className="break-words text-2xl font-semibold tracking-tight">{row.caller_name || "Name not provided"}</h2><div className="mt-1 flex flex-wrap items-center gap-2"><KindBadge row={row} /><p className="text-sm text-muted-foreground">{requestLabel(row)}</p></div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {row.callback_phone_e164 && <a className="inline-flex items-center gap-2 rounded-lg border border-brand-insights/15 bg-card px-3 py-2 text-sm font-medium shadow-xs transition-colors hover:border-brand-insights/40 hover:bg-brand-insights/5 focus-visible:outline-2 focus-visible:outline-ring" href={`tel:${row.callback_phone_e164}`}><Phone className="size-3.5 text-brand-insights" />{row.callback_phone_e164}<ArrowUpRight className="size-3 text-muted-foreground" /></a>}
          {/* The number they called from, whenever it isn't already the callback number above. */}
          {row.caller_id_phone_e164 && row.caller_id_phone_e164 !== row.callback_phone_e164 && <a className="inline-flex items-center gap-2 rounded-lg border border-brand-insights/15 bg-card px-3 py-2 text-sm font-medium shadow-xs transition-colors hover:border-brand-insights/40 hover:bg-brand-insights/5 focus-visible:outline-2 focus-visible:outline-ring" href={`tel:${row.caller_id_phone_e164}`}><Phone className="size-3.5 text-brand-insights" />{row.caller_id_phone_e164}<span className="text-xs font-normal text-muted-foreground">calling from</span><ArrowUpRight className="size-3 text-muted-foreground" /></a>}
          {row.email && <a className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-brand-insights/15 bg-card px-3 py-2 text-sm shadow-xs transition-colors hover:border-brand-insights/40 hover:bg-brand-insights/5 focus-visible:outline-2 focus-visible:outline-ring" href={`mailto:${row.email}`}><Mail className="size-3.5 shrink-0 text-brand-insights" /><span className="break-all">{row.email}</span></a>}
          {!row.callback_phone_e164 && !row.caller_id_phone_e164 && !row.email && <p className="text-sm text-muted-foreground">Contact details not available.</p>}
        </div>
      </div>
    </section>

    {(row.follow_up_url || row.provider_call_id) && <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
    {/* The same no-login link the notification email carried, re-derived
        server-side — for when that email was lost or the inquiry needs to go
        to someone who wasn't on it. */}
    {row.follow_up_url && <Button variant="outline" className="h-11 w-full rounded-xl bg-card text-sm sm:w-auto" onClick={async () => {
      try {
        await navigator.clipboard.writeText(row.follow_up_url!)
        toast.success("Update link copied", { description: "Anyone with this link can log follow-up on this inquiry — no sign-in needed." })
      } catch {
        toast.error("Could not copy the link", { description: "Your browser blocked clipboard access." })
      }
    }}><Link2 className="size-4 text-brand-insights" />Copy update link<ArrowUpRight className="ml-auto size-4 text-muted-foreground sm:ml-2" /></Button>}
    {row.provider_call_id && <Button variant="outline" className="h-11 w-full rounded-xl bg-card text-sm sm:w-auto" asChild><Link onClick={e => { if (!confirmDiscardUnsaved()) { e.preventDefault(); return } /* Client-side navigation keeps the provider mounted, so the URL's hotel_id is not re-read; switch scope to the row's hotel explicitly. */ setHotelId(row.hotel_id) }} href={`/call-log?${new URLSearchParams({ hotel_id: row.hotel_id, q: row.provider_call_id, line: "sales" })}`}><Phone className="size-4 text-brand-insights" />View original call<ArrowUpRight className="ml-auto size-4 text-muted-foreground sm:ml-2" /></Link></Button>}
    </div>}

    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-3.5"><Sparkles className="size-4 text-brand-insights" /><h3 className="text-sm font-semibold">{existing ? "Inquiry details" : "Discovery details"}</h3></div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 p-5 min-[400px]:grid-cols-2">
            {discovery.map(field => <div key={field.label} className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><field.icon className="size-4" /></span>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{field.label}</dt><dd className="mt-1 break-words text-sm font-medium leading-relaxed">{field.value}</dd></div>
            </div>)}
            {!existing && <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><Wallet className="size-4" /></span>
              <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground"><AiBudgetHelp label="AI-estimated total budget" /></dt><dd className="mt-1 break-words text-sm font-medium leading-relaxed tabular-nums">{formatAiBudget(row)}</dd></div>
            </div>}
            {row.custom_answers?.map((entry, index) => (
              <div key={`${entry.question_id}-${index}`} className="flex items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><MessageSquareText className="size-4" /></span>
                <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground whitespace-pre-wrap break-words">{entry.question || "Additional question"}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{entry.answer}</dd></div>
              </div>
            ))}
          </dl>
          {row.notes && <div className="mx-5 mb-5 rounded-r-lg border-l-2 border-brand-insights/50 bg-brand-insights/5 px-3.5 py-3"><p className="mb-1 text-[11px] font-medium text-brand-insights">{existing ? "What they need" : "From the caller"}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.notes}</p></div>}
        </section>

        {row.call_record_id && <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-3.5"><Headphones className="size-4 text-brand-insights" /><h3 className="text-sm font-semibold">Call recording</h3></div>
          <div className="p-5">
            {row.has_recording && row.call_created_at
              ? <CallRecordingPlayer callId={row.call_record_id} createdAt={row.call_created_at} />
              : <p className="text-sm text-muted-foreground">No recording is available for this call.</p>}
          </div>
        </section>}
      </div>
      <div className="min-w-0 space-y-5">
        {row.erased && <p role="status" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive">This inquiry was erased under a privacy request. Its caller details are gone and it can no longer be updated.</p>}
        <section className="overflow-hidden rounded-2xl border border-brand-insights/35 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-brand-insights/25 bg-brand-insights/10 px-5 py-4"><div className="flex items-center gap-2"><Phone className="size-4 text-brand-insights" /><h3 className="text-sm font-semibold">Response</h3></div><span className="text-[11px] text-muted-foreground">Keep your team in the loop</span></div>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <div className="min-w-0"><p className="mb-2 text-xs font-medium text-muted-foreground">Response status</p>
                <Select value={row.follow_up_status} disabled={locked} onValueChange={status => void save(row, { follow_up_status: status as SalesFollowUpStatus })}>
                  <SelectTrigger aria-label={`Status for ${row.caller_name || "inquiry"}`} className={`${panelControl} ${statusStyle[row.follow_up_status]}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(statuses).map(([value, label]) => <SelectItem key={value} value={value}><span className="inline-flex items-center gap-2"><span className={`size-2 rounded-full border ${statusStyle[value as SalesFollowUpStatus]}`} />{label}</span></SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-0"><p className="mb-2 text-xs font-medium text-muted-foreground">Assigned to</p>
                <Select value={row.assigned_rep || "unassigned"} disabled={locked || !staffReady} onValueChange={name => void save(row, { assigned_rep: name === "unassigned" ? null : name })}>
                  <SelectTrigger aria-label={`Assigned salesperson for ${row.caller_name || "inquiry"}`} className={panelControl}><span className="flex min-w-0 items-center gap-2"><UserRound className="size-3.5 shrink-0 text-muted-foreground" /><SelectValue /></span></SelectTrigger>
                  <SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{row.assigned_rep && !reps.includes(row.assigned_rep) && <SelectItem value={row.assigned_rep}>{row.assigned_rep} (no longer on the team)</SelectItem>}{reps.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" className="h-10 w-full rounded-lg border-brand-insights/40 bg-brand-insights/10 font-semibold text-foreground shadow-none hover:bg-brand-insights/20 hover:text-foreground [&_svg]:text-brand-insights" disabled={locked} onClick={() => void save(row, { follow_up_status: "call_attempted" })}><Phone className="size-3.5" />Log call attempt</Button>
            <div className="border-t pt-4"><label htmlFor="follow-up-note" className="flex items-center gap-2 text-xs font-medium"><MessageSquareText className="size-3.5 text-muted-foreground" />Internal note</label>
              <div className="mt-2.5 overflow-hidden rounded-xl border bg-background/50 transition-shadow focus-within:border-brand-insights/50 focus-within:ring-2 focus-within:ring-brand-insights/10">
                <Textarea id="follow-up-note" className="min-h-24 resize-y rounded-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0 dark:bg-transparent" placeholder="Add a conversation update or next step…" maxLength={4000} value={note} disabled={locked} onChange={e => setNote(e.target.value)} />
                <div className="flex items-center justify-between border-t bg-card px-3 py-2.5"><span className="text-[11px] tabular-nums text-muted-foreground">{note.length.toLocaleString()} / 4,000</span><Button size="sm" className="rounded-lg px-3.5 font-semibold" disabled={locked || !note.trim()} onClick={async () => { if (await save(row, { note: note.trim() })) setNote("") }}><Send className="size-3.5" />Save note</Button></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <section className="px-1 pt-1">
      <div className="mb-4 flex items-center gap-2"><History className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Activity</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{activity.length}</span></div>
      <ol className="ml-3 border-l border-brand-insights/20">
        {activity.map(entry => <li key={entry.id} className="relative pb-5 pl-6 last:pb-0">
          <span className="absolute -left-3 flex size-6 items-center justify-center rounded-full border border-brand-insights/20 bg-card text-brand-insights">
            {entry.kind === "notification" ? <Mail className="size-3" /> : entry.item.kind === "note" ? <MessageSquareText className="size-3" /> : entry.item.kind === "assignment" ? <UserRound className="size-3" /> : <CheckCircle2 className="size-3" />}
          </span>
          <div className="rounded-xl border bg-card p-3.5 shadow-xs">
            {entry.kind === "notification" ? <>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Sales team notification</p><EmailBadge row={row} /></div>{row.department_name && row.email_status !== "not_sent" && <p className="mt-1 text-xs"><span className="text-muted-foreground">Routed to </span><span className="font-medium">{row.department_name}</span></p>}<p className="mt-1 break-all text-xs text-muted-foreground">{row.email_status === "not_sent" ? "No email was sent." : row.sent_to ? <>To: {row.sent_to}</> : "Recipient not recorded"}</p>{row.sent_cc && <p className="mt-0.5 break-all text-xs text-muted-foreground">CC: {row.sent_cc}</p>}<p className="mt-2 text-[11px] text-muted-foreground">{row.sent_at ? <>Sent {timestamp(row.sent_at, timezone)}</> : <>Inquiry received {timestamp(row.created_at, timezone)}</>}</p>
              {emailView(row.email_status) === "sending" && <p className="mt-3 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">The email is on its way. If a send fails it is retried automatically for about an hour — there is nothing you need to do.</p>}
              {notSentReason(row) && <p className="mt-2 text-xs leading-relaxed text-destructive">{notSentReason(row)}</p>}
            </> : <>
              <p className="break-words text-sm font-medium leading-relaxed">{entry.item.text}</p>
              {entry.item.note && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{entry.item.note}</p>}
              <p className="mt-2 break-all text-[11px] text-muted-foreground">{entry.item.actor}<span className="mx-1.5">·</span>{timestamp(entry.at, timezone)}{entry.item.source === "email_link" && <><span className="mx-1.5">·</span>via email link</>}</p>
            </>}
          </div>
        </li>)}
      </ol>
    </section>
  </div>
}
