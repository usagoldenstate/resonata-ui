"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Link2, Loader2, Mail, Phone, RefreshCw, Search, Users, CalendarDays, BedDouble, MessageSquareText, Clock3, UserRound, Sparkles, Send, History, Wallet, X } from "lucide-react"
import { toast } from "sonner"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet"
import { AiBudgetHelp, formatAiBudget } from "@/components/ai-budget-estimate"
import { useHotel, type HotelListItem } from "@/lib/hotel-context"
type Selection = { id: string; hotelId: string }
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { confirmDiscardUnsaved, registerUnsavedGuard } from "@/lib/unsaved-guard"
import { ApiError, fetchSalesAssignees, formatHeadcount, fetchSalesInquiries, fetchSalesInquiry, updateSalesInquiry, type SalesFollowUpStatus, type SalesInquiryItem, type SalesInquiryPatch } from "@/lib/api"

const statuses: Record<SalesFollowUpStatus, string> = { new: "New", call_attempted: "Call attempted", contacted: "Spoke with caller", booked: "Booked / Won", closed: "Closed / Not proceeding" }
const statusStyle: Record<SalesFollowUpStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200",
  call_attempted: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200",
  contacted: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200",
  booked: "bg-[#6b7a4a]/10 text-[#6b7a4a] border-[#6b7a4a]/30",
  closed: "bg-muted text-muted-foreground border-border",
}
const selectClass = "h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
const PAGE_SIZE = 25

