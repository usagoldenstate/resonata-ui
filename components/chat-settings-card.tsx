"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { TagInput } from "@/components/tag-input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionSelect } from "@/components/ui/option-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  ApiError,
  deleteChatSocialConnection,
  fetchChatSetup,
  saveChatSocialConnection,
  updateHotelPlatformSettings,
  type ChatSetupStatus,
  type ChatSocialConnection,
  type ChatWidgetConfig,
  type HotelDetail,
} from "@/lib/api"

const DEFAULT_PRIMARY = "#F2604F"
const DEFAULT_ACCENT = "#F58A3F"
const DEFAULT_FONT = "Nunito, 'Nunito Sans', 'Segoe UI', system-ui, -apple-system, sans-serif"
const DEFAULT_AGENT = "Sarah"
const MAX_ORIGINS = 20
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const NUMERIC_RE = /^\d+$/

function errorText(cause: unknown): string {
  if (cause instanceof ApiError && cause.body && typeof cause.body === "object") {
    const detail = (cause.body as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail
        .map(item => (typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)))
        .join("; ")
    }
  }
  return cause instanceof Error ? cause.message : String(cause)
}

// Only the site's origin is allowed: scheme and host, no path or trailing slash.
function originProblem(value: string): string | null {
  try {
    const url = new URL(value)
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin === value) return null
  } catch {
    // falls through to the message
  }
  return `"${value}" isn't a site address. Use the form https://www.hotel.com, with no path.`
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

// Platform admins only (it lives on the Advanced tab). Saves on its own, like
// the lead delivery card, so chat settings never ride along with an unrelated
// settings save. The website form and the Facebook / Instagram connection are
// two cards with two Save buttons: the connection goes through its own
// endpoint and verifies the token with Meta.
type Props = {
  hotelId: string
  hotelName: string
  savedEnabled: boolean
  savedConfig: ChatWidgetConfig | null
  onSaved: (detail: HotelDetail) => void
}

export function ChatSettingsCard(props: Props) {
  return <ChatSettingsEditor key={props.hotelId} {...props} />
}

function ChatSettingsEditor(props: Props) {
  const { hotelId } = props
  const [setup, setSetup] = useState<ChatSetupStatus | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)

  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const load = useCallback(async () => {
    try {
      const next = await fetchChatSetup(hotelId)
      if (!active.current) return
      setSetup(next)
      setSetupError(null)
    } catch (cause) {
      if (active.current) setSetupError(errorText(cause))
    }
  }, [hotelId])

  useEffect(() => {
    void load()
  }, [load])

  return <>
    <WebsiteChatCard
      {...props}
      embedSnippet={props.savedConfig ? setup?.embed_snippet ?? null : null}
      onSaved={detail => {
        props.onSaved(detail)
        void load()
      }}
    />
    <SocialChatCard hotelId={hotelId} setup={setup} setupError={setupError} />
  </>
}

// ── Website chat ────────────────────────────────────────────────────────────

type Draft = {
  enabled: boolean
  origins: string[]
  agentName: string
  greeting: string
  intro: string
  primary: string
  accent: string
  position: ChatWidgetConfig["launcher_position"]
  logoUrl: string
  avatarUrl: string
}

function toDraft(enabled: boolean, config: ChatWidgetConfig | null): Draft {
  return {
    enabled,
    origins: config?.allowed_origins ?? [],
    agentName: config?.agent_name ?? DEFAULT_AGENT,
    greeting: config?.greeting ?? "",
    intro: config?.intro_message ?? "",
    primary: config?.primary_color ?? DEFAULT_PRIMARY,
    accent: config?.accent_color ?? DEFAULT_ACCENT,
    position: config?.launcher_position ?? "bottom-right",
    logoUrl: config?.logo_url ?? "",
    avatarUrl: config?.agent_avatar_url ?? "",
  }
}

