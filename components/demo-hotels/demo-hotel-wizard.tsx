"use client"

// Create/update wizard for demo hotels. A platform admin either:
//   (a) downloads the JSON template + a canned LLM prompt, fills it out in an
//       external LLM chat, and pastes/uploads the result back, or
//   (b) has the backend's own LLM auto-fill drive a single-pass web-search
//       draft from just a hotel name/URL.
// Either way the result is a DemoHotelSpec, validated (server-side, via
// dry_run=true) before the real create. See lib/api.ts for the wire types —
// the backend schema uses extra:"forbid", so the UI never invents fields.

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  ApiError,
  autoFillDemoSpec,
  createDemoHotel,
  fetchAdminHotels,
  fetchDemoSpecTemplate,
  filterMockHotels,
  refreshHotelRoomTypes,
  type DemoHotelResult,
  type DemoHotelSpec,
  type DemoSpecTemplate,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { useHotel } from "@/lib/hotel-context"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"
import { defaultSections } from "@/components/knowledge-base/knowledge-base-tab"

type Phase = "source" | "upload" | "review" | "done"

// Demo knowledge is keyed to the KB editor's canonical section ids / field
// keys (the spec carries `section_id` + field `key`, not display text). Build
// id→title and `${section_id}:${key}`→label maps from the same
// defaultSections() the editor renders, so the review screen shows the exact
// titles/labels the operator will see in the Knowledge Base afterward.
const CANONICAL_SECTIONS = defaultSections()
const SECTION_TITLE_BY_ID = new Map(
  CANONICAL_SECTIONS.map((s) => [s.id, s.title]),
)
const FIELD_LABEL_BY_KEY = new Map<string, string>()
for (const s of CANONICAL_SECTIONS) {
  for (const f of s.fields ?? []) {
    FIELD_LABEL_BY_KEY.set(`${s.id}:${f.key}`, f.label)
  }
}

function sectionTitle(sectionId: string): string {
  return SECTION_TITLE_BY_ID.get(sectionId) ?? sectionId
}

function fieldLabel(
  sectionId: string,
  key: string,
  explicitLabel?: string | null,
): string {
  // Overflow fields carry their own label; canonical keys resolve from the
  // template; anything else falls back to the raw key.
  return explicitLabel || FIELD_LABEL_BY_KEY.get(`${sectionId}:${key}`) || key
}

const STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: "source", label: "1. Get a spec" },
  { phase: "upload", label: "2. Upload spec" },
  { phase: "review", label: "3. Review" },
  { phase: "done", label: "4. Create" },
]

// Fake sequential steps for the auto-fill progress overlay — the real call
// is a single 10-90s LLM round trip, so a bare spinner reads as broken.
// Mirrors the pattern in components/knowledge-base/knowledge-base-tab.tsx.
const AUTO_FILL_STEPS = [
  { label: "Searching for the property", dur: 1000 },
  { label: "Reading hotel & contact info", dur: 1400 },
  { label: "Drafting room types & rates", dur: 1400 },
  { label: "Drafting knowledge base", dur: 1400 },
  { label: "Drafting transfer routing", dur: 1000 },
  { label: "Finalizing spec", dur: 800 },
]

const AUTO_FILL_HOLD_MESSAGES = [
  "Cross-referencing sources…",
  "Estimating nightly rates…",
  "Structuring knowledge sections…",
  "Double-checking phone numbers…",
  "Finalizing the spec…",
]

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError"
}

// FastAPI 422s return `detail` as an array of Pydantic {loc, msg} objects;
// hand-rolled 4xx/5xx responses (409, 429, 502, 504) return a plain string.
// Render either as readable text instead of a raw JSON dump.
function extractDetail(e: ApiError): string | null {
  const body = e.body as { detail?: unknown } | undefined
  const detail = body?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => {
        if (!d || typeof d !== "object") return null
        const obj = d as { msg?: unknown; loc?: unknown }
        const msg = typeof obj.msg === "string" ? obj.msg : null
        const loc = Array.isArray(obj.loc) ? obj.loc.join(".") : null
        if (msg && loc) return `${loc}: ${msg}`
        return msg
      })
      .filter((s): s is string => Boolean(s))
    if (msgs.length > 0) return msgs.join("; ")
  }
  if (detail !== undefined) {
    try {
      return JSON.stringify(detail)
    } catch {
      return null
    }
  }
  return null
}

