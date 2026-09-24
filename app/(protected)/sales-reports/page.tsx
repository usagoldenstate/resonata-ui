"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, ArrowUpRight, Download, Mail, Monitor, Smartphone, Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useHotel } from "@/lib/hotel-context"
import { api, withQuery } from "@/lib/api"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"

type Subscription = { enabled: boolean; recipients: string[]; send_day: number; send_hour: number; stale_hours: number }
type Settings = { subscription: Subscription; timezone: string; deliveries: { week_start: string; recipient: string; status: string; sent_at: string | null }[] }
type Preview = { html: string; text: string; report: { hotel_name: string; period_label: string; leads: number; trend: string; budget: { display: string; known: number }; overdue: number; responded: number; average_response_hours: number | null; demo: boolean } }
const selectStyle = "w-full rounded-lg border bg-background p-2.5 text-sm"

export default function SalesReportsPage() {
  const { hotelId, scopeHotels, loading, error } = useHotel()
  return <div className="flex h-screen bg-background"><Sidebar /><main className="app-content min-w-0 flex-1 overflow-auto">
    {hotelId ? <ReportWorkspace key={hotelId} hotelId={hotelId} name={scopeHotels[0]?.display_name || "Hotel"} /> : <p className="p-8">{loading ? "Loading hotel…" : error || "Select a hotel to view its weekly report."}</p>}
  </main></div>
}

