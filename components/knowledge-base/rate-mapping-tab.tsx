"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Check, ChevronRight, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"

// ─── Rate Mapping Tab ───
// Rate names, codes & ids are READ-ONLY — sourced from the PMS (StayNTouch
// rate catalog cache, kept fresh by rate webhooks; rates deleted in the PMS
// disappear from this list). Two operator-owned knobs:
//   - description override: what the voice agent says a rate includes
//     (falls back to the PMS description when unset);
//   - "Exclude from voice" checkbox: the rate is never offered by voice
//     (staff/comp/test rates). Checkbox edits accumulate in a local draft
//     and are saved in one replace-all PUT via the header button.
// Unlike Room Mapping there is no expand/collapse — rate descriptions are
// short, so every row shows its description (override or PMS) inline.

type RateRow = {
  rate_id: string
  rate_code: string | null
  rate_name: string
  cached_description: string | null
  operator_description: string | null
  excluded: boolean
}

type RateListResponse = {
  hotel_id: string
  pms_provider: string
  supported: boolean
  message: string | null
  rates: RateRow[]
}

export function RateMappingTab({ hotelId }: { hotelId: string }) {
  const [response, setResponse] = useState<RateListResponse | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [excludedDraft, setExcludedDraft] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<Record<string, boolean>>({})
  const [showPms, setShowPms] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({})
  const [savingExclusions, setSavingExclusions] = useState<"saving" | "error" | null>(null)

  const applyResponse = useCallback((data: RateListResponse) => {
    setResponse(data)
    // Seed drafts from the server so the textareas start with the current
    // value and "dirty" detection is straightforward.
    const seeded: Record<string, string> = {}
    for (const r of data.rates) {
      seeded[r.rate_id] = r.operator_description ?? ""
    }
    setDrafts(seeded)
    setExcludedDraft(new Set(data.rates.filter((r) => r.excluded).map((r) => r.rate_id)))
  }, [])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await api<RateListResponse>(
        `/api/v1/admin/hotels/${hotelId}/rates`,
      )
      applyResponse(data)
    } catch (e) {
      setLoadError(
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e),
      )
    }
  }, [hotelId, applyResponse])

  useEffect(() => {
    void load()
  }, [load])

  const serverExcluded = useMemo(
    () => new Set((response?.rates ?? []).filter((r) => r.excluded).map((r) => r.rate_id)),
    [response],
  )
  const exclusionsDirty = useMemo(() => {
    if (excludedDraft.size !== serverExcluded.size) return true
    for (const id of excludedDraft) if (!serverExcluded.has(id)) return true
    return false
  }, [excludedDraft, serverExcluded])
  const exclusionChangeCount = useMemo(() => {
    let count = 0
    for (const id of excludedDraft) if (!serverExcluded.has(id)) count++
    for (const id of serverExcluded) if (!excludedDraft.has(id)) count++
    return count
  }, [excludedDraft, serverExcluded])

  // Any description textarea whose text differs from the saved override.
  // Descriptions save per-row, so at most one row's prose is at risk — but
  // prose is the costliest draft to lose, so the guard covers it too.
  const descriptionsDirty = useMemo(() => {
    for (const r of response?.rates ?? []) {
      if ((drafts[r.rate_id] ?? "") !== (r.operator_description ?? "")) return true
    }
    return false
  }, [drafts, response])

  // Guard against navigating away with unsaved edits — an onboarding pass
  // can tick dozens of checkboxes before the one bulk save, and a typed
  // description is only saved by its row's explicit button.
  const dirtyRef = useRef({ exclusions: false, descriptions: false })
  useEffect(() => {
    dirtyRef.current = { exclusions: exclusionsDirty, descriptions: descriptionsDirty }
  }, [exclusionsDirty, descriptionsDirty])
  useEffect(() => {
    return registerUnsavedGuard(() => {
      const { exclusions, descriptions } = dirtyRef.current
      if (exclusions && descriptions)
        return "You have unsaved rate exclusion and description changes. Leave anyway?"
      if (exclusions) return "You have unsaved rate exclusion changes. Leave anyway?"
      if (descriptions) return "You have an unsaved rate description. Leave anyway?"
      return null
    })
  }, [])

  const setExcluded = (id: string, checked: boolean) =>
    setExcludedDraft((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const saveExclusions = async () => {
    setSavingExclusions("saving")
    try {
      const data = await api<RateListResponse>(
        `/api/v1/admin/hotels/${hotelId}/rates/exclusions`,
        { method: "PUT", body: { rate_ids: [...excludedDraft] } },
      )
      applyResponse(data)
      setSavingExclusions(null)
    } catch (e) {
      console.error("save exclusions failed", e)
      setSavingExclusions("error")
    }
  }

  const saveOne = async (rate: RateRow) => {
    const id = rate.rate_id
    setSaving((prev) => ({ ...prev, [id]: "saving" }))
    try {
      // Partial update: only `description` is sent, so an unsaved exclusion
      // draft is never clobbered. Empty draft = clear the override
      // (explicit null) so the PMS description takes over again.
      const next = await api<RateRow>(
        `/api/v1/admin/hotels/${hotelId}/rates/${encodeURIComponent(id)}`,
        { method: "PUT", body: { description: (drafts[id] ?? "").trim() || null } },
      )
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              rates: prev.rates.map((r) => (r.rate_id === id ? next : r)),
            }
          : prev,
      )
      setDrafts((prev) => ({ ...prev, [id]: next.operator_description ?? "" }))
      setSaving((prev) => ({ ...prev, [id]: "saved" }))
      setCreating((prev) => ({ ...prev, [id]: false }))
      setTimeout(
        () =>
          setSaving((prev) => {
            if (prev[id] !== "saved") return prev
            const nextState = { ...prev }
            delete nextState[id]
            return nextState
          }),
        2500,
      )
    } catch (e) {
      console.error("save failed", e)
      setSaving((prev) => ({ ...prev, [id]: "error" }))
    }
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load rates: {loadError}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    )
  }

  if (!response.supported) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {response.message ?? "Rate mapping is not available for this hotel."}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
              <Tags className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle>Rates</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Rate names, codes, and descriptions come from the PMS (kept
                fresh automatically). Write an override to change how the
                voice agent explains a rate, or check &ldquo;Exclude from
                voice&rdquo; on rates the agent must never offer (staff,
                comp, test rates).
              </p>
            </div>
          </div>
          {(exclusionsDirty || savingExclusions) && (
            <div className="flex shrink-0 items-center gap-2">
              {savingExclusions === "error" && (
                <span className="text-[10px] font-medium text-destructive">
                  Save failed
                </span>
              )}
              <Button
                size="sm"
                disabled={savingExclusions === "saving" || !exclusionsDirty}
                onClick={saveExclusions}
              >
                {savingExclusions === "saving"
                  ? "Saving…"
                  : `Save exclusions (${exclusionChangeCount})`}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {response.rates.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground text-center">
              No rates cached yet. Run the catalog refresh for this hotel to
              pull them in.
            </div>
          )}
          {response.rates.map((r) => {
            const id = r.rate_id
            const draft = drafts[id] ?? ""
            const dirty = draft !== (r.operator_description ?? "")
            const status = saving[id]
            const hasOverride = !!r.operator_description
            const isEditing = hasOverride || (creating[id] ?? false)
            const pmsVisible = showPms[id] ?? false
            const isExcluded = excludedDraft.has(id)
            const exclusionChanged = isExcluded !== r.excluded
            return (
              <div
                key={id}
                className={cn(
                  "border border-border rounded-lg overflow-hidden",
                  isExcluded && "opacity-70",
                )}
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/50">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">
                      {r.rate_name || `Rate ${id}`}
                    </span>
                    {r.rate_code && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        Code: {r.rate_code}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      PMS ID: {id}
                    </Badge>
                    {dirty && status !== "saving" && (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                        Unsaved
                      </span>
                    )}
                    {status === "saved" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    )}
                    {status === "error" && (
                      <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        Save failed
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-foreground">
                      <Checkbox
                        checked={isExcluded}
                        onCheckedChange={(checked) => setExcluded(id, checked === true)}
                      />
                      Exclude from voice
                    </label>
                    {exclusionChanged && (
                      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        Not saved yet
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-3 border-t border-border">
                  {!isEditing ? (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          PMS description
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                          {r.cached_description || "No description in the PMS for this rate."}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() =>
                          setCreating((prev) => ({ ...prev, [id]: true }))
                        }
                      >
                        Create Override
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                          Override Description
                        </label>
                        <Textarea
                          value={draft}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          placeholder="What's included, who qualifies, payment/cancellation gotchas — how the voice agent should pitch this rate."
                          className="field-sizing-fixed min-h-[80px] resize-y bg-background"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Save with an empty box to remove the override and
                          fall back to the PMS description.
                        </p>
                      </div>
                      {r.cached_description && (
                        <div>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                            onClick={() =>
                              setShowPms((prev) => ({ ...prev, [id]: !pmsVisible }))
                            }
                          >
                            <ChevronRight
                              className={cn(
                                "w-3 h-3 transition-transform",
                                pmsVisible && "rotate-90",
                              )}
                            />
                            {pmsVisible ? "Hide PMS description" : "Show PMS description"}
                          </button>
                          {pmsVisible && (
                            <div className="mt-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
                              <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                                {r.cached_description}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        {!hasOverride && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={status === "saving"}
                            onClick={() => {
                              setCreating((prev) => ({ ...prev, [id]: false }))
                              setDrafts((prev) => ({ ...prev, [id]: "" }))
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={!dirty || status === "saving"}
                          onClick={() => saveOne(r)}
                        >
                          {status === "saving" ? "Saving…" : "Save override"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
