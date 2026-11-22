"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  disableCloudbedsCancellation,
  fetchCloudbedsCancellationSetup,
  saveCloudbedsCancellationSetup,
  type CloudbedsCancellationSetup,
} from "@/lib/api"

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const detail = (error.body as { detail?: unknown }).detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          item && typeof item === "object" && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : String(item),
        )
        .join("; ")
    }
    if (typeof detail === "string") return detail
  }
  return error instanceof Error ? error.message : String(error)
}

// `s-3` and `s-3-1` are the same hotel-owned source; the server stores `s-3`.
function sourceKey(id: string): string {
  const match = /^s-(\d+)(?:-1)?$/.exec(id.trim())
  return match ? `s-${match[1]}` : id.trim()
}

function parseRateIds(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean))]
}

export function CloudbedsCancellationCard({ hotelId }: { hotelId: string }) {
  const [setup, setSetup] = useState<CloudbedsCancellationSetup | null>(null)
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [rateIdsText, setRateIdsText] = useState("")
  const [days, setDays] = useState("")
  const [time, setTime] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const applySetup = useCallback((next: CloudbedsCancellationSetup) => {
    setSetup(next)
    setSources(new Set((next.saved?.allowed_sources ?? []).map((ref) => ref.id)))
    setRateIdsText((next.saved?.allowed_rate_ids ?? []).join("\n"))
    setDays(next.saved ? String(next.saved.free_until_days_before_arrival) : "")
    setTime(next.saved?.free_until_time ?? "")
    setError(null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySetup(await fetchCloudbedsCancellationSetup(hotelId))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [hotelId, applySetup])

  useEffect(() => {
    void load()
  }, [load])

  const rateIds = useMemo(() => parseRateIds(rateIdsText), [rateIdsText])
  const badRateIds = rateIds.filter((id) => !/^\d+$/.test(id))
  const daysNumber = /^\d+$/.test(days.trim()) ? Number(days.trim()) : null
  const daysValid = daysNumber !== null && daysNumber <= 365
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const readyToSave =
    sources.size > 0 && rateIds.length > 0 && badRateIds.length === 0 && daysValid && timeValid

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

  const ownSources = useMemo(
    () => (setup?.catalogs.sources ?? []).filter((item) => !item.third_party),
    [setup],
  )
  const thirdPartyCount = (setup?.catalogs.sources.length ?? 0) - ownSources.length

  const toggle = (id: string) => {
    setSources((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!readyToSave || daysNumber === null) return
    setSaving(true)
    try {
      const next = await saveCloudbedsCancellationSetup(hotelId, {
        allowed_source_ids: [...sources],
        allowed_rate_ids: rateIds,
        free_until_days_before_arrival: daysNumber,
        free_until_time: time,
      })
      applySetup(next)
      toast.success("Cloudbeds cancellation setup validated and saved.")
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
      await disableCloudbedsCancellation(hotelId)
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Cloudbeds Cancellation</CardTitle>
                <CardDescription className="text-xs">
                  Which direct bookings a caller may cancel on the phone, and until when it is free.
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
              <Loader2 className="h-4 w-4 animate-spin" /> Loading booking sources from Cloudbeds…
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
                  <li>{sources.size ? `${sources.size} booking source(s) approved` : "Approve at least one booking source"}</li>
                  <li>{rateIds.length ? `${rateIds.length} rate ID(s) approved` : "Enter at least one rate ID"}</li>
                  <li>{daysValid && timeValid ? `Free until ${daysNumber} day(s) before arrival at ${time}, hotel time` : "Enter the free-cancellation deadline"}</li>
                  {setup.validation_errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
                <div className="mt-2 text-xs text-muted-foreground">
                  Last successful validation: {verifiedAt}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Approved booking sources</Label>
                <p className="text-xs text-muted-foreground">
                  Only the hotel&apos;s own sources can be approved. Bookings from travel sites
                  ({thirdPartyCount} third-party source(s) not shown) are never cancelled on a
                  call: the guest is told to cancel with the site they booked on.
                </p>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Allow</th>
                        <th className="px-3 py-2 font-medium">Source</th>
                        <th className="px-3 py-2 font-medium">ID</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownSources.map((item) => {
                        const key = sourceKey(item.id)
                        const checked = sources.has(key)
                        return (
                          <tr
                            className={`border-t border-border ${item.active ? "" : "opacity-60"}`}
                            key={item.id}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(key)}
                                disabled={!item.active && !checked}
                                aria-label={`Allow ${item.name}`}
                              />
                            </td>
                            <td className="px-3 py-2">{item.name}</td>
                            <td className="px-3 py-2 font-mono">{item.id}</td>
                            <td className="px-3 py-2">{item.active ? "Active" : "Inactive"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cloudbeds-cancel-rates">Approved rate IDs</Label>
                <p className="text-xs text-muted-foreground">
                  The Cloudbeds rate IDs the rule below applies to, one per line. A reservation
                  on any other rate goes to the Front Desk.
                </p>
                <Textarea
                  id="cloudbeds-cancel-rates"
                  className="font-mono"
                  rows={4}
                  value={rateIdsText}
                  onChange={(event) => setRateIdsText(event.target.value)}
                  placeholder="127407175696613"
                />
                {badRateIds.length > 0 && (
                  <p className="text-xs text-destructive">
                    Rate IDs are digits only: {badRateIds.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Free-cancellation deadline</Label>
                <p className="text-xs text-muted-foreground">
                  The hotel&apos;s rule as numbers. Cloudbeds does not state it in a form we can
                  read, so a reservation past this deadline goes to the Front Desk. 0 days means
                  the arrival day itself.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="cloudbeds-cancel-days" className="text-xs text-muted-foreground">
                      Days before arrival
                    </Label>
                    <Input
                      id="cloudbeds-cancel-days"
                      className="w-32"
                      inputMode="numeric"
                      value={days}
                      onChange={(event) => setDays(event.target.value)}
                      placeholder="3"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cloudbeds-cancel-time" className="text-xs text-muted-foreground">
                      Time (hotel local)
                    </Label>
                    <Input
                      id="cloudbeds-cancel-time"
                      className="w-36"
                      type="time"
                      value={time}
                      onChange={(event) => setTime(event.target.value.slice(0, 5))}
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                A reservation is cancelled on a call only when it is a single room from an
                approved source on an approved rate, arrives after today, has nothing paid, and
                is before the deadline. Cloudbeds emails the guest. Everything else goes to the
                Front Desk.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void load()} disabled={loading || saving}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh from Cloudbeds
                </Button>
                <Button onClick={() => void save()} disabled={!readyToSave || saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save and validate
                </Button>
                {setup.saved && (
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
            <AlertDialogTitle>Disable Cloudbeds self-service cancellation?</AlertDialogTitle>
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