function timestamp(value: string | null, timezone: string) {
  if (!value) return "—"
  // SQLite fixtures return naive UTC; production returns timezone-aware dates.
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(normalized))
}
function dates(row: SalesInquiryItem) {
  const parts = row.event_dates_text || [row.event_start_date, row.event_end_date !== row.event_start_date ? row.event_end_date : null].filter(Boolean).join(" – ") || "Dates not provided"
  return `${parts}${row.dates_flexible ? " · Flexible" : ""}`
}
// The notification is sent by a background task once the inquiry row is
// committed, so "sending" normally lasts seconds. One that has sat there for
// minutes means the process died mid-send (there is no retry cron), and it
// needs the same manual forwarding a failed send does.
const STALE_SEND_MS = 5 * 60 * 1000
function emailStale(row: Pick<SalesInquiryItem, "email_status" | "created_at">): boolean {
  return row.email_status === "sending" && Date.now() - new Date(row.created_at).getTime() > STALE_SEND_MS
}
function EmailBadge({ row }: { row: Pick<SalesInquiryItem, "email_status" | "created_at"> }) {
  const status = row.email_status
  const stale = emailStale(row)
  const problem = status === "gave_up" || stale
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${problem ? "text-destructive" : "text-muted-foreground"}`}>
    {problem ? <AlertTriangle className="size-3.5" /> : <Mail className="size-3.5" />}
    {status === "sent" ? "Sent" : status === "gave_up" ? "Not delivered" : status === "failed" ? "Retrying" : stale ? "Send stuck" : "Sending"}
  </span>
}
function StatusSelect({ row, disabled, onChange }: { row: SalesInquiryItem; disabled: boolean; onChange: (status: SalesFollowUpStatus) => void }) {
  return <select aria-label={`Status for ${row.caller_name || "inquiry"}`} className={`${selectClass} ${statusStyle[row.follow_up_status]}`} value={row.follow_up_status} disabled={disabled} onChange={e => onChange(e.target.value as SalesFollowUpStatus)}>
    {Object.entries(statuses).map(([value, label]) => <option className="bg-background text-foreground" key={value} value={value}>{label}</option>)}
  </select>
}
function OwnerSelect({ row, reps, disabled, onChange }: { row: SalesInquiryItem; reps: string[]; disabled: boolean; onChange: (name: string | null) => void }) {
  // Names come from the hotel's sales-team roster (Settings), not user
  // accounts. A name since removed from the roster still shows on the rows it
  // was saved against — history is never rewritten by a roster edit.
  return <select aria-label={`Assigned salesperson for ${row.caller_name || "inquiry"}`} className={`${selectClass} w-44`} value={row.assigned_rep || ""} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
    <option value="">Unassigned</option>
    {row.assigned_rep && !reps.includes(row.assigned_rep) && <option value={row.assigned_rep}>{row.assigned_rep} (no longer on the team)</option>}
    {reps.map(name => <option key={name} value={name}>{name}</option>)}
  </select>
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
  const [eventType, setEventType] = useState("")
  const [status, setStatus] = useState("")
  const [owner, setOwner] = useState("")
  const [email, setEmail] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [eventFrom, setEventFrom] = useState("")
  const [eventTo, setEventTo] = useState("")
  const [budgetMinimum, setBudgetMinimum] = useState("")
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(0)
  const [callId, setCallId] = useState(initialCall)
  // The selection carries its hotel so the detail request survives the row
  // leaving the current page (e.g. a status change while filtering by status).
  // A deep link (`?inquiry_id=`) arrives with `?hotel_id=`, which on a full
  // load forces single-hotel scope, so the one hotel in scope is its hotel.
  const [selected, setSelected] = useState<Selection | null>(initialInquiry && hotels.length === 1 ? { id: initialInquiry, hotelId: hotels[0].hotel_id } : null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const saving = useRef(false)
  const q = useDebouncedValue(search, 300)
  const event = useDebouncedValue(eventType, 300)
  const invalidDates = !!(dateFrom && dateTo && dateFrom > dateTo)
  const invalidEventDates = !!(eventFrom && eventTo && eventFrom > eventTo)
  const filters = { q, event_type: event, status, assigned_rep: owner && owner !== "unassigned" ? owner : undefined, unassigned: owner === "unassigned", email_status: email, date_from: dateFrom, date_to: dateTo, event_from: eventFrom, event_to: eventTo, budget_value_gte: budgetMinimum, sort, call_id: callId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const { data, error, isLoading, isValidating, mutate } = useSWR(invalidDates || invalidEventDates ? null : ["sales-inquiries", hotelIds.join(","), filters], () => fetchSalesInquiries(hotelIds, filters), { refreshInterval: 30000 })
  const staff = useSWR<Rosters>(["sales-assignees", hotelIds.join(",")], async () => Object.fromEntries(await Promise.all(hotelIds.map(async id => [id, await fetchSalesAssignees(id)] as const))))
  const linkedRow = !dismissed && callId ? data?.items[0] : undefined
  const current: Selection | null = selected || (linkedRow ? { id: linkedRow.id, hotelId: linkedRow.hotel_id } : null)
  const selectedId = current?.id ?? null
  const detail = useSWR(current ? ["sales-inquiry", current.hotelId, current.id] : null, () => fetchSalesInquiry(current!.hotelId, current!.id), { refreshInterval: 30000 })
  const reps = mergeRosters(staff.data, hotelIds)
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
  function clearFilters() { setSearch(""); setEventType(""); setStatus(""); setOwner(""); setEmail(""); setDateFrom(""); setDateTo(""); setEventFrom(""); setEventTo(""); setBudgetMinimum(""); setSort("newest"); setCallId(null); setPage(0) }
  const counts = data?.counts
  const cards = [
    { label: "New inquiries", value: counts?.new || 0, icon: Inbox, color: "text-blue-600" },
    { label: "Follow-up in progress", value: (counts?.call_attempted || 0) + (counts?.contacted || 0), icon: Phone, color: "text-amber-600" },
    { label: "Booked", value: counts?.booked || 0, icon: CheckCircle2, color: "text-[#6b7a4a]" },
    { label: "Closed / Not booked", value: counts?.closed || 0, icon: Users, color: "text-muted-foreground" },
  ]
  return <>
    <header className="flex items-center justify-between gap-4 border-b bg-card px-8 py-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Sales Inquiries</h1><p className="mt-1 text-sm text-muted-foreground">Every sales call captured. Every follow-up in one place.</p></div>
      <div className="flex items-center gap-2"><Button variant="outline" size="sm" asChild><Link href="/sales-reports"><Mail className="size-4" />Weekly report</Link></Button><Button variant="outline" size="sm" disabled={isValidating} onClick={() => { void mutate(); void staff.mutate(); void detail.mutate() }}><RefreshCw className={`size-4 ${isValidating ? "animate-spin" : ""}`} />Refresh</Button></div>
    </header>
    <div className="space-y-6 p-6 lg:p-8">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{cards.map(card => <div key={card.label} className="metric-card rounded-2xl border border-border/80 bg-card p-5 shadow-xs"><div className="flex items-center justify-between text-sm text-muted-foreground">{card.label}<card.icon className={`size-4 ${card.color}`} /></div><p className="metric-value mt-3 text-3xl font-semibold tabular-nums">{!data || error || invalidDates || invalidEventDates ? "—" : card.value}</p></div>)}</div>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Sales inquiries">
        <div className="space-y-4 border-b p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Incoming inquiries</h2><p className="mt-1 text-xs text-muted-foreground">Automatically captured by your voice agent · Received times in {portfolio ? "each hotel's local time" : tzOf(hotelIds[0])}</p></div><Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button></div>
          <div className="flex flex-wrap gap-3">
            <label className="relative min-w-60 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search inquiries" placeholder="Search name, phone, email, or request…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} className="pl-9" /></label>
            <select aria-label="Filter by status" className={selectClass} value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="">All statuses</option>{Object.entries(statuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
            <select aria-label="Filter by salesperson" className={selectClass} value={owner} onChange={e => { setOwner(e.target.value); setPage(0) }}><option value="">All salespeople</option><option value="unassigned">Unassigned</option>{reps.map(name => <option key={name} value={name}>{name}</option>)}</select>
            <select aria-label="Filter by email send status" className={selectClass} value={email} onChange={e => { setEmail(e.target.value); setPage(0) }}><option value="">All email statuses</option><option value="sent">Sent</option><option value="sending">Sending</option><option value="failed">Retrying</option><option value="gave_up">Not delivered</option></select>
            <select aria-label="Sort inquiries" className={selectClass} value={sort} onChange={e => { setSort(e.target.value); setPage(0) }}><option value="newest">Newest first</option><option value="budget_desc">Highest AI-estimated budget</option><option value="event_date_asc">Soonest event</option><option value="headcount_desc">Largest party</option></select>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-xs text-muted-foreground">
            <label className="space-y-1">Received from<Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} /></label>
            <label className="space-y-1">Received through<Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} /></label>
            <label className="space-y-1">Event from<Input type="date" value={eventFrom} onChange={e => { setEventFrom(e.target.value); setPage(0) }} /></label>
            <label className="space-y-1">Event through<Input type="date" value={eventTo} onChange={e => { setEventTo(e.target.value); setPage(0) }} /></label>
            <label className="space-y-1">Potential budget at least<Input aria-label="Potential AI-estimated budget at least" inputMode="decimal" min="0" type="number" placeholder="e.g. 10000" value={budgetMinimum} onChange={e => { setBudgetMinimum(e.target.value); setPage(0) }} /></label>
            <label className="space-y-1">Event type<Input placeholder="e.g. wedding" value={eventType} onChange={e => { setEventType(e.target.value); setPage(0) }} /></label>
            {callId && <span className="rounded-md bg-muted px-3 py-2">Showing inquiry from linked call</span>}
          </div>
          {staff.error && <p role="alert" className="text-sm text-destructive">Employees could not be loaded. <button className="underline" onClick={() => void staff.mutate()}>Retry</button></p>}
        </div>
        {invalidDates || invalidEventDates ? <p role="alert" className="p-8 text-sm text-destructive">{invalidDates ? "The received-from date must be on or before the end date." : "The event-from date must be on or before the event-through date."}</p> : error ? <div role="alert" className="p-10 text-center"><AlertTriangle className="mx-auto mb-3 size-6 text-destructive" /><p>Could not load sales inquiries.</p><Button className="mt-4" variant="outline" onClick={() => void mutate()}>Try again</Button></div> : isLoading ? <div role="status" className="flex justify-center gap-2 p-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Loading inquiries…</div> : !data?.items.length ? <div className="p-16 text-center"><Inbox className="mx-auto mb-4 size-8 text-muted-foreground" /><h3 className="font-medium">{search || status || owner || email || dateFrom || dateTo || eventFrom || eventTo || budgetMinimum || eventType || callId ? "No inquiries match these filters" : "Your sales inquiries will appear here"}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">When your voice agent captures a sales request, its details and email-send status are added automatically.</p>{!!data?.total && <Button variant="outline" className="mt-4" onClick={() => setPage(0)}>Return to first page</Button>}</div> : <>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>{["Received", ...(portfolio ? ["Hotel"] : []), "Caller", "Request / dates", "AI-estimated budget", "Status", "Assigned to", "Email"].map(h => <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">{h === "AI-estimated budget" ? <AiBudgetHelp /> : h}</th>)}</tr></thead>
            <tbody className="divide-y">{data.items.map(row => <tr key={row.id} className="cursor-pointer transition-colors hover:bg-muted/30" onClick={() => { setSelected({ id: row.id, hotelId: row.hotel_id }); setDismissed(false) }}>
              <td className="whitespace-nowrap px-5 py-5 text-xs text-muted-foreground">{timestamp(row.created_at, tzOf(row.hotel_id))}</td>
              {portfolio && <td className="whitespace-nowrap px-5 py-5"><span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{nameOf(row.hotel_id)}</span></td>}
              <td className="px-5 py-5"><button className="text-left font-medium hover:underline focus-visible:outline-ring" onClick={() => setSelected({ id: row.id, hotelId: row.hotel_id })}>{row.caller_name || "Name not provided"}</button><p className="mt-1 text-xs text-muted-foreground">{row.callback_phone_e164 || row.caller_id_phone_e164 || row.email || "No contact provided"}</p></td>
              <td className="max-w-64 px-5 py-5"><p className="font-medium">{row.event_type}{formatHeadcount(row) ? ` · ${formatHeadcount(row)} guests` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{dates(row)}</p></td>
              <td className="whitespace-nowrap px-5 py-5 font-medium tabular-nums">{formatAiBudget(row)}</td>
              <td className="px-5 py-5" onClick={e => e.stopPropagation()}><StatusSelect row={row} disabled={!!busy} onChange={v => void save(row, { follow_up_status: v })} /></td>
              <td className="px-5 py-5" onClick={e => e.stopPropagation()}><OwnerSelect row={row} reps={staff.data?.[row.hotel_id] ?? []} disabled={!!busy || !staff.data} onChange={name => void save(row, { assigned_rep: name })} /></td>
              <td className="px-5 py-5"><EmailBadge row={row} /></td>
            </tr>)}</tbody></table></div>
          <div className="flex items-center justify-between border-t px-5 py-4 text-xs text-muted-foreground"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total} inquiries</span><div className="flex items-center gap-2"><Button aria-label="Previous page" variant="outline" size="icon" disabled={!page} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button><Button aria-label="Next page" variant="outline" size="icon" disabled={(page + 1) * PAGE_SIZE >= data.total} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button></div></div>
        </>}
      </section>
      <p className="text-xs text-muted-foreground">Summary cards reflect your filters across all statuses. Booked outcomes are recorded by your sales team.</p>
    </div>
    <Sheet open={!!selectedId} onOpenChange={open => { if (!open && confirmDiscardUnsaved()) { setSelected(null); setDismissed(true) } }}>
      <SheetContent className="w-full gap-0 overflow-y-auto bg-background sm:max-w-[600px] [&>button:last-child]:hidden">
        <SheetHeader className="sticky top-0 z-10 border-b bg-card/95 px-6 py-4 pr-12 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-insights/10 text-brand-insights"><Inbox className="size-4" /></span>
            <div><SheetTitle className="text-base tracking-tight">Sales inquiry</SheetTitle><SheetDescription className="mt-0.5 text-xs">Guest details &amp; follow-up</SheetDescription></div>
            <SheetClose asChild><button aria-label="Close inquiry" className="absolute right-4 top-5 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button></SheetClose>
          </div>
        </SheetHeader>
        {detail.error && !detail.data ? <div role="alert" className="p-6">Could not load this inquiry. <button className="underline" onClick={() => void detail.mutate()}>Retry</button></div> : !detail.data ? <div className="p-6" role="status">Loading inquiry…</div> : <InquiryPanel key={detail.data.id} row={detail.data} timezone={tzOf(detail.data.hotel_id)} hotelName={portfolio ? nameOf(detail.data.hotel_id) : null} reps={staff.data?.[detail.data.hotel_id] ?? []} staffReady={!!staff.data} busy={!!busy} save={save} setHotelId={setHotelId} />}
      </SheetContent>
    </Sheet>
  </>
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
  const discovery = [
    { label: "Request", value: row.event_type, icon: Sparkles },
    { label: "Event dates", value: dates(row), icon: CalendarDays },
    { label: "Party size", value: formatHeadcount(row) ? `${formatHeadcount(row)} guests` : "Not provided", icon: Users },
    { label: "Budget stated by caller", value: row.budget_text ?? "Not provided", icon: Wallet },
    { label: "Guest rooms", value: row.needs_guest_rooms === null ? "Not provided" : row.needs_guest_rooms ? "Rooms needed" : "Not needed", icon: BedDouble },
  ]
  const panelControl = "h-11! w-full min-w-0 rounded-lg border-border bg-card text-sm shadow-xs focus-visible:ring-brand-insights/20"
  return <div className="space-y-5 p-4 sm:p-6">
    <section className="relative overflow-hidden rounded-2xl border border-brand-insights/20 bg-card shadow-sm">
      <div className="h-1 bg-brand-insights" />
      <div className="bg-linear-to-br from-brand-insights/10 via-brand-insights/5 to-transparent p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Clock3 className="size-3.5" />{timestamp(row.created_at, timezone)}{hotelName && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{hotelName}</span>}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusStyle[row.follow_up_status]}`}><span className="size-1.5 rounded-full bg-current" />{statuses[row.follow_up_status]}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-brand-insights/20 bg-card text-lg font-semibold text-brand-insights shadow-xs">{initials}</div>
          <div className="min-w-0"><h2 className="break-words text-2xl font-semibold tracking-tight">{row.caller_name || "Name not provided"}</h2><p className="mt-0.5 text-sm text-muted-foreground">{row.event_type}</p></div>
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

    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3.5"><Sparkles className="size-4 text-brand-insights" /><h3 className="text-sm font-semibold">Discovery details</h3></div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 p-5 min-[400px]:grid-cols-2">
        {discovery.map(field => <div key={field.label} className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><field.icon className="size-4" /></span>
          <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{field.label}</dt><dd className="mt-1 break-words text-sm font-medium leading-relaxed">{field.value}</dd></div>
        </div>)}
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground"><Wallet className="size-4" /></span>
          <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground"><AiBudgetHelp label="AI-estimated total budget" /></dt><dd className="mt-1 break-words text-sm font-medium leading-relaxed tabular-nums">{formatAiBudget(row)}</dd></div>
        </div>
      </dl>
      {row.notes && <div className="mx-5 mb-5 rounded-r-lg border-l-2 border-brand-insights/50 bg-brand-insights/5 px-3.5 py-3"><p className="mb-1 text-[11px] font-medium text-brand-insights">From the caller</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.notes}</p></div>}
    </section>

    <section className="rounded-xl border bg-card px-4 py-3.5 shadow-xs">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${row.email_status === "gave_up" ? "bg-destructive/10 text-destructive" : "bg-brand-insights/10 text-brand-insights"}`}>{row.email_status === "sent" ? <CheckCircle2 className="size-4" /> : <Mail className="size-4" />}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Sales team notification</h3><EmailBadge row={row} /></div><p className="mt-1 break-all text-xs text-muted-foreground">{row.sent_to || "Recipient not recorded"}</p>{row.sent_at && <p className="mt-1 text-[11px] text-muted-foreground">Sent {timestamp(row.sent_at, timezone)}</p>}</div>
      </div>
      {row.email_status === "gave_up" && <p className="mt-3 rounded-lg bg-destructive/5 p-3 text-xs leading-relaxed text-destructive">The notification could not be delivered after repeated attempts. The inquiry is saved here so your team can follow up.</p>}
      {row.email_status === "failed" && <p className="mt-3 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">The last send attempt failed. It is retried automatically every 10 minutes for about an hour.</p>}
      {emailStale(row) && <p className="mt-3 rounded-lg bg-destructive/5 p-3 text-xs leading-relaxed text-destructive">The notification never finished sending. The inquiry is saved here — forward it to your sales team manually.</p>}
    </section>

    {row.erased && <p role="status" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive">This inquiry was erased under a privacy request. Its caller details are gone and it can no longer be updated.</p>}
    <section className="overflow-hidden rounded-2xl border border-brand-insights/25 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-brand-insights/15 bg-brand-insights/5 px-5 py-4"><div className="flex items-center gap-2"><Phone className="size-4 text-brand-insights" /><h3 className="text-sm font-semibold">Follow-up</h3></div><span className="text-[11px] text-muted-foreground">Keep your team in the loop</span></div>
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <div className="min-w-0"><p className="mb-2 text-xs font-medium text-muted-foreground">Status</p>
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
        <Button variant="outline" className="h-10 w-full rounded-lg border-brand-insights/25 bg-brand-insights/5 text-brand-insights shadow-none hover:bg-brand-insights/10 hover:text-brand-insights" disabled={locked} onClick={() => void save(row, { follow_up_status: "call_attempted" })}><Phone className="size-3.5" />Log call attempt</Button>
        <div className="border-t pt-4"><label htmlFor="follow-up-note" className="flex items-center gap-2 text-xs font-medium"><MessageSquareText className="size-3.5 text-muted-foreground" />Internal note</label>
          <div className="mt-2.5 overflow-hidden rounded-xl border bg-background/50 transition-shadow focus-within:border-brand-insights/50 focus-within:ring-2 focus-within:ring-brand-insights/10">
            <Textarea id="follow-up-note" className="min-h-24 resize-y rounded-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0 dark:bg-transparent" placeholder="Add a conversation update or next step…" maxLength={4000} value={note} disabled={locked} onChange={e => setNote(e.target.value)} />
            <div className="flex items-center justify-between border-t bg-card px-3 py-2.5"><span className="text-[11px] tabular-nums text-muted-foreground">{note.length.toLocaleString()} / 4,000</span><Button size="sm" className="rounded-lg px-3.5" disabled={locked || !note.trim()} onClick={async () => { if (await save(row, { note: note.trim() })) setNote("") }}><Send className="size-3.5" />Save note</Button></div>
          </div>
        </div>
      </div>
    </section>

    <section className="px-1 pt-1"><div className="mb-4 flex items-center gap-2"><History className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Activity</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{row.activity.length}</span></div>
      {!row.activity.length ? <div className="rounded-xl border border-dashed px-5 py-6 text-center"><MessageSquareText className="mx-auto mb-2 size-5 text-brand-insights/60" /><p className="text-sm font-medium">Ready for the first follow-up</p><p className="mt-1 text-xs text-muted-foreground">Call attempts, notes, and updates will appear here.</p></div> : <ol className="ml-3 border-l border-brand-insights/20">{[...row.activity].reverse().map(item => <li key={item.id} className="relative pb-5 pl-6 last:pb-0"><span className="absolute -left-3 flex size-6 items-center justify-center rounded-full border border-brand-insights/20 bg-card text-brand-insights">{item.kind === "note" ? <MessageSquareText className="size-3" /> : item.kind === "assignment" ? <UserRound className="size-3" /> : <CheckCircle2 className="size-3" />}</span><div className="rounded-xl border bg-card p-3.5 shadow-xs"><p className="break-words text-sm font-medium leading-relaxed">{item.text}</p>{item.note && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{item.note}</p>}<p className="mt-2 break-all text-[11px] text-muted-foreground">{item.actor}<span className="mx-1.5">·</span>{timestamp(item.at, timezone)}{item.source === "email_link" && <><span className="mx-1.5">·</span>via email link</>}</p></div></li>)}</ol>}
    </section>
    {/* The same no-login link the notification email carried, re-derived
        server-side — for when that email was lost or the inquiry needs to go
        to someone who wasn't on it. */}
    {row.follow_up_url && <Button variant="outline" className="h-11 w-full rounded-xl bg-card text-sm" onClick={async () => {
      try {
        await navigator.clipboard.writeText(row.follow_up_url!)
        toast.success("Update link copied", { description: "Anyone with this link can log follow-up on this inquiry — no sign-in needed." })
      } catch {
        toast.error("Could not copy the link", { description: "Your browser blocked clipboard access." })
      }
    }}><Link2 className="size-4 text-brand-insights" />Copy update link<ArrowUpRight className="ml-auto size-4 text-muted-foreground" /></Button>}
    {row.provider_call_id && <Button variant="outline" className="h-11 w-full rounded-xl bg-card text-sm" asChild><Link onClick={e => { if (!confirmDiscardUnsaved()) { e.preventDefault(); return } /* Client-side navigation keeps the provider mounted, so the URL's hotel_id is not re-read; switch scope to the row's hotel explicitly. */ setHotelId(row.hotel_id) }} href={`/call-log?${new URLSearchParams({ hotel_id: row.hotel_id, call_id: row.provider_call_id, line: "sales" })}`}><Phone className="size-4 text-brand-insights" />View original call<ArrowUpRight className="ml-auto size-4 text-muted-foreground" /></Link></Button>}
  </div>
}