// The backend rejects unknown keys, so this sends exactly the contract's keys.
// There is no field for the font, so the saved one is kept.
function toPayload(draft: Draft, fontFamily: string) {
  const config: ChatWidgetConfig = {
    allowed_origins: draft.origins,
    primary_color: draft.primary.trim().toUpperCase(),
    accent_color: draft.accent.trim().toUpperCase(),
    font_family: fontFamily,
    logo_url: draft.logoUrl.trim() || null,
    agent_name: draft.agentName.trim(),
    agent_avatar_url: draft.avatarUrl.trim() || null,
    intro_message: draft.intro.trim() || null,
    greeting: draft.greeting.trim() || null,
    launcher_position: draft.position,
  }
  return { chat_enabled: draft.enabled, chat_widget_config: config }
}

function sameDraft(a: Draft, b: Draft) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function WebsiteChatCard({
  hotelId,
  hotelName,
  savedEnabled,
  savedConfig,
  embedSnippet,
  onSaved,
}: Props & { embedSnippet: string | null }) {
  const savedDraft = toDraft(savedEnabled, savedConfig)
  const [baseline, setBaseline] = useState(savedDraft)
  const [draft, setDraft] = useState(savedDraft)
  const patch = (value: Partial<Draft>) => setDraft(d => ({ ...d, ...value }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const conflict = !sameDraft(baseline, savedDraft)
  // New object identity from an unrelated settings save is not a change.
  // Adopt a changed server value only while this form has no local edits.
  if (conflict && sameDraft(draft, baseline)) {
    setBaseline(savedDraft)
    setDraft(savedDraft)
    setError(null)
  }

  const loadSaved = () => {
    setBaseline(savedDraft)
    setDraft(savedDraft)
    setError(null)
  }

  const fontFamily = savedConfig?.font_family ?? DEFAULT_FONT
  const payload = toPayload(draft, fontFamily)
  const dirty = JSON.stringify(payload) !== JSON.stringify(toPayload(savedDraft, fontFamily))
  const colorsValid = HEX_RE.test(draft.primary.trim()) && HEX_RE.test(draft.accent.trim())
  const urlsValid = [draft.logoUrl, draft.avatarUrl].every(value => !value.trim() || isHttpsUrl(value.trim()))
  const noOrigin = draft.origins.length === 0
  const complete = !noOrigin && Boolean(draft.agentName.trim()) && colorsValid && urlsValid

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const detail = await updateHotelPlatformSettings(hotelId, payload)
      if (!active.current) return
      const next = toDraft(detail.chat_enabled ?? false, detail.chat_widget_config ?? null)
      setBaseline(next)
      setDraft(next)
      onSaved(detail)
      toast.success("Website chat saved")
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  const agentName = draft.agentName.trim() || DEFAULT_AGENT

  return <Card className="border-border">
    <CardHeader className="pb-4">
      <CardTitle className="text-base">Website chat</CardTitle>
      <CardDescription className="text-xs">
        A chat widget for the hotel&apos;s website. Guests write to an agent that answers from the knowledge base.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <fieldset disabled={saving} className="space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="chatEnabled" className="text-sm">Guest chat enabled</Label>
            <p className="text-[11px] text-muted-foreground">
              Save to apply this switch. When off, the widget does not load on the hotel&apos;s site and the agent stops answering on Facebook and Instagram.
            </p>
          </div>
          <Switch id="chatEnabled" checked={draft.enabled} onCheckedChange={enabled => patch({ enabled })} />
        </div>
        <TagInput
          id="chatAllowedOrigins"
          label="Allowed website addresses"
          hint="Type an address and press Enter. The widget only loads on these sites."
          values={draft.origins}
          onChange={origins => patch({ origins })}
          placeholder="https://www.hotel.com"
          max={MAX_ORIGINS}
          noun="addresses"
          separators={/[\s,;]+/}
          validate={originProblem}
        />
        <div className="space-y-2">
          <Label htmlFor="chatAgentName" className="text-xs text-muted-foreground">Agent name</Label>
          <Input id="chatAgentName" value={draft.agentName} maxLength={60} onChange={e => patch({ agentName: e.target.value })} className="bg-card border-border" />
          <p className="text-[11px] text-muted-foreground">Used on the website, Messenger, Instagram and comment replies.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="chatGreeting" className="text-xs text-muted-foreground">Greeting</Label>
          <Textarea id="chatGreeting" value={draft.greeting} maxLength={1000} onChange={e => patch({ greeting: e.target.value })} placeholder={`Hi! I'm ${agentName}. How can I help with your stay?`} className="bg-card border-border" />
          <p className="text-[11px] text-muted-foreground">Optional. The agent&apos;s first line.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="chatIntro" className="text-xs text-muted-foreground">Intro message</Label>
          <Textarea id="chatIntro" value={draft.intro} maxLength={500} onChange={e => patch({ intro: e.target.value })} placeholder={`Hi there! 👋 Welcome to ${hotelName}. Ask us anything about your stay and we'll connect you with one of our virtual reservation agents.`} className="bg-card border-border" />
          <p className="text-[11px] text-muted-foreground">Optional. Shown when the widget opens, before the agent joins.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ColorField id="chatPrimaryColor" label="Primary color" value={draft.primary} onChange={primary => patch({ primary })} />
          <ColorField id="chatAccentColor" label="Accent color" value={draft.accent} onChange={accent => patch({ accent })} />
          <div className="space-y-2">
            <Label htmlFor="chatLauncherPosition" className="text-xs text-muted-foreground">Launcher position</Label>
            <OptionSelect
              id="chatLauncherPosition"
              value={draft.position}
              onValueChange={value => patch({ position: value as Draft["position"] })}
              className="w-full bg-card border-border"
              options={[
                { value: "bottom-right", label: "Bottom right" },
                { value: "bottom-left", label: "Bottom left" },
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UrlField id="chatLogoUrl" label="Logo URL" hint="Optional. An https:// image address." value={draft.logoUrl} onChange={logoUrl => patch({ logoUrl })} />
          <UrlField id="chatAvatarUrl" label="Agent photo URL" hint="Optional. Leave empty to use the standard portrait." value={draft.avatarUrl} onChange={avatarUrl => patch({ avatarUrl })} />
        </div>
        {conflict && <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>The saved chat settings changed while you were editing. Your edits are still here. Choose which version to use before saving.</p>
          <Button type="button" variant="outline" size="sm" onClick={loadSaved}>Load saved settings</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setBaseline(savedDraft)}>Keep my edits</Button>
        </div>}
        {noOrigin && (draft.enabled || dirty) && <p className="text-[11px] text-muted-foreground">
          Add at least one website address. The widget cannot be embedded on any site without one.
        </p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={saving || conflict || !dirty || !complete} onClick={() => void save()}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}Save website chat
          </Button>
        </div>
      </fieldset>
      {embedSnippet && <div className="mt-6 space-y-2 border-t border-border pt-4">
        <Label className="text-xs text-muted-foreground">Embed snippet</Label>
        <CopyBlock value={embedSnippet} what="Embed snippet" />
        <p className="text-[11px] text-muted-foreground">Paste this before &lt;/body&gt; on every page of the hotel&apos;s site.</p>
      </div>}
    </CardContent>
  </Card>
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const valid = HEX_RE.test(value.trim())
  return <div className="space-y-2">
    <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} swatch`}
        value={valid ? value.trim().toLowerCase() : "#000000"}
        onChange={e => onChange(e.target.value)}
        className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
      />
      <Input id={id} value={value} maxLength={7} aria-invalid={!valid} onChange={e => onChange(e.target.value)} placeholder="#RRGGBB" className="bg-card border-border font-mono" />
    </div>
    {!valid && <p className="text-[11px] text-destructive">Use a color like #F2604F.</p>}
  </div>
}

function UrlField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (value: string) => void }) {
  const invalid = Boolean(value.trim()) && !isHttpsUrl(value.trim())
  return <div className="space-y-2">
    <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
    <Input id={id} type="url" value={value} aria-invalid={invalid} onChange={e => onChange(e.target.value)} placeholder="https://" className="bg-card border-border" />
    <p className={`text-[11px] ${invalid ? "text-destructive" : "text-muted-foreground"}`}>{invalid ? "Use an address that starts with https://." : hint}</p>
  </div>
}

// A read-only value in a monospace block with a Copy button.
function CopyBlock({ value, what }: { value: string; what: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${what} copied`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(`Couldn't copy ${what.toLowerCase()}`)
    }
  }

  return <div className="flex items-start gap-2">
    <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">{value}</code>
    <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => void handleCopy()}>
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}Copy
    </Button>
  </div>
}

