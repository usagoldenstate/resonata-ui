"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Save, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sidebar } from "@/components/sidebar"
import { api, ApiError } from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"
import { HotelLoadError, NoHotelAccess } from "@/components/hotel-access-state"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"
import {
  entriesToSections,
  sectionsToEntries,
  type KnowledgeEntry,
} from "@/lib/knowledge-serialize"
import {
  preserveEdits,
  researchProperty,
  type ResearchSection,
} from "@/lib/research"
import {
  KnowledgeBaseTab,
  emptyKnowledgeBase,
  defaultSections,
  computeStats,
  type PropertyData,
  type Section,
  type Room,
} from "@/components/knowledge-base/knowledge-base-tab"

export default function KnowledgeBasePage() {
  const { hotelId, hotels, loading: hotelLoading, accessState, refresh } =
    useHotel()
  const [data, setData] = useState<PropertyData>(emptyKnowledgeBase)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  // Saved-baseline JSON of the KB. We compare against the current serialization
  // to detect unsaved edits. Null while loading or before first successful load
  // so the dirty indicator doesn't flash during hotel switches.
  const [savedEntriesJson, setSavedEntriesJson] = useState<string | null>(null)
  const currentEntriesJson = useMemo(
    () => JSON.stringify(sectionsToEntries(data.sections)),
    [data.sections],
  )
  const kbDirty =
    savedEntriesJson !== null && currentEntriesJson !== savedEntriesJson

  const hotel = hotels.find((h) => h.hotel_id === hotelId)

  // Load knowledge from backend whenever the selected hotel changes. The
  // fallback `defaultSections()` stays available when a hotel has never been
  // saved via the UI, so operators start with the full section template.
  useEffect(() => {
    if (!hotelId) return
    let cancelled = false
    setLoadState("loading")
    setLoadError(null)
    setSavedEntriesJson(null)
    ;(async () => {
      try {
        const entries = await api<KnowledgeEntry[]>(
          `/api/v1/admin/hotels/${hotelId}/knowledge`,
        )
        if (cancelled) return
        // The serializer uses structurally-identical but nominally-distinct
        // Section types; cast rather than duplicate the definitions.
        const hydrated = entriesToSections(
          entries,
          defaultSections() as unknown as Parameters<typeof entriesToSections>[1],
        ) as unknown as Section[]
        setData((prev) => ({
          ...prev,
          id: `kb_${hotelId}`,
          pName: hotel?.display_name ?? prev.pName,
          sections: hydrated,
          updatedAt: new Date(),
        }))
        setSavedEntriesJson(JSON.stringify(sectionsToEntries(hydrated)))
        setLoadState("ready")
      } catch (e) {
        if (cancelled) return
        setLoadError(
          e instanceof ApiError
            ? `${e.status} ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
        )
        setLoadState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hotelId, hotel?.display_name])

  // Refresh/tab-close guard. Fires the browser's native "Leave site?" prompt
  // when the KB has unsaved edits.
  useEffect(() => {
    if (!kbDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [kbDirty])

  // In-app navigation guard. Sidebar links and the hotel selector check this
  // via lib/unsaved-guard before changing route/hotel. Ref keeps the registered
  // closure stable so we don't re-register on every dirty toggle.
  const kbDirtyRef = useRef(kbDirty)
  useEffect(() => {
    kbDirtyRef.current = kbDirty
  }, [kbDirty])
  useEffect(() => {
    return registerUnsavedGuard(() =>
      kbDirtyRef.current
        ? "You have unsaved Knowledge Base changes. Leave anyway?"
        : null,
    )
  }, [])

  // Run an LLM-powered research call for the given URL/property name and
  // splice the result into `data`. Manual edits on existing fields are
  // preserved across re-scans (see preserveEdits in lib/research.ts).
  // On error, throws back up so AutoFillCard can render its error state.
  const handleScrapeComplete = async (
    query: string,
    signal?: AbortSignal,
  ) => {
    if (!hotelId) {
      throw new Error("No hotel selected")
    }
    const fresh = await researchProperty(
      hotelId,
      query,
      data.sections as unknown as ResearchSection[],
      signal,
    )
    // Surfaced in browser DevTools so future "I clicked Analyze and nothing
    // happened" reports have evidence. Counts are cheap to compute and the
    // full payload is one expand-click away if deeper inspection is needed.
    const filledFields = fresh.sections.reduce(
      (n, s) =>
        n +
        (s.fields ?? []).filter((f) => f.value && f.value.trim() !== "").length,
      0,
    )
    console.info(
      "[research] response received",
      {
        p_name: fresh.p_name,
        p_type: fresh.p_type,
        sections: fresh.sections.length,
        filledFields,
        sources: fresh.sources,
        metadata: fresh.research_metadata,
      },
      fresh,
    )
    setData((prev) => {
      const mergedSections = preserveEdits(
        fresh.sections,
        prev.sections as unknown as ResearchSection[],
      ) as unknown as Section[]
      return {
        ...prev,
        pName: fresh.p_name,
        pType: fresh.p_type,
        sections: mergedSections,
        rooms: fresh.rooms as Room[],
        sources: fresh.sources,
        stats: computeStats(mergedSections),
        updatedAt: new Date(),
      }
    })
  }

  const handleSave = async () => {
    if (!hotelId) return
    setSaveState("saving")
    setSaveError(null)
    try {
      const entries = sectionsToEntries(data.sections)
      await api(`/api/v1/admin/hotels/${hotelId}/knowledge`, {
        method: "PUT",
        body: { entries },
      })
      setSavedEntriesJson(JSON.stringify(entries))
      setSaveState("saved")
      // Ephemeral success flash — clear after a few seconds so repeated
      // saves can show the indicator again.
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 3000)
    } catch (e) {
      setSaveError(
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e),
      )
      setSaveState("error")
    }
  }

  if (hotelLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Loading hotels…
        </div>
      </div>
    )
  }

  if (!hotelId) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        {accessState === "error" ? (
          <HotelLoadError onRetry={refresh} />
        ) : (
          <NoHotelAccess />
        )}
      </div>
    )
  }

  const topSaveDisabled = saveState === "saving" || loadState !== "ready"
  const showDirty =
    kbDirty && saveState !== "saving" && saveState !== "saved"

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b border-border px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              {hotel?.display_name ?? data.pName ?? "Knowledge Base"}
            </h1>
            {data.pType && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                {data.pType}
              </Badge>
            )}
            {loadState === "loading" && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
            {loadState === "error" && (
              <span className="text-xs text-destructive" title={loadError ?? ""}>
                Load failed
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3">
              {showDirty && (
                <span className="text-xs text-amber-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              {saveState === "saved" && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {saveState === "error" && (
                <span className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Save failed
                </span>
              )}
              <Button onClick={handleSave} disabled={topSaveDisabled}>
                <Save className="w-4 h-4 mr-2" />
                {saveState === "saving" ? "Saving…" : "Save"}
              </Button>
            </div>
            {saveState === "error" && saveError && (
              <p className="text-xs text-destructive max-w-md text-right leading-relaxed">
                {saveError}
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/30">
          <KnowledgeBaseTab data={data} setData={setData} onScrapeComplete={handleScrapeComplete} />
        </div>
      </div>
    </div>
  )
}
