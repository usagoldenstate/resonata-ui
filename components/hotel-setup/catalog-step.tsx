"use client"

// Step 4 — pull the room-type catalog out of the PMS. Descriptions can be
// overridden later on the Room Mapping page; here we only prove the
// connection returns rooms.

import * as React from "react"
import { RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchHotelRoomTypes,
  patchSetupProgress,
  refreshHotelRoomTypes,
  type HotelRoomTypeList,
} from "@/lib/api"
import { cn } from "@/lib/utils"

import {
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  isAbortError,
  type StepContext,
} from "./shared"

export function CatalogStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, reload, goNext, goBack, hasBack } = ctx
  const [list, setList] = React.useState<HotelRoomTypeList | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        setList(await fetchHotelRoomTypes(hotelId, { signal }))
      } catch (e) {
        if (isAbortError(e)) return
        setError(describeApiError(e))
      }
    },
    [hotelId],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const sync = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await refreshHotelRoomTypes(hotelId)
      await load()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setRefreshing(false)
    }
  }

  const finish = async (status: "done" | "skipped") => {
    setSaving(true)
    setError(null)
    try {
      await patchSetupProgress(hotelId, { step: "catalog", status })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const rooms = list?.rooms ?? []

  return (
    <div className="space-y-6">
      <StepCard
        title="Room catalog"
        description="Caches the hotel's room types so the voice agent can name and describe them without a live lookup on every call."
      >
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={sync} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Syncing…" : "Sync room types"}
          </Button>
          {list ? (
            <span className="text-xs text-muted-foreground">
              {rooms.length} cached
            </span>
          ) : null}
        </div>

        {list && !list.supported ? (
          <Notice tone="warn">
            {list.message ?? "This PMS does not expose a room-type catalog."}
          </Notice>
        ) : null}

        {rooms.length > 0 ? (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead className="w-24">PMS ID</TableHead>
                  <TableHead className="w-20">Max occ.</TableHead>
                  <TableHead className="w-32">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => {
                  const hasText = Boolean(
                    room.operator_description || room.cached_description,
                  )
                  return (
                    <TableRow key={room.room_type_id}>
                      <TableCell className="font-medium">{room.room_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {room.room_type_id}
                      </TableCell>
                      <TableCell>{room.max_occupancy}</TableCell>
                      <TableCell>
                        <Badge variant={hasText ? "secondary" : "outline"} className="text-[10px]">
                          {hasText ? "Present" : "Missing"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : list ? (
          <Notice>
            Nothing cached yet. Run the sync — if it fails, go back and re-check the PMS
            credentials.
          </Notice>
        ) : null}

        <Notice>
          Room descriptions are what the agent reads to callers. You can override each
          one later under Room Mapping.
        </Notice>
      </StepCard>
      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={() => finish("done")}
        onSkip={() => finish("skipped")}
        saving={saving}
        error={error}
        nextLabel="Continue"
        nextDisabled={rooms.length === 0}
      />
    </div>
  )
}