// ── Facebook and Instagram ──────────────────────────────────────────────────

type SocialDraft = {
  pageId: string
  instagramId: string
  token: string
  messenger: boolean
  instagramDm: boolean
  facebookComments: boolean
  instagramComments: boolean
}

function toSocialDraft(saved: ChatSocialConnection | null): SocialDraft {
  return {
    pageId: saved?.facebook_page_id ?? "",
    instagramId: saved?.instagram_account_id ?? "",
    token: "",
    messenger: saved?.messenger_enabled ?? false,
    instagramDm: saved?.instagram_dm_enabled ?? false,
    facebookComments: saved?.facebook_comments_enabled ?? false,
    instagramComments: saved?.instagram_comments_enabled ?? false,
  }
}

function SocialChatCard({ hotelId, setup, setupError }: { hotelId: string; setup: ChatSetupStatus | null; setupError: string | null }) {
  return <Card className="border-border">
    <CardHeader className="pb-4">
      <CardTitle className="text-base">Facebook and Instagram</CardTitle>
      <CardDescription className="text-xs">
        Let the agent answer direct messages and public comments on the hotel&apos;s Facebook Page and Instagram account.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {setup ? (
        <SocialChatEditor hotelId={hotelId} setup={setup} />
      ) : setupError ? (
        <p role="alert" className="text-xs text-destructive">{setupError}</p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      )}
    </CardContent>
  </Card>
}