function formatApiError(e: unknown): string {
  if (e instanceof ApiError) {
    return extractDetail(e) ?? `${e.status} ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

function formatAutoFillError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      return "Anthropic rate limit hit. Wait a minute and try again."
    }
    return extractDetail(e) ?? `${e.status} ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

export function DemoHotelWizard({ onCreated }: { onCreated: () => void }) {
  const router = useRouter()
  const { setHotelId, refresh: refreshHotels } = useHotel()

  const [phase, setPhase] = React.useState<Phase>("source")

  // Template
  const [template, setTemplate] = React.useState<DemoSpecTemplate | null>(null)
  const [templateLoading, setTemplateLoading] = React.useState(true)
  const [templateError, setTemplateError] = React.useState<string | null>(null)

  // Auto-fill
  const [autoFillQuery, setAutoFillQuery] = React.useState("")
  const [autoFilling, setAutoFilling] = React.useState(false)
  const [autoFillStep, setAutoFillStep] = React.useState(0)
  const [autoFillElapsed, setAutoFillElapsed] = React.useState(0)
  const [autoFillHoldIdx, setAutoFillHoldIdx] = React.useState(0)
  const autoFillAbortRef = React.useRef<AbortController | null>(null)

  // Upload / paste
  const [pasteText, setPasteText] = React.useState("")
  const [parsing, setParsing] = React.useState(false)
  const [parseError, setParseError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // Spec + review
  const [spec, setSpec] = React.useState<DemoHotelSpec | null>(null)
  const [warnings, setWarnings] = React.useState<string[]>([])
  const [dryRunResult, setDryRunResult] = React.useState<DemoHotelResult | null>(
    null,
  )
  const [validating, setValidating] = React.useState(false)
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  )

  // Create
  const [creating, setCreating] = React.useState(false)
  const [createResult, setCreateResult] = React.useState<DemoHotelResult | null>(
    null,
  )
  const [retryingRefresh, setRetryingRefresh] = React.useState(false)

  // Existing mock/demo hotel ids — used to detect "this hotel_id already
  // exists" so the review screen can warn before an overwrite. The backend's
  // dry-run response always reports action:"validated" (nothing is written
  // on a dry run, so it never says "created"/"updated" — see
  // api/demo_hotels.py), so that has to be determined client-side instead.
  const [mockHotelIds, setMockHotelIds] = React.useState<Set<string>>(new Set())

  const loadMockHotelIds = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const all = await fetchAdminHotels({ signal })
      setMockHotelIds(new Set(filterMockHotels(all).map((h) => h.hotel_id)))
    } catch (e) {
      if (isAbortError(e)) return
      // Non-fatal — the "would replace" banner just won't show; the real
      // (non-dry-run) create call still enforces this server-side.
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadMockHotelIds(controller.signal)
    return () => controller.abort()
  }, [loadMockHotelIds])

  React.useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const t = await fetchDemoSpecTemplate({ signal: controller.signal })
        setTemplate(t)
      } catch (e) {
        if (isAbortError(e)) return
        setTemplateError(formatApiError(e))
      } finally {
        setTemplateLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  // Warn on nav-away once a spec exists but hasn't been created yet.
  const hasUnsavedSpec = spec !== null && createResult === null
  const hasUnsavedRef = React.useRef(hasUnsavedSpec)
  React.useEffect(() => {
    hasUnsavedRef.current = hasUnsavedSpec
  }, [hasUnsavedSpec])
  React.useEffect(
    () =>
      registerUnsavedGuard(() =>
        hasUnsavedRef.current
          ? "You have a demo hotel spec ready but not yet created. Leave anyway?"
          : null,
      ),
    [],
  )

  // ── Debounced dry-run re-validation (used on every review-screen edit) ──
  const validateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const validateAbortRef = React.useRef<AbortController | null>(null)

  const runDryRun = React.useCallback(async (candidate: DemoHotelSpec) => {
    validateAbortRef.current?.abort()
    const controller = new AbortController()
    validateAbortRef.current = controller
    setValidating(true)
    try {
      const result = await createDemoHotel(candidate, {
        dryRun: true,
        signal: controller.signal,
      })
      setDryRunResult(result)
      setValidationError(null)
    } catch (e) {
      if (isAbortError(e)) return
      setDryRunResult(null)
      setValidationError(formatApiError(e))
    } finally {
      setValidating(false)
    }
  }, [])

  const scheduleDryRun = React.useCallback(
    (candidate: DemoHotelSpec) => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current)
      validateTimerRef.current = setTimeout(() => {
        void runDryRun(candidate)
      }, 700)
    },
    [runDryRun],
  )

  React.useEffect(() => {
    return () => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current)
    }
  }, [])

  const enterReview = (
    nextSpec: DemoHotelSpec,
    nextWarnings: string[],
    initialResult: DemoHotelResult,
  ) => {
    setSpec(nextSpec)
    setWarnings(nextWarnings)
    setDryRunResult(initialResult)
    setValidationError(null)
    setCreateResult(null)
    setPhase("review")
  }

  // ── Template path ──
  const downloadTemplate = () => {
    if (!template) return
    const blob = new Blob([JSON.stringify(template.example, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "demo-hotel-spec.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyPrompt = async () => {
    if (!template) return
    try {
      await navigator.clipboard.writeText(template.llm_prompt)
      toast.success(
        "Prompt copied. Paste it into your LLM chat along with the downloaded template.",
      )
    } catch {
      toast.error("Couldn't copy to clipboard.")
    }
  }

  // ── Auto-fill path ──
  React.useEffect(() => {
    if (!autoFilling) {
      setAutoFillElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(
      () => setAutoFillElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [autoFilling])

  React.useEffect(() => {
    if (!autoFilling || autoFillStep <= AUTO_FILL_STEPS.length - 1) return
    setAutoFillHoldIdx(0)
    const id = setInterval(
      () => setAutoFillHoldIdx((i) => (i + 1) % AUTO_FILL_HOLD_MESSAGES.length),
      4000,
    )
    return () => clearInterval(id)
  }, [autoFilling, autoFillStep])

  const runAutoFill = async () => {
    const query = autoFillQuery.trim()
    if (!query) return
    setAutoFilling(true)
    setAutoFillStep(1)

    const timers: ReturnType<typeof setTimeout>[] = []
    let total = 0
    for (let i = 0; i < AUTO_FILL_STEPS.length - 1; i++) {
      total += AUTO_FILL_STEPS[i].dur
      const next = i + 2
      timers.push(setTimeout(() => setAutoFillStep(next), total))
    }
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t)
      timers.length = 0
    }

    const controller = new AbortController()
    autoFillAbortRef.current = controller
    try {
      const draft = await autoFillDemoSpec(query, controller.signal)
      clearTimers()
      setAutoFillStep(AUTO_FILL_STEPS.length + 1)
      await new Promise((r) => setTimeout(r, 400))
      setAutoFilling(false)
      setAutoFillStep(0)
      if (draft.warnings.length > 0) {
        for (const w of draft.warnings) toast.warning(w)
      }
      // Validate immediately so the review screen opens with a fresh
      // dry-run result rather than a stale/optimistic one.
      try {
        const result = await createDemoHotel(draft.spec, { dryRun: true })
        enterReview(draft.spec, draft.warnings, result)
      } catch (e) {
        // Still show the review screen — the inline validation banner will
        // surface the problem and the operator can edit and retry there.
        setSpec(draft.spec)
        setWarnings(draft.warnings)
        setDryRunResult(null)
        setValidationError(formatApiError(e))
        setCreateResult(null)
        setPhase("review")
      }
    } catch (e) {
      clearTimers()
      setAutoFilling(false)
      setAutoFillStep(0)
      if (isAbortError(e)) return
      const msg = formatAutoFillError(e)
      toast.error(`Auto-fill failed: ${msg}`)
    } finally {
      autoFillAbortRef.current = null
    }
  }

  const cancelAutoFill = () => autoFillAbortRef.current?.abort()

  // ── Upload / paste path ──
  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setPasteText(String(reader.result ?? ""))
    reader.onerror = () => toast.error("Couldn't read that file.")
    reader.readAsText(file)
  }

  const parseAndValidate = async () => {
    const text = pasteText.trim()
    if (!text) {
      toast.error("Paste or upload a spec first.")
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      toast.error(
        `That doesn't look like valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }
    setParsing(true)
    setParseError(null)
    try {
      const candidate = parsed as DemoHotelSpec
      const result = await createDemoHotel(candidate, { dryRun: true })
      enterReview(candidate, [], result)
    } catch (e) {
      setParseError(formatApiError(e))
    } finally {
      setParsing(false)
    }
  }

  // ── Review edits ──
  const updateSpec = (updater: (prev: DemoHotelSpec) => DemoHotelSpec) => {
    setSpec((prev) => {
      if (!prev) return prev
      const next = updater(prev)
      scheduleDryRun(next)
      return next
    })
  }

  const setHotelIdField = (value: string) =>
    updateSpec((prev) => ({ ...prev, hotel: { ...prev.hotel, hotel_id: value } }))
  const setDisplayNameField = (value: string) =>
    updateSpec((prev) => ({
      ...prev,
      hotel: { ...prev.hotel, display_name: value },
    }))
  const setDepartmentPhone = (index: number, value: string) =>
    updateSpec((prev) => ({
      ...prev,
      departments: prev.departments.map((d, i) =>
        i === index ? { ...d, phone_number: value } : d,
      ),
    }))

  // ── Create ──
  const doCreate = async () => {
    if (!spec) return
    setCreating(true)
    try {
      const result = await createDemoHotel(spec, { dryRun: false })
      setCreateResult(result)
      toast.success(
        `Demo hotel ${result.action === "created" ? "created" : "updated"}: ${result.hotel_id}`,
      )
      onCreated()
      void refreshHotels()
      void loadMockHotelIds()
      setPhase("done")
    } catch (e) {
      toast.error(formatApiError(e))
    } finally {
      setCreating(false)
    }
  }

  const retryRoomRefresh = async () => {
    if (!createResult) return
    setRetryingRefresh(true)
    try {
      await refreshHotelRoomTypes(createResult.hotel_id)
      toast.success("Room mapping refresh retried.")
      setCreateResult((prev) =>
        prev ? { ...prev, room_mapping_refreshed: true } : prev,
      )
    } catch (e) {
      toast.error(formatApiError(e))
    } finally {
      setRetryingRefresh(false)
    }
  }

  const goToHotelPage = (path: string) => {
    if (!createResult) return
    setHotelId(createResult.hotel_id)
    router.push(path)
  }

  const startOver = () => {
    if (
      hasUnsavedSpec &&
      !window.confirm("Discard the current spec and start over?")
    ) {
      return
    }
    setSpec(null)
    setWarnings([])
    setDryRunResult(null)
    setValidationError(null)
    setCreateResult(null)
    setPasteText("")
    setParseError(null)
    setAutoFillQuery("")
    setPhase("source")
  }

  const backToSource = () => {
    if (
      spec &&
      !window.confirm("Discard the current spec and go back?")
    ) {
      return
    }
    setSpec(null)
    setDryRunResult(null)
    setValidationError(null)
    setPhase("source")
  }

  // Recomputed on every render, which covers hotel_id edits automatically
  // (no separate debounce needed — this is a pure client-side Set lookup,
  // not a network call like the dry-run re-validation).
  const isExistingDemoHotel = spec ? mockHotelIds.has(spec.hotel.hotel_id) : false

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create / Update a Demo Hotel</CardTitle>
        <CardDescription>
          Build the full agent config — hotel info, rooms, knowledge base, and
          transfer routing — from one JSON spec.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Stepper phase={phase} />

        {phase === "source" ? (
          <SourceStep
            template={template}
            templateLoading={templateLoading}
            templateError={templateError}
            onDownloadTemplate={downloadTemplate}
            onCopyPrompt={copyPrompt}
            onGoToUpload={() => setPhase("upload")}
            autoFillQuery={autoFillQuery}
            setAutoFillQuery={setAutoFillQuery}
            onRunAutoFill={() => void runAutoFill()}
          />
        ) : null}

        {phase === "upload" ? (
          <UploadStep
            pasteText={pasteText}
            setPasteText={setPasteText}
            parsing={parsing}
            parseError={parseError}
            fileInputRef={fileInputRef}
            onFileChosen={handleFile}
            onParse={() => void parseAndValidate()}
            onBack={() => setPhase("source")}
          />
        ) : null}

        {phase === "review" && spec ? (
          <ReviewStep
            spec={spec}
            warnings={warnings}
            dryRunResult={dryRunResult}
            isExistingDemoHotel={isExistingDemoHotel}
            validating={validating}
            validationError={validationError}
            creating={creating}
            onHotelIdChange={setHotelIdField}
            onDisplayNameChange={setDisplayNameField}
            onDepartmentPhoneChange={setDepartmentPhone}
            onBack={backToSource}
            onCreate={() => void doCreate()}
          />
        ) : null}

        {phase === "done" && createResult ? (
          <DoneStep
            result={createResult}
            retryingRefresh={retryingRefresh}
            onRetryRefresh={() => void retryRoomRefresh()}
            onGoTo={goToHotelPage}
            onCreateAnother={startOver}
          />
        ) : null}
      </CardContent>

      <AutoFillOverlay
        open={autoFilling}
        step={autoFillStep}
        elapsed={autoFillElapsed}
        holdIdx={autoFillHoldIdx}
        query={autoFillQuery}
        onCancel={cancelAutoFill}
      />
    </Card>
  )
}

function Stepper({ phase }: { phase: Phase }) {
  const activeIndex = STEPS.findIndex((s) => s.phase === phase)
  return (
    <div className="flex flex-wrap gap-2">
      {STEPS.map((s, i) => (
        <span
          key={s.phase}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            i === activeIndex
              ? "border-primary bg-primary/10 text-primary"
              : i < activeIndex
                ? "border-border bg-muted text-muted-foreground"
                : "border-border text-muted-foreground",
          )}
        >
          {s.label}
        </span>
      ))}
    </div>
  )
}

function SourceStep({
  template,
  templateLoading,
  templateError,
  onDownloadTemplate,
  onCopyPrompt,
  onGoToUpload,
  autoFillQuery,
  setAutoFillQuery,
  onRunAutoFill,
}: {
  template: DemoSpecTemplate | null
  templateLoading: boolean
  templateError: string | null
  onDownloadTemplate: () => void
  onCopyPrompt: () => void
  onGoToUpload: () => void
  autoFillQuery: string
  setAutoFillQuery: (v: string) => void
  onRunAutoFill: () => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Template + your own LLM
          </h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Download the JSON template and the canned prompt, paste both into
          any LLM chat (attach the template file), then bring the filled-out
          JSON back here.
        </p>
        {templateError ? (
          <p className="mb-3 text-sm text-destructive">{templateError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDownloadTemplate}
            disabled={templateLoading || !template}
          >
            <Download className="h-4 w-4" />
            Download template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCopyPrompt}
            disabled={templateLoading || !template}
          >
            <Copy className="h-4 w-4" />
            Copy prompt
          </Button>
        </div>
        <Button type="button" className="mt-4" onClick={onGoToUpload}>
          I have a filled-out spec
        </Button>
      </div>

      <div className="rounded-lg border border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Auto-fill</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Give a hotel name or website and let the agent draft the whole spec
          via a single web-search pass. Takes roughly 10-90 seconds. Review
          everything before creating — auto-fill can miss or guess wrong on
          things like the real front-desk transfer number.
        </p>
        <div className="space-y-2">
          <Label htmlFor="autofill-query">Hotel name or URL</Label>
          <Input
            id="autofill-query"
            value={autoFillQuery}
            onChange={(e) => setAutoFillQuery(e.target.value)}
            placeholder="e.g. The Lake House on Canandaigua, or lakehousecanandaigua.com"
            onKeyDown={(e) => {
              if (e.key === "Enter" && autoFillQuery.trim()) onRunAutoFill()
            }}
          />
        </div>
        <Button
          type="button"
          className="mt-4"
          onClick={onRunAutoFill}
          disabled={!autoFillQuery.trim()}
        >
          <Sparkles className="h-4 w-4" />
          Auto-fill
        </Button>
      </div>
    </div>
  )
}

function UploadStep({
  pasteText,
  setPasteText,
  parsing,
  parseError,
  fileInputRef,
  onFileChosen,
  onParse,
  onBack,
}: {
  pasteText: string
  setPasteText: (v: string) => void
  parsing: boolean
  parseError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChosen: (file: File) => void
  onParse: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFileChosen(file)
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Upload JSON file
        </Button>
        <span className="text-xs text-muted-foreground">
          or paste the LLM's JSON output below
        </span>
      </div>

      <Textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder='{"spec_version": 1, "hotel": {...}, ...}'
        className="h-64 font-mono text-xs"
        spellCheck={false}
      />

      {parseError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Validation failed</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            {parseError}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onParse} disabled={parsing}>
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Parse &amp; validate
        </Button>
      </div>
    </div>
  )
}

function ReviewStep({
  spec,
  warnings,
  dryRunResult,
  isExistingDemoHotel,
  validating,
  validationError,
  creating,
  onHotelIdChange,
  onDisplayNameChange,
  onDepartmentPhoneChange,
  onBack,
  onCreate,
}: {
  spec: DemoHotelSpec
  warnings: string[]
  dryRunResult: DemoHotelResult | null
  // Whether spec.hotel.hotel_id matches an already-existing mock hotel.
  // Determined client-side against the fetched hotel list — NOT from
  // dryRunResult.action, which the backend always reports as "validated"
  // for dry runs (nothing is written, so it never says "created"/"updated").
  isExistingDemoHotel: boolean
  validating: boolean
  validationError: string | null
  creating: boolean
  onHotelIdChange: (v: string) => void
  onDisplayNameChange: (v: string) => void
  onDepartmentPhoneChange: (index: number, v: string) => void
  onBack: () => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-5">
      {warnings.length > 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Auto-fill warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {isExistingDemoHotel ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This will replace an existing demo hotel</AlertTitle>
          <AlertDescription>
            A hotel with id &ldquo;{spec.hotel.hotel_id}&rdquo; already
            exists. Creating will overwrite its rooms, knowledge base, and
            transfer departments.
          </AlertDescription>
        </Alert>
      ) : null}

      {validationError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Spec is not valid</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            {validationError}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Hotel Info
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="review-hotel-id">Hotel ID</Label>
            <Input
              id="review-hotel-id"
              value={spec.hotel.hotel_id}
              onChange={(e) => onHotelIdChange(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-display-name">Display Name</Label>
            <Input
              id="review-display-name"
              value={spec.hotel.display_name}
              onChange={(e) => onDisplayNameChange(e.target.value)}
            />
          </div>
          <ReadOnlyField label="Timezone" value={spec.hotel.timezone} />
          <ReadOnlyField label="Currency" value={spec.hotel.currency} />
          <ReadOnlyField
            label="Agent Name"
            value={spec.hotel.agent_name ?? "—"}
          />
        </div>
        {spec.hotel.first_message ? (
          <div className="mt-4 space-y-1.5">
            <Label>First Message</Label>
            <p className="rounded-md bg-muted px-3 py-2 text-sm italic text-foreground">
              &ldquo;{spec.hotel.first_message}&rdquo;
            </p>
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {validating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Re-validating…
            </>
          ) : dryRunResult && !validationError ? (
            <>
              <Check className="h-3 w-3 text-emerald-600" /> Spec is valid
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Rooms ({spec.rooms.length})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Max Occ.</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Available</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spec.rooms.map((r) => (
              <TableRow key={r.room_type_id}>
                <TableCell>{r.room_name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.room_type_id}
                </TableCell>
                <TableCell>{r.max_occupancy ?? 2}</TableCell>
                <TableCell>
                  {r.nightly_rate} {spec.hotel.currency}
                </TableCell>
                <TableCell>{r.available_count ?? 5}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Knowledge Base ({spec.knowledge.length} sections)
        </h3>
        <Accordion type="multiple">
          {spec.knowledge.map((section, i) => (
            <AccordionItem key={`${section.section_id}-${i}`} value={`kb-${i}`}>
              <AccordionTrigger>{sectionTitle(section.section_id)}</AccordionTrigger>
              <AccordionContent>
                <dl className="space-y-2">
                  {section.fields.map((f, j) => (
                    <div key={j} className="text-sm">
                      <dt className="font-medium text-foreground">
                        {fieldLabel(section.section_id, f.key, f.label)}
                      </dt>
                      <dd className="text-muted-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="rounded-lg border border-border p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Transfer Departments ({spec.departments.length})
        </h3>
        <div className="space-y-3">
          {spec.departments.map((d, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-[140px]">
                <span className="text-sm font-medium text-foreground">
                  {d.name}
                </span>
                {d.is_default ? (
                  <Badge variant="secondary" className="ml-2">
                    Default
                  </Badge>
                ) : null}
              </div>
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label htmlFor={`dept-phone-${i}`} className="text-xs">
                  Phone number
                </Label>
                <Input
                  id={`dept-phone-${i}`}
                  value={d.phone_number}
                  onChange={(e) => onDepartmentPhoneChange(i, e.target.value)}
                />
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                {d.routing_rules}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onCreate}
          disabled={creating || validating || !!validationError}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isExistingDemoHotel ? "Replace Demo Hotel" : "Create Demo Hotel"}
        </Button>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

function DoneStep({
  result,
  retryingRefresh,
  onRetryRefresh,
  onGoTo,
  onCreateAnother,
}: {
  result: DemoHotelResult
  retryingRefresh: boolean
  onRetryRefresh: () => void
  onGoTo: (path: string) => void
  onCreateAnother: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(result.webhook_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy to clipboard.")
    }
  }

  return (
    <div className="space-y-5">
      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <Check className="h-4 w-4" />
        <AlertTitle>
          Demo hotel {result.action === "created" ? "created" : "updated"}:{" "}
          {result.hotel_id}
        </AlertTitle>
        <AlertDescription>
          {result.rooms_written} rooms · {result.knowledge_entries_written}{" "}
          knowledge entries · {result.departments_written} departments
          written.
        </AlertDescription>
      </Alert>

      {!result.room_mapping_refreshed ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Room mapping cache refresh failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              The hotel was created, but refreshing its room-types cache
              failed afterward. Retry it, or refresh manually later from the
              Room Mapping page.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetryRefresh}
              disabled={retryingRefresh}
            >
              {retryingRefresh ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Retry room mapping refresh
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border p-5">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Go live on the phone
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          In the Vapi dashboard, set this demo phone number&apos;s Server URL
          to the value below to make the demo hotel live on the phone. This
          is a manual step — Resonata doesn&apos;t call the Vapi API.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={result.webhook_url} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copyWebhook}>
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onGoTo("/knowledge-base")}
        >
          Open Knowledge Base
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onGoTo("/room-mapping")}
        >
          Open Room Mapping
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onGoTo("/agent-config")}
        >
          Open Agent Configuration
        </Button>
      </div>

      <Button type="button" onClick={onCreateAnother}>
        Create another demo hotel
      </Button>
    </div>
  )
}

function AutoFillOverlay({
  open,
  step,
  elapsed,
  holdIdx,
  query,
  onCancel,
}: {
  open: boolean
  step: number
  elapsed: number
  holdIdx: number
  query: string
  onCancel: () => void
}) {
  const heldStep = step > AUTO_FILL_STEPS.length - 1
  const subtitle = heldStep
    ? AUTO_FILL_HOLD_MESSAGES[holdIdx]
    : AUTO_FILL_STEPS[Math.max(0, step - 1)]?.label ?? ""

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) return
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 truncate" title={query}>
              Drafting {query}
            </span>
          </DialogTitle>
          <DialogDescription
            key={subtitle}
            className="flex items-center gap-2 pt-1 text-sm"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            <span className="truncate">{subtitle}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              {elapsed}s
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {AUTO_FILL_STEPS.map((s, i) => {
            const active = step === i + 1
            const complete = step > i + 1
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-opacity",
                  step >= i + 1 ? "opacity-100" : "opacity-30",
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors",
                    complete
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {complete ? (
                    <Check className="h-3 w-3" />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div
                  className={cn(
                    "text-center text-[10px] leading-tight",
                    complete
                      ? "text-primary"
                      : active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          This usually takes 10-90 seconds.
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
