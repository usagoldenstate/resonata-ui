"use client"

import { useState } from "react"
import useSWR from "swr"
import { Mail, RefreshCw } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard"

type Connection = { connected: boolean; email: string | null; expected_email: string | null; can_manage: boolean; connected_at: string | null }
type Conversation = {
  marked_read: boolean; hotel_replied: boolean; guest_replied: boolean; synced_at: string; gmail_url: string
  messages: { id: string; kind: string; sender: string; to: string; subject: string; at: string; text: string }[]
}
const prefix = "/api/v1/integrations/gmail"
function path(hotelId: string, suffix: string) { return `${prefix}${suffix}?${new URLSearchParams({ hotel_id: hotelId })}` }
function message(error: unknown) {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
  }
  return "Email could not be loaded. Please try again."
}
function useConnection(hotelId: string) {
  return useSWR(["gmail-connection", hotelId], () => api<Connection>(path(hotelId, "/status")), { shouldRetryOnError: false })
}

export function GmailConnectionPanel({ hotelId }: { hotelId: string }) {
  const connection = useConnection(hotelId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (connection.error instanceof ApiError && connection.error.status === 404) return null
  async function connect() {
    if (!confirmDiscardUnsaved()) return
    setBusy(true); setError("")
    try {
      const result = await api<{ url: string }>(path(hotelId, "/authorize"), { method: "POST" })
      window.location.assign(result.url)
    } catch (e) { setError(message(e)); setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setError("")
    try {
      await api(path(hotelId, "/connection"), { method: "DELETE" })
      await connection.mutate()
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  const data = connection.data
  return <section className="rounded-xl border bg-card p-5 shadow-sm" aria-label="Gmail connection">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Mail className="size-4" />Sales mailbox</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data?.connected ? `Connected to ${data.email}` : data ? `Connect ${data.expected_email || "a sales mailbox configured in Settings"} to view inquiry emails and replies.` : "Loading connection…"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Read-only Gmail pilot · Open an inquiry and choose Sync email to check its conversation.</p>
      </div>
      {data?.can_manage && <div className="flex gap-2">{data.connected ? <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>Disconnect Gmail</Button> : <Button variant="outline" disabled={busy || !data.expected_email} onClick={() => void connect()}>{busy ? "Connecting…" : "Connect Gmail"}</Button>}</div>}
    </div>
    {data && !data.can_manage && !data.connected && <p className="mt-2 text-xs text-muted-foreground">A platform administrator can connect this mailbox.</p>}
    {(error || connection.error) && <p role="alert" className="mt-3 text-sm text-destructive">{error || message(connection.error)}</p>}
  </section>
}

export function GmailConversationPanel({ hotelId, inquiryId }: { hotelId: string; inquiryId: string }) {
  const connection = useConnection(hotelId)
  if (!connection.data?.connected) return null
  return <ConversationView key={`${hotelId}:${inquiryId}:${connection.data.connected_at}`} hotelId={hotelId} inquiryId={inquiryId} />
}
function ConversationView({ hotelId, inquiryId }: { hotelId: string; inquiryId: string }) {
  const [data, setData] = useState<Conversation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function sync() {
    setBusy(true); setError("")
    try { setData(await api<Conversation>(path(hotelId, `/inquiries/${inquiryId}/conversation`))) }
    catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  const kinds: Record<string, string> = { inquiry: "Original inquiry", hotel_reply: "Hotel replied", guest_reply: "Guest replied", related_message: "Related message" }
  return <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Email conversation">
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><h3 className="text-sm font-semibold">Email conversation</h3><Button variant="outline" size="sm" disabled={busy} onClick={() => void sync()}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Syncing…" : "Sync email"}</Button></div>
    <div className="space-y-4 p-5">
      {!data && <p className="text-sm text-muted-foreground">Sync to check the inquiry’s read status and replies in Gmail.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && <>
        <div className="flex flex-wrap gap-2 text-xs">{[data.marked_read ? "Marked read in Gmail" : "Unread in Gmail", data.hotel_replied ? "Hotel reply found" : "No hotel reply found", data.guest_replied ? "Guest reply found" : "No guest reply found"].map(label => <span key={label} className="rounded-full bg-muted px-3 py-1.5">{label}</span>)}</div>
        <p className="text-xs text-muted-foreground">Last checked {new Date(data.synced_at).toLocaleString()}. Marked read does not confirm that someone reviewed it. Replies from other mailboxes or new conversations may not appear.</p>
        <a className="text-sm underline" href={data.gmail_url} target="_blank" rel="noopener noreferrer">Open conversation in Gmail</a>
        <ol className="space-y-3">{data.messages.map(item => <li key={item.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold">{kinds[item.kind] || "Message"}</span><time dateTime={item.at} className="text-muted-foreground">{new Date(item.at).toLocaleString()}</time></div>
          <p className="mt-2 break-all text-xs text-muted-foreground">From: {item.sender}<br />To: {item.to}</p>
          <p className="mt-2 break-words text-sm font-medium">{item.subject}</p>
          <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{item.text}</p>
        </li>)}</ol>
      </>}
    </div>
  </section>
}