function SocialChatEditor({ hotelId, setup }: { hotelId: string; setup: ChatSetupStatus }) {
  const [saved, setSaved] = useState(setup.social_connection)
  const [draft, setDraft] = useState(() => toSocialDraft(setup.social_connection))
  const patch = (value: Partial<SocialDraft>) => setDraft(d => ({ ...d, ...value }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const configured = setup.meta_configured
  const pageId = draft.pageId.trim()
  const instagramId = draft.instagramId.trim()
  const savedDraft = toSocialDraft(saved)
  const dirty = Boolean(draft.token.trim())
    || pageId !== savedDraft.pageId
    || instagramId !== savedDraft.instagramId
    || draft.messenger !== savedDraft.messenger
    || draft.instagramDm !== savedDraft.instagramDm
    || draft.facebookComments !== savedDraft.facebookComments
    || draft.instagramComments !== savedDraft.instagramComments
  const idsValid = NUMERIC_RE.test(pageId) && (!instagramId || NUMERIC_RE.test(instagramId))
  const needsInstagramId = (draft.instagramDm || draft.instagramComments) && !instagramId
  const needsToken = !saved?.has_page_access_token && !draft.token.trim()
  const complete = idsValid && !needsInstagramId && !needsToken

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const next = await saveChatSocialConnection(hotelId, {
        facebook_page_id: pageId,
        instagram_account_id: instagramId || null,
        page_access_token: draft.token.trim() || null,
        messenger_enabled: draft.messenger,
        instagram_dm_enabled: draft.instagramDm,
        facebook_comments_enabled: draft.facebookComments,
        instagram_comments_enabled: draft.instagramComments,
      })
      if (!active.current) return
      setSaved(next)
      setDraft(toSocialDraft(next))
      toast.success("Facebook and Instagram saved")
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    setSaving(true)
    setError(null)
    try {
      await deleteChatSocialConnection(hotelId)
      if (!active.current) return
      setSaved(null)
      setDraft(toSocialDraft(null))
      toast.success("Facebook and Instagram disconnected")
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
      setConfirmDisconnect(false)
    }
  }

  return <>
    {!configured && <p className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      This server is not set up for Meta yet, so Facebook and Instagram cannot be connected.
    </p>}
    {saved && <p className="mb-4 text-sm">
      Connected{saved.facebook_page_name ? <> to <span className="font-medium">{saved.facebook_page_name}</span></> : null}
    </p>}
    <fieldset disabled={saving || !configured} className="space-y-4 min-w-0">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="chatFacebookPageId" className="text-xs text-muted-foreground">Facebook Page ID</Label>
          <Input id="chatFacebookPageId" inputMode="numeric" value={draft.pageId} onChange={e => patch({ pageId: e.target.value })} className="bg-card border-border font-mono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="chatInstagramId" className="text-xs text-muted-foreground">Instagram account ID</Label>
          <Input id="chatInstagramId" inputMode="numeric" value={draft.instagramId} onChange={e => patch({ instagramId: e.target.value })} className="bg-card border-border font-mono" />
          <p className="text-[11px] text-muted-foreground">Optional. Needed to turn on either Instagram switch.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="chatPageToken" className="text-xs text-muted-foreground">Page access token</Label>
        <Input
          id="chatPageToken"
          type="password"
          autoComplete="off"
          value={draft.token}
          onChange={e => patch({ token: e.target.value })}
          placeholder={saved?.has_page_access_token ? "Saved. Enter a new token to replace it." : undefined}
          className="bg-card border-border font-mono"
        />
      </div>
      <SwitchRow id="chatMessenger" label="Answer Messenger messages" checked={draft.messenger} onChange={messenger => patch({ messenger })} />
      <SwitchRow id="chatInstagramDm" label="Answer Instagram messages" checked={draft.instagramDm} onChange={instagramDm => patch({ instagramDm })} />
      <SwitchRow id="chatFacebookComments" label="Reply to Facebook comments" checked={draft.facebookComments} onChange={facebookComments => patch({ facebookComments })} />
      <SwitchRow id="chatInstagramComments" label="Reply to Instagram comments" checked={draft.instagramComments} onChange={instagramComments => patch({ instagramComments })} />
      <p className="text-[11px] text-muted-foreground">
        Replies are public. The agent answers questions it can answer from the knowledge base and stays quiet otherwise.
      </p>
      {needsInstagramId && <p className="text-[11px] text-muted-foreground">Add the Instagram account ID to answer Instagram messages or comments.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={saving || !dirty || !complete} onClick={() => void save()}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}Save Facebook and Instagram
        </Button>
      </div>
    </fieldset>
    {saved && <Button type="button" variant="ghost" size="sm" className="mt-2 text-destructive hover:text-destructive" disabled={saving} onClick={() => setConfirmDisconnect(true)}>
      Disconnect
    </Button>}
    <div className="mt-6 space-y-2 border-t border-border pt-4">
      <Label className="text-xs text-muted-foreground">Webhook URL</Label>
      <CopyBlock value={setup.meta_webhook_url} what="Webhook URL" />
      <p className="text-[11px] text-muted-foreground">Meta sends new messages and comments to this address.</p>
    </div>

    <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Facebook and Instagram?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent stops answering messages and comments on this Page and Instagram account. To connect again, enter the Page access token again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep connected</AlertDialogCancel>
          <AlertDialogAction onClick={() => void disconnect()} className="bg-destructive text-white">
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}

function SwitchRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
    <Label htmlFor={id} className="text-sm">{label}</Label>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
}
