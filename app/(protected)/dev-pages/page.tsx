"use client"

import * as React from "react"
import {
  AlertTriangle,
  FileText,
  History,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"

import { BookingEnginePanel } from "@/components/booking-engine-panel"
import { Sidebar } from "@/components/sidebar"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ApiError,
  clearPersona,
  fetchPersona,
  fetchPersonaHistory,
  type PersonaHistoryEntry,
  type PersonaState,
  updatePersona,
} from "@/lib/api"
import { useCurrentUser } from "@/lib/current-user-context"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"

type LoadState = {
  persona: PersonaState | null
  history: PersonaHistoryEntry[]
  loading: boolean
  error: string | null
}

const emptyLoadState: LoadState = {
  persona: null,
  history: [],
  loading: true,
  error: null,
}

type DevTab = "persona" | "booking-engine"

export default function DevPages() {
  const { loading: userLoading, isPlatformAdmin } = useCurrentUser()
  const [activeTab, setActiveTab] = React.useState<DevTab>("persona")

  const tabs: Array<{ id: DevTab; label: string; icon: React.ReactNode }> = [
    { id: "persona", label: "Persona Override", icon: <FileText className="w-4 h-4" /> },
    { id: "booking-engine", label: "Booking Engine", icon: <Link2 className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Dev Pages</h1>
        </div>

        {userLoading ? (
          <StateNotice tone="muted" message="Loading..." />
        ) : isPlatformAdmin ? (
          <>
            <div className="mb-6 flex border-b border-border">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
                    activeTab === t.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
            {/* Both tabs stay mounted so unsaved edits survive switching. */}
            <div className={activeTab === "persona" ? "" : "hidden"}>
              <PersonaOverridePanel />
            </div>
            <div className={activeTab === "booking-engine" ? "" : "hidden"}>
              <BookingEnginePanel />
            </div>
          </>
        ) : (
          <StateNotice tone="error" message="This page is only available to platform admins." />
        )}
      </main>
    </div>
  )
}

function PersonaOverridePanel() {
  const [state, setState] = React.useState<LoadState>(emptyLoadState)
  const [draft, setDraft] = React.useState("")
  const [savedDraft, setSavedDraft] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [reverting, setReverting] = React.useState(false)
  const [restoringAt, setRestoringAt] = React.useState<string | null>(null)

  const dirty = state.persona !== null && draft !== savedDraft

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [persona, history] = await Promise.all([
        fetchPersona({ signal }),
        fetchPersonaHistory({ signal }),
      ])
      setState({ persona, history, loading: false, error: null })
      setDraft(persona.content)
      setSavedDraft(persona.content)
    } catch (e) {
      if (isAbortError(e)) return
      setState((prev) => ({
        ...prev,
        loading: false,
        error: describeError(e),
      }))
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const dirtyRef = React.useRef(dirty)
  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  React.useEffect(() => {
    return registerUnsavedGuard(() =>
      dirtyRef.current ? "You have unsaved persona override changes. Leave anyway?" : null,
    )
  }, [])

  React.useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const reload = async () => {
    if (dirty && !window.confirm("Discard unsaved persona override changes?")) return
    await load()
  }

  const save = async () => {
    if (!draft.trim()) {
      toast.error("Persona content is required.")
      return
    }

    setSaving(true)
    try {
      const persona = await updatePersona(draft)
      const history = await fetchPersonaHistory()
      setState({ persona, history, loading: false, error: null })
      setDraft(persona.content)
      setSavedDraft(persona.content)
      toast.success("Persona override saved.")
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const revertToDisk = async () => {
    if (!window.confirm("Revert to the disk persona template?")) return

    setReverting(true)
    try {
      const persona = await clearPersona()
      setState({ persona, history: [], loading: false, error: null })
      setDraft(persona.content)
      setSavedDraft(persona.content)
      toast.success("Persona override cleared.")
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setReverting(false)
    }
  }

  const restoreVersion = async (entry: PersonaHistoryEntry) => {
    if (dirty && !window.confirm("Discard unsaved persona override changes?")) return

    setRestoringAt(entry.saved_at)
    try {
      const persona = await updatePersona(entry.content)
      const history = await fetchPersonaHistory()
      setState({ persona, history, loading: false, error: null })
      setDraft(persona.content)
      setSavedDraft(persona.content)
      toast.success("Persona version restored.")
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setRestoringAt(null)
    }
  }

  const persona = state.persona

  return (
    <div className="max-w-6xl">
      <section className="rounded-lg border border-border p-5">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Persona Override</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {persona ? (
                <Badge variant={persona.source === "override" ? "default" : "outline"}>
                  {persona.source === "override" ? "Override" : "Disk"}
                </Badge>
              ) : null}
              {persona?.saved_at ? (
                <span className="text-xs text-muted-foreground">
                  Saved {formatDateTime(persona.saved_at)}
                </span>
              ) : null}
              {dirty ? (
                <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={reload}
              disabled={state.loading || saving || reverting}
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={revertToDisk}
              disabled={state.loading || saving || reverting || persona?.source !== "override"}
            >
              {reverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Revert to Disk
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={state.loading || saving || reverting || !dirty}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>

        <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Runtime Override</AlertTitle>
          <AlertDescription>
            This value applies globally and resets when the API process restarts.
          </AlertDescription>
        </Alert>

        {state.error ? <StateNotice tone="error" message={state.error} /> : null}

        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={state.loading}
          className="min-h-[560px] resize-y bg-card font-mono text-sm leading-6"
          spellCheck={false}
        />
      </section>

      <section className="mt-6 rounded-lg border border-border p-5">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Version History</h2>
        </div>

        {state.loading ? (
          <StateNotice tone="muted" message="Loading history..." />
        ) : state.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous versions yet.</p>
        ) : (
          <div className="space-y-3">
            {[...state.history].reverse().map((entry) => (
              <details
                key={`${entry.saved_at}-${entry.content.length}`}
                className="rounded-md border border-border bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
                  <span>Saved {formatDateTime(entry.saved_at)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.preventDefault()
                      void restoreVersion(entry)
                    }}
                    disabled={restoringAt !== null || saving || reverting}
                  >
                    {restoringAt === entry.saved_at ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Undo2 className="h-4 w-4" />
                    )}
                    Restore
                  </Button>
                </summary>
                <pre className="max-h-80 overflow-auto border-t border-border p-4 text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                  {entry.content}
                </pre>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StateNotice({ tone, message }: { tone: "muted" | "error"; message: string }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        tone === "error"
          ? "border-destructive/30 text-destructive"
          : "border-border text-muted-foreground"
      }`}
    >
      {message}
    </div>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.status} ${error.message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
