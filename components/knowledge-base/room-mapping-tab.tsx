"use client"

import { useState, useEffect, useCallback } from "react"
import { Bed, Check, ChevronRight, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"

// ─── Room Mapping Tab ───
// Room type names & ids are READ-ONLY — sourced from the PMS (StayNTouch
// catalog cache) so operators can't typo the mapping. Only the description
// is editable; it becomes the source of truth the voice agent quotes.

type RoomTypeRow = {
  room_type_id: string
  room_name: string
  cached_description: string | null
  operator_description: string | null
  image_url: string | null
  max_occupancy: number
}

type RoomTypeListResponse = {
  hotel_id: string
  pms_provider: string
  supported: boolean
  message: string | null
  rooms: RoomTypeRow[]
}

export function RoomMappingTab({ hotelId }: { hotelId: string }) {
  const [response, setResponse] = useState<RoomTypeListResponse | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState<Record<string, boolean>>({})
  const [showPms, setShowPms] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({})
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await api<RoomTypeListResponse>(
        `/api/v1/admin/hotels/${hotelId}/room-types`,
      )
      setResponse(data)
      // Seed the draft state from the server so the textareas start with the
      // current value and "dirty" detection is straightforward.
      const seeded: Record<string, string> = {}
      for (const r of data.rooms) {
        seeded[r.room_type_id] = r.operator_description ?? ""
      }
      setDrafts(seeded)
    } catch (e) {
      setLoadError(
        e instanceof ApiError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e),
      )
    }
  }, [hotelId])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }))

  const saveOne = async (room: RoomTypeRow) => {
    const id = room.room_type_id
    setSaving((prev) => ({ ...prev, [id]: "saving" }))
    try {
      const next = await api<RoomTypeRow>(
        `/api/v1/admin/hotels/${hotelId}/room-types/${encodeURIComponent(id)}`,
        { method: "PUT", body: { description: drafts[id] ?? "" } },
      )
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              rooms: prev.rooms.map((r) => (r.room_type_id === id ? next : r)),
            }
          : prev,
      )
      setSaving((prev) => ({ ...prev, [id]: "saved" }))
      setCreating((prev) => ({ ...prev, [id]: false }))
      setTimeout(
        () =>
          setSaving((prev) => {
            if (prev[id] !== "saved") return prev
            const next = { ...prev }
            delete next[id]
            return next
          }),
        2500,
      )
    } catch (e) {
      console.error("save failed", e)
      setSaving((prev) => ({ ...prev, [id]: "error" }))
    }
  }

  const refreshFromPms = async () => {
    setRefreshing(true)
    try {
      await api(`/api/v1/admin/hotels/${hotelId}/room-types/refresh`, {
        method: "POST",
      })
      await load()
    } catch (e) {
      console.error("refresh failed", e)
    } finally {
      setRefreshing(false)
    }
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load room types: {loadError}
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
            {response.message ?? "Room mapping is not available for this hotel."}
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
              <Bed className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle>Room Types</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Room names, IDs, and descriptions come from the PMS. Create an
                override to change what the voice agent tells callers.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshFromPms}
            disabled={refreshing}
            className="shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh from PMS"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {response.rooms.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground text-center">
              No room types cached yet. Click &ldquo;Refresh from PMS&rdquo; to pull them in.
            </div>
          )}
          {response.rooms.map((r) => {
            const id = r.room_type_id
            const isExpanded = expanded[id] ?? true
            const draft = drafts[id] ?? ""
            const dirty = draft !== (r.operator_description ?? "")
            const status = saving[id]
            const hasOverride = !!r.operator_description
            const isEditing = hasOverride || (creating[id] ?? false)
            const pmsVisible = showPms[id] ?? false
            return (
              <div key={id} className="border border-border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/50 cursor-pointer transition-colors hover:bg-muted"
                  onClick={() => toggle(id)}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="font-medium text-sm">{r.room_name}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      PMS ID {id}
                    </Badge>
                    {!r.operator_description && (
                      <Badge
                        variant="outline"
                        className="rounded-full text-[10px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                      >
                        Using PMS description
                      </Badge>
                    )}
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
                </div>
                {isExpanded && (
                  <div className="p-4 space-y-3 border-t border-border">
                    {!isEditing ? (
                      <>
                        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            PMS description
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                            {r.cached_description || "No description in the PMS for this room type."}
                          </p>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCreating((prev) => ({ ...prev, [id]: true }))
                            }
                          >
                            Create Override
                          </Button>
                        </div>
                      </>
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
                            placeholder="Bed config, sq ft, amenities, views — what the voice agent should tell callers."
                            className="field-sizing-fixed min-h-[100px] resize-y bg-background"
                          />
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
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
