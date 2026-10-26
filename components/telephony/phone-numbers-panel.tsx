"use client"

import * as React from "react"
import { AlertCircle, CheckCircle2, Loader2, Phone, RefreshCw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  applyTelephony, cancelTelephonyOperation, fetchTelephony, fetchTelephonyOperation, previewTelephony, recordTelephonyTest,
  type TelephonyConfig, type TelephonyLine, type TelephonyMode, type TelephonyNumber,
  type TelephonyOperation, type TelephonyOverview,
} from "@/lib/telephony-api"

const statusNames: Record<TelephonyNumber["status"], string> = {
  not_connected: "Not connected", needs_attention: "Needs attention", status_unavailable: "Status unavailable",
  backup_only: "Backup only", ai_connected: "AI connected",
}
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const errorText = (error: unknown) => error instanceof ApiError || error instanceof Error ? error.message : "The request could not be completed."
const when = (value: string | null) => value ? new Date(value).toLocaleString() : "Not tested"

type Props = { initialHotelId?: string; onChanged?: () => void | Promise<void> }

export function PhoneNumbersPanel({ initialHotelId, onChanged }: Props) {
  const [data, setData] = React.useState<TelephonyOverview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState("all")
  const [selected, setSelected] = React.useState<TelephonyNumber | null>(null)
  const [hotelId, setHotelId] = React.useState(initialHotelId ?? "")
  const [line, setLine] = React.useState<TelephonyLine>("reservations")
  const [backup, setBackup] = React.useState("")
  const [backupLabel, setBackupLabel] = React.useState("Direct backup")
  const [mode, setMode] = React.useState<TelephonyMode>("ai")
  const [takeover, setTakeover] = React.useState(false)
  const [plan, setPlan] = React.useState<TelephonyOperation | null>(null)
  const [confirmation, setConfirmation] = React.useState("")
  const [idempotencyKey, setIdempotencyKey] = React.useState("")
  const [operation, setOperation] = React.useState<TelephonyOperation | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [test, setTest] = React.useState<{ config: TelephonyConfig; kind: "ai" | "backup" } | null>(null)
  const [testConfirmed, setTestConfirmed] = React.useState(false)
  const active = operation?.status === "queued" || operation?.status === "running"
  const onChangedRef = React.useRef(onChanged)
  React.useEffect(() => { onChangedRef.current = onChanged }, [onChanged])

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const next = await fetchTelephony(signal)
      setData(next)
      setOperation((current) => current ?? next.operations.find((op) => op.status === "queued" || op.status === "running") ?? null)
      setError(null)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(errorText(e))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const activeId = active ? operation?.id : null
  React.useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await fetchTelephonyOperation(activeId, controller.signal)
        setOperation(next)
        if (next.status === "succeeded" || next.status === "failed" || next.status === "cancelled") {
          await load(controller.signal)
          if (next.status === "succeeded") await onChangedRef.current?.()
          return
        }
      } catch (e) {
        if (controller.signal.aborted) return
        setError(`Could not refresh operation status. ${errorText(e)}`)
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2500)
    }
    timer = setTimeout(poll, 1500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [activeId, load])

  const select = (number: TelephonyNumber, desiredMode?: TelephonyMode) => {
    setSelected(number)
    setHotelId(initialHotelId ?? number.hotel_id ?? "")
    const chosenHotel = data?.hotels.find((h) => h.hotel_id === (initialHotelId ?? number.hotel_id))
    setLine(number.line ?? (chosenHotel?.lines === "sales" ? "sales" : "reservations"))
    setBackup(number.config?.backup_number ?? "")
    setBackupLabel(number.config?.backup_label ?? "Direct backup")
    setMode(desiredMode ?? number.config?.mode ?? "ai")
    setTakeover(false); setPlan(null); setConfirmation(""); setError(null)
  }
  const review = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected?.number_sid) return
    setBusy(true); setError(null)
    try {
      const next = await previewTelephony({ hotel_id: hotelId, line, number_sid: selected.number_sid,
        backup_number: backup, backup_label: backupLabel, mode, acknowledge_takeover: takeover })
      setPlan(next); setConfirmation(""); setIdempotencyKey(window.crypto.randomUUID())
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const apply = async () => {
    if (!plan || active || confirmation !== plan.number) return
    setBusy(true); setError(null)
    try {
      setOperation(await applyTelephony(plan, idempotencyKey, confirmation))
      setPlan(null); setSelected(null)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!operation || operation.status !== "queued") return
    setBusy(true)
    try { setOperation(await cancelTelephonyOperation(operation.id)); await load() }
    catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const saveTest = async () => {
    if (!test || !testConfirmed) return
    setBusy(true); setError(null)
    try {
      await recordTelephonyTest(test.config, test.kind)
      setTest(null); setTestConfirmed(false); await load()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const rows = (data?.numbers ?? []).filter((row) => {
    if (initialHotelId && row.hotel_id && row.hotel_id !== initialHotelId) return false
    const needle = query.trim().toLowerCase()
    if (needle && !`${row.number} ${row.hotel_name ?? ""} ${row.label}`.toLowerCase().includes(needle)) return false
    return filter === "all" || (filter === "attention" && ["needs_attention", "status_unavailable"].includes(row.status))
      || (filter === "unassigned" && !row.hotel_id) || (filter === "backup" && row.status === "backup_only")
  })
  const hotel = data?.hotels.find((h) => h.hotel_id === hotelId)
  const hasExistingRoute = selected?.current_route && ["trunk_sid", "voice_application_sid", "voice_url"].some((key) => selected.current_route?.[key])
  const requiresTakeover = hasExistingRoute || (selected?.hotel_id && (selected.hotel_id !== hotelId || selected.line !== line))

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Phone className="h-5 w-5" />Phone numbers</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect an owned number to a hotel and choose where calls go if the AI is unavailable.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || busy}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Check configuration
        </Button>
      </div>

      {error ? <div role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{error}</div> : null}
      {data && !data.connections.writes_enabled ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />Routing changes are disabled</p>
          <p className="mt-1 text-muted-foreground">You can inspect owned numbers and review configuration. Platform connection setup and staging recovery verification are required before activation.</p>
        </div>
      ) : null}
      {data?.errors.map((message) => <p key={message} className="flex items-start gap-2 text-sm text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>)}

      {operation ? (
        <div className="rounded-lg border border-border p-4" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-medium">
            {active ? <Loader2 className="h-4 w-4 animate-spin" /> : operation.status === "succeeded" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {operation.number}: {operation.status === "queued" ? "Waiting to start" : operation.progress.phase ?? operation.status}
          </div>
          {operation.status === "queued" ? <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>Cancel before it starts</Button> : null}
          {operation.error ? <p className="mt-2 text-sm text-destructive">{operation.error}</p> : null}
          {operation.progress.compensation ? <p className="mt-2 text-sm text-muted-foreground">{operation.progress.compensation}</p> : null}
          {operation.status === "succeeded" ? <p className="mt-2 text-sm text-muted-foreground">Configuration is verified. Make an AI call and a backup call before marking either test complete.</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search phone numbers or hotels" className="max-w-sm" placeholder="Search number or hotel" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-1" aria-label="Filter numbers">
          {[["all", "All"], ["attention", "Needs attention"], ["unassigned", "Unassigned"], ["backup", "Backup only"]].map(([id, label]) => (
            <Button key={id} size="sm" variant={filter === id ? "secondary" : "ghost"} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Hotel / line</TableHead><TableHead>Routing</TableHead><TableHead>Backup</TableHead><TableHead>Call tests</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => <TableRow key={`${row.number}:${row.hotel_id}`}>
              <TableCell className="whitespace-nowrap font-medium">{row.number}<div className="text-xs font-normal text-muted-foreground">{row.voice_capable ? "Voice" : row.number_sid ? "No voice capability" : "Not in inventory"}</div></TableCell>
              <TableCell>{row.hotel_name ?? "Unassigned"}<div className="capitalize text-xs text-muted-foreground">{row.line ?? "Choose a hotel and line"}</div></TableCell>
              <TableCell><Badge variant="outline">{statusNames[row.status]}</Badge>{row.problems.map((problem) => <div key={problem} className="mt-1 max-w-xs text-xs text-muted-foreground">{problem}</div>)}</TableCell>
              <TableCell>{row.config ? <><div>{row.config.backup_label}</div><div className="text-xs text-muted-foreground">{row.config.backup_number}</div></> : <span className="text-muted-foreground">Not configured</span>}</TableCell>
              <TableCell className="text-xs"><div>AI: {when(row.config?.ai_tested_at ?? null)}</div><div>Backup: {when(row.config?.backup_tested_at ?? null)}</div></TableCell>
              <TableCell><Button size="sm" variant="outline" disabled={!row.voice_capable || active || busy} onClick={() => select(row)}>{row.config ? "Manage" : "Connect"}</Button></TableCell>
            </TableRow>)}
            {!rows.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{loading ? "Loading phone numbers…" : "No numbers match this view."}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      {data ? <p className="text-xs text-muted-foreground">Inventory checked {when(data.observed_at)}. Provider configuration does not prove working audio or automatic recovery from a stopped agent.</p> : null}

      {selected && !plan ? (
        <section className="rounded-lg border border-border p-5" aria-label="Configure phone number">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{selected.config ? "Manage" : "Connect"} {selected.number}</h3><Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(null)}>Close</Button></div>
          <form onSubmit={review} className="space-y-5">
            <fieldset disabled={busy || active} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="telephony-hotel">Hotel</Label><select id="telephony-hotel" className={selectClass} required value={hotelId} disabled={!!initialHotelId} onChange={(e) => setHotelId(e.target.value)}>
                <option value="">Choose a hotel</option>{data?.hotels.map((h) => <option key={h.hotel_id} value={h.hotel_id}>{h.display_name}{h.is_active ? "" : " (setup)"}</option>)}
              </select></div>
              <div className="space-y-2"><Label htmlFor="telephony-line">Line</Label><select id="telephony-line" className={selectClass} value={line} onChange={(e) => setLine(e.target.value as TelephonyLine)}>
                <option value="reservations" disabled={hotel?.lines === "sales"}>Reservations</option><option value="sales" disabled={hotel?.lines === "reservations"}>Sales</option>
              </select></div>
              <div className="space-y-2"><Label htmlFor="telephony-backup">Direct backup number</Label><Input id="telephony-backup" type="tel" required value={backup} placeholder="+1 407 555 0123" onChange={(e) => setBackup(e.target.value)} /><p className="text-xs text-muted-foreground">Use a direct line that does not forward back to an AI number.</p></div>
              <div className="space-y-2"><Label htmlFor="telephony-backup-label">Backup destination name</Label><Input id="telephony-backup-label" required maxLength={80} value={backupLabel} placeholder="Front desk direct" onChange={(e) => setBackupLabel(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="telephony-mode">Send new calls to</Label><select id="telephony-mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as TelephonyMode)}><option value="ai">AI assistant, with SIP delivery backup</option><option value="backup">Backup number only</option></select></div>
            </fieldset>
            {selected.config ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setMode(selected.config?.mode === "backup" ? "ai" : "backup")}>{selected.config.mode === "backup" ? "Restore AI" : "Send new calls to backup"}</Button></div> : null}
            {requiresTakeover ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={takeover} onChange={(e) => setTakeover(e.target.checked)} />I approve replacing this number’s current route and assignment, as shown in the next review.</label> : null}
            <p className="text-sm text-muted-foreground">Reviewing saves a plan. It does not switch the number. Hotel phone-system forwarding remains a separate step.</p>
            <Button type="submit" disabled={busy || active || !hotelId || !backup.trim() || (!!requiresTakeover && !takeover)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Review changes</Button>
          </form>
          {selected.config ? <details className="mt-6 border-t border-border pt-4"><summary className="text-sm font-medium">Verify calls</summary><p className="my-3 text-sm text-muted-foreground">Call {selected.number} and confirm the correct hotel’s greeting and response. To test backup, review and apply “Backup number only,” call again, and confirm {selected.config.backup_label} answers. Restore AI afterwards. Starting a call does not mark a test complete.</p><div className="flex flex-wrap gap-2">{(["ai", "backup"] as const).map((kind) => <Button key={kind} size="sm" variant="outline" onClick={() => { setTest({ config: selected.config!, kind }); setTestConfirmed(false) }}>Record {kind === "ai" ? "AI" : "backup"} test result</Button>)}</div></details> : null}
        </section>
      ) : null}

      {plan ? <section className="space-y-4 rounded-lg border border-border p-5" aria-label="Review routing changes">
        <h3 className="font-semibold">Review changes for {plan.number}</h3>
        <p className="text-sm">New calls will reach <strong>{plan.hotel_name}</strong> · {plan.request.line === "sales" ? "Sales" : "Reservations"}.</p>
        <p className="text-sm">{plan.request.mode === "backup" ? "All new calls will go directly to" : "If delivery to LiveKit fails, Twilio will call"} <strong>{plan.request.backup_label}</strong> at <strong>{plan.request.backup_number}</strong>.</p>
        {plan.source_hotel_name ? <p className="text-sm text-muted-foreground">Current assignment: {plan.source_hotel_name}. Moving a sales number also disables its former sales line.</p> : null}
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {plan.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
        {plan.write_blockers.length ? <div role="status" className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">Activation is unavailable until platform setup is complete.</p><ul className="mt-2 list-inside list-disc">{plan.write_blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
        <div className="max-w-sm space-y-2"><Label htmlFor="telephony-confirm">Type {plan.number} to confirm this specific number</Label><Input id="telephony-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /></div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void apply()} disabled={busy || active || !!plan.write_blockers.length || confirmation !== plan.number}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Apply reviewed changes</Button><Button variant="outline" disabled={busy} onClick={() => setPlan(null)}>Back to editing</Button></div>
        <details className="text-sm"><summary>Current provider route</summary><dl className="mt-2 space-y-1 break-all text-xs text-muted-foreground">{Object.entries(plan.current_route).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt><dd>{value}</dd></div>)}</dl></details>
      </section> : null}

      {test ? <section className="space-y-3 rounded-lg border border-border p-4" aria-label="Confirm completed call test"><h3 className="font-medium">Record {test.kind === "ai" ? "AI" : "backup"} test for {test.config.number}</h3><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={testConfirmed} onChange={(e) => setTestConfirmed(e.target.checked)} />I completed a real call and heard the expected hotel {test.kind === "ai" ? "assistant respond" : "backup destination answer"}.</label><div className="flex gap-2"><Button size="sm" disabled={!testConfirmed || busy} onClick={() => void saveTest()}>Record completed test</Button><Button variant="ghost" size="sm" onClick={() => setTest(null)}>Cancel</Button></div></section> : null}

      {data?.operations.length ? <details className="rounded-lg border border-border p-4"><summary className="text-sm font-medium">Recent routing changes</summary><div className="mt-3 space-y-2">{data.operations.map((op) => <div key={op.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 text-sm"><span>{op.number} · {op.hotel_name} · {op.status}</span><Button variant="ghost" size="sm" onClick={() => setOperation(op)}>View progress</Button></div>)}</div></details> : null}
      {data ? <details className="rounded-lg border border-border p-4 text-sm"><summary className="font-medium">Platform connection details</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2"><div><dt className="text-muted-foreground">Environment</dt><dd>{data.connections.environment}</dd></div><div><dt className="text-muted-foreground">Twilio</dt><dd>{data.connections.twilio_configured ? "Credentials configured" : "Not connected"}</dd></div><div><dt className="text-muted-foreground">LiveKit project</dt><dd>{data.connections.livekit_host ?? "Not configured"}</dd></div><div><dt className="text-muted-foreground">Independent recovery</dt><dd>{data.connections.recovery_domain ?? "Not configured"}</dd></div></dl><p className="mt-3 text-muted-foreground">{data.connections.worker_readiness}</p>{data.connections.write_blockers.length ? <ul className="mt-3 list-inside list-disc text-muted-foreground">{data.connections.write_blockers.map((b) => <li key={b}>{b}</li>)}</ul> : null}</details> : null}
    </div>
  )
}
