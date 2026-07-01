"use client"

import { useState, useEffect, useCallback } from "react"
import { Bed, Check, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bed className="w-5 h-5 text-primary" />
              Room Types
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Room names and IDs come from the PMS. Edit the description — the voice agent
              will use it as the source of truth.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshFromPms}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh from PMS"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {response.rooms.length === 0 && (
            <div className="py-6 text-sm text-muted-foreground text-center">
              No room types cached yet. Click &ldquo;Refresh from PMS&rdquo; to pull them in.
            </div>
          )}
          {response.rooms.map((r) => {
            const id = r.room_type_id
            const isExpanded = expanded[id] ?? true
            const draft = drafts[id] ?? ""
            const dirty = draft !== (r.operator_description ?? "")
            const status = saving[id]
            return (
              <div key={id} className="border border-border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 bg-muted/50 cursor-pointer"
                  onClick={() => toggle(id)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="font-medium text-sm">{r.room_name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      PMS ID {id}
                    </Badge>
                    {!r.operator_description && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-orange-300 text-orange-600"
                      >
                        Using PMS description
                      </Badge>
                    )}
                    {status === "saved" && (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    )}
                    {status === "error" && (
                      <span className="text-[10px] text-destructive">Save failed</span>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="p-4 space-y-3">
                    {r.cached_description && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        <span className="font-medium">PMS description:</span>{" "}
                        {r.cached_description}
                      </p>
                    )}
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                        Description (source of truth)
                      </label>
                      <textarea
                        value={draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                        placeholder="Bed config, sq ft, amenities, views — what the voice agent should tell callers."
                        className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!dirty || status === "saving"}
                        onClick={() => saveOne(r)}
                      >
                        {status === "saving" ? "Saving…" : "Save description"}
                      </Button>
                    </div>
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