function ReportWorkspace({ hotelId, name }: { hotelId: string; name: string }) {
  const [demo, setDemo] = useState(false)
  const [week, setWeek] = useState("")
  const [mobile, setMobile] = useState(false)
  const settings = useSWR(["sales-report-settings", hotelId], () => api<Settings>(withQuery("/api/v1/sales-reports/settings", { hotel_id: hotelId })), { keepPreviousData: false })
  const preview = useSWR(["sales-report-preview", hotelId, demo, week], () => api<Preview>(withQuery("/api/v1/sales-reports/preview", { hotel_id: hotelId, demo, week_start: week })), { keepPreviousData: false })
  const report = preview.data?.report
  function download() {
    if (!preview.data) return
    const url = URL.createObjectURL(new Blob([preview.data.html], { type: "text/html;charset=utf-8" }))
    const a = document.createElement("a"); a.href = url; a.download = `resonata-weekly-sales${demo ? "-demo" : ""}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-6 lg:px-8">
      <div><Link href="/sales-inquiries" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" />Sales inquiries</Link><h1 className="text-2xl font-semibold tracking-tight">The weekly sales brief</h1><p className="mt-1 text-sm text-muted-foreground">A clear view of opportunity, momentum, and what needs attention.</p></div>
      <Button variant="outline" disabled={!preview.data || !!preview.error} onClick={download}><Download className="size-4" />Download email</Button>
    </header>
    <div className="space-y-6 p-6 lg:p-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#233a36] p-6 text-[#fffdf8]">
        <div><p className="text-[10px] uppercase tracking-[.2em] text-[#ced9bd]">Executive intelligence · {name}</p><h2 className="mt-2 font-serif text-2xl">Every inquiry has a next step.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#d9e0d4]">See the value your sales line captures, measure follow-up, and give your team a focused action list every week.</p></div>
        <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setDemo(!demo)}><Sparkles className="size-4" />{demo ? "Use live data" : "Explore demo report"}</Button>
      </section>
      {demo && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Fictional demo · The Meridian Hotel. Preview only; your live data and delivery settings are unchanged.</p>}
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-semibold">{demo ? "Demo report" : "Report preview"}</h2><p className="mt-1 text-xs text-muted-foreground">{report?.period_label || "Last completed Monday–Sunday"} · Follow-up reflects the time the preview is generated.</p></div>
        {!demo && <label className="text-xs text-muted-foreground">Week beginning (Monday)<Input type="date" value={week} onChange={e => setWeek(e.target.value)} className="mt-1 w-44" /></label>}
      </div>
      {preview.error ? <div role="alert" className="rounded-xl border border-destructive/30 p-5 text-sm"><p>Could not load this report. Choose a Monday from a completed week, or try again.</p><Button className="mt-3" variant="outline" onClick={() => { void preview.mutate() }}>Retry</Button></div> : !report ? <p role="status" className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Preparing your brief…</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "New inquiries", value: String(report.leads), detail: report.trend }, { label: "Estimated opportunity", value: report.budget.display, detail: `${report.budget.known} of ${report.leads} have budget estimates` }, { label: "Average first response", value: report.average_response_hours === null ? "—" : `${report.average_response_hours}h`, detail: `${report.responded} of ${report.leads} have recorded responses` }, { label: "Overdue first responses", value: String(report.overdue), detail: "Includes older open inquiries" }].map(card => <div key={card.label} className="rounded-xl border bg-card p-5"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{card.value}</p><p className="mt-2 text-xs text-muted-foreground">{card.detail}</p></div>)}
      </div>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 overflow-hidden rounded-xl border bg-[#eeeae2]">
          <div className="flex items-center justify-between border-b bg-card px-5 py-3"><span className="flex items-center gap-2 text-sm font-medium"><Mail className="size-4" />Email preview</span><div className="flex gap-1"><Button variant={mobile ? "ghost" : "secondary"} size="sm" aria-label="Desktop email preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor className="size-4" /></Button><Button variant={mobile ? "secondary" : "ghost"} size="sm" aria-label="Mobile email preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone className="size-4" /></Button></div></div>
          {preview.data && !preview.error ? <iframe title="Weekly sales email preview" sandbox="" srcDoc={preview.data.html} className="mx-auto h-[1100px] w-full border-0" style={{ maxWidth: mobile ? 375 : undefined }} /> : <div className="p-12 text-center text-sm text-muted-foreground">Your email preview will appear here.</div>}
        </section>
        <aside className="space-y-5">
          {settings.error ? <div role="alert" className="rounded-xl border p-5 text-sm">Could not load delivery settings.<Button variant="outline" className="mt-3" onClick={() => { void settings.mutate() }}>Retry</Button></div> : settings.data ? <DeliverySettings key={JSON.stringify(settings.data.subscription)} hotelId={hotelId} settings={settings.data} onSave={() => { void settings.mutate(); void preview.mutate() }} /> : <p className="text-sm text-muted-foreground">Loading settings…</p>}
          <div className="rounded-xl border bg-card p-5"><h3 className="text-sm font-semibold">A report you can act on</h3><p className="mt-3 text-xs leading-6 text-muted-foreground">Budgets are AI-estimated ranges, not revenue. Response times use recorded calls and conversations. Missing budgets and unrecorded responses stay visible, so the report shows where to improve.</p><Link className="mt-4 inline-flex items-center gap-1 text-sm font-medium" href="/sales-inquiries">Work your inquiries<ArrowUpRight className="size-4" /></Link></div>
        </aside>
      </div>
    </div>
  </>
}

function DeliverySettings({ hotelId, settings, onSave }: { hotelId: string; settings: Settings; onSave: () => void }) {
  const [form, setForm] = useState(settings.subscription)
  const [recipients, setRecipients] = useState(form.recipients.join(", "))
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(settings.subscription) || recipients !== settings.subscription.recipients.join(", ")
  useEffect(() => {
    if (!dirty) return
    const unregister = registerUnsavedGuard(() => "You have unsaved weekly report settings. Discard changes?")
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", beforeUnload)
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload) }
  }, [dirty])
  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      await api(withQuery("/api/v1/sales-reports/settings", { hotel_id: hotelId }), { method: "PUT", body: { ...form, recipients: recipients.split(/[,;\n]/).map(r => r.trim()).filter(Boolean) } })
      toast.success("Weekly report settings saved"); onSave()
    } catch { toast.error("Could not save. Check your recipient addresses and try again.") }
    finally { setSaving(false) }
  }
  return <><form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5">
    <div><h3 className="font-semibold">Weekly delivery</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">The previous Monday–Sunday, delivered in {settings.timezone}.</p></div>
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="size-4 accent-[#6b7a4a]" />Email this report weekly</label>
    <label className="block text-xs font-medium">Recipients<textarea required={form.enabled} rows={3} value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="sales@hotel.com, gm@hotel.com" className="mt-2 w-full rounded-lg border bg-background p-3 text-sm" /><span className="font-normal text-muted-foreground">Up to 10 addresses, separated by commas.</span></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">Send on<select className={`${selectStyle} mt-2`} value={form.send_day} onChange={e => setForm({ ...form, send_day: Number(e.target.value) })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label><label className="text-xs font-medium">At<select className={`${selectStyle} mt-2`} value={form.send_hour} onChange={e => setForm({ ...form, send_hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label></div>
    <label className="block text-xs font-medium">First-response target<select className={`${selectStyle} mt-2`} value={form.stale_hours} onChange={e => setForm({ ...form, stale_hours: Number(e.target.value) })}>{[...new Set([4, 12, 24, 48, 72, form.stale_hours])].sort((a,b) => a-b).map(h => <option key={h} value={h}>{h} hours</option>)}</select></label>
    <Button type="submit" className="w-full" disabled={saving || !dirty}>{saving ? "Saving…" : "Save delivery settings"}</Button>
    <p className="text-[11px] leading-5 text-muted-foreground">Delivery runs through the scheduled reporting job. Enabling after this week's send time queues the latest completed week for its next run.</p>
  </form>
  <section className="rounded-xl border bg-card p-5"><h3 className="text-sm font-semibold">Recent deliveries</h3>{settings.deliveries.length ? <ul className="mt-3 divide-y">{settings.deliveries.map((d, i) => <li key={i} className="py-3 text-xs"><p className="break-all font-medium">{d.recipient}</p><p className="mt-1 text-muted-foreground">Week of {d.week_start} · {d.status.replaceAll("_", " ")}</p></li>)}</ul> : <p className="mt-3 text-xs leading-5 text-muted-foreground">No reports sent yet. Preview your report before enabling weekly delivery.</p>}</section></>
}
