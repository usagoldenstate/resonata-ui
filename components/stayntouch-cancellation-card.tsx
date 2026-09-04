"use client"

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
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
import {
  ApiError,
  disableStaynTouchCancellation,
  fetchStaynTouchCancellationSetup,
  saveStaynTouchCancellationSetup,
  type StaynTouchCancellationCatalogItem,
  type StaynTouchCancellationSetup,
} from "@/lib/api"

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const detail = (error.body as { detail?: unknown }).detail
    if (Array.isArray(detail)) return detail.map(String).join("; ")
    if (typeof detail === "string") return detail
  }
  return error instanceof Error ? error.message : String(error)
}

export function StaynTouchCancellationCard({ hotelId }: { hotelId: string }) {
  const [setup, setSetup] = useState<StaynTouchCancellationSetup | null>(null)
  const [origins, setOrigins] = useState<Set<number>>(new Set())
  const [sources, setSources] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const applySetup = useCallback((next: StaynTouchCancellationSetup) => {
    setSetup(next)
    setOrigins(new Set((next.saved?.allowed_origins ?? []).map((ref) => ref.id)))
    setSources(new Set((next.saved?.allowed_sources ?? []).map((ref) => ref.id)))
    setError(null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySetup(await fetchStaynTouchCancellationSetup(hotelId))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [hotelId, applySetup])

  useEffect(() => {
    void load()
  }, [load])

  const readyToSave = Boolean(origins.size && sources.size)
  const readiness = setup?.ready
    ? "Ready"
    : setup?.saved ||
        setup?.validation_errors.some((message) => !message.includes("setup is missing"))
      ? "Needs review"
      : "Not configured"
  const verifiedAt = useMemo(() => {
    const value = setup?.saved?.catalog_verified_at
    return value ? new Date(value).toLocaleString() : "Never"
  }, [setup])

  const toggle = (
    setter: Dispatch<SetStateAction<Set<number>>>,
    id: number,
  ) => {
    setter((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!readyToSave) return
    setSaving(true)
    try {
      const next = await saveStaynTouchCancellationSetup(hotelId, {
        allowed_origin_ids: [...origins],
        allowed_source_ids: [...sources],
      })
      applySetup(next)
      toast.success("StayNTouch cancellation setup validated and saved.")
    } catch (cause) {
      const message = errorText(cause)
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const disable = async () => {
    setSaving(true)
    try {
      await disableStaynTouchCancellation(hotelId)
      await load()
      toast.success("Self-service cancellation disabled.")
    } catch (cause) {
      toast.error(errorText(cause))
    } finally {
      setSaving(false)
      setConfirmDisable(false)
    }
  }

  return (
    <>
      <Card className="col-span-2 border-border">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6b7a4a]/10">
                <ShieldCheck className="h-5 w-5 text-[#6b7a4a]" />
              </div>
              <div>
                <CardTitle className="text-base">StayNTouch Cancellation</CardTitle>
                <CardDescription className="text-xs">
                  Review the exact property origins and sources allowed for free voice cancellations.
                </CardDescription>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                setup?.ready
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {readiness}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live StayNTouch catalogs…
            </div>
          ) : error && !setup ? (
            <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : setup ? (
            <>
              {error && (
                <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium">Readiness checklist</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>{origins.size ? `${origins.size} booking origin(s) approved` : "Approve at least one booking origin"}</li>
                  <li>{sources.size ? `${sources.size} booking source(s) approved` : "Approve at least one booking source"}</li>
                  {setup.validation_errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
                <div className="mt-2 text-xs text-muted-foreground">
                  Last successful validation: {verifiedAt}
                </div>
              </div>

              <CatalogTable
                title="Approved booking origins"
                hint="The channel a reservation was booked through (front desk, phone, website, OTA). Approve direct channels only — OTA-originated bookings must be cancelled with the OTA."
                columns={["Allow", "Name", "Description", "Status"]}
                rows={setup.catalogs.origins.map((item) => ({
                  item,
                  checked: origins.has(item.id),
                  values: [item.label, item.description || "—", item.active ? "Active" : "Inactive"],
                  onToggle: () => toggle(setOrigins, item.id),
                }))}
              />
              <CatalogTable
                title="Approved booking sources"
                hint="The source-of-business tag used for attribution (segment, campaign, referral partner). A reservation must match an approved origin and an approved source to qualify."
                columns={["Allow", "Code", "Description", "Status"]}
                rows={setup.catalogs.sources.map((item) => ({
                  item,
                  checked: sources.has(item.id),
                  values: [item.label, item.description || "—", item.active ? "Active" : "Inactive"],
                  onToggle: () => toggle(setSources, item.id),
                }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void load()} disabled={loading || saving}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh from StayNTouch
                </Button>
                <Button onClick={() => void save()} disabled={!readyToSave || saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save and validate
                </Button>
                {setup.ready && (
                  <Button variant="destructive" onClick={() => setConfirmDisable(true)} disabled={saving}>
                    <Trash2 className="mr-2 h-4 w-4" /> Disable self-service
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable StayNTouch self-service cancellation?</AlertDialogTitle>
            <AlertDialogDescription>
              New calls will return to staff transfer behavior immediately. This removes only
              the reviewed cancellation setup; other PMS settings are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <AlertDialogAction onClick={() => void disable()} className="bg-destructive text-white">
              Disable self-service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type CatalogRow = {
  item: StaynTouchCancellationCatalogItem
  checked: boolean
  values: string[]
  onToggle: () => void
}

function CatalogTable({ title, hint, columns, rows }: { title: string; hint?: string; columns: string[]; rows: CatalogRow[] }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>{columns.map((column) => <th className="px-3 py-2 font-medium" key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={`border-t border-border ${row.item.active ? "" : "opacity-60"}`}
                key={row.item.id}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={row.onToggle}
                    disabled={!row.item.active && !row.checked}
                    aria-label={`Allow ${row.item.label}`}
                  />
                </td>
                {row.values.map((value, index) => <td className={index === 0 ? "px-3 py-2 font-mono" : "px-3 py-2"} key={`${row.item.id}-${index}`}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
