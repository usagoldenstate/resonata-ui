"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  disableCloudbedsReservationChanges,
  fetchCloudbedsReservationChangeSetup,
  saveCloudbedsReservationChangeSetup,
  type CloudbedsReservationChangeSetup,
  type ReservationChangeKind,
} from "@/lib/api"

// The change kinds the voice flow can perform today; the backend rejects any
// other kind (room_type).
const CHANGE_KINDS: { kind: ReservationChangeKind; label: string; detail: string }[] = [
  {
    kind: "dates",
    label: "Stay dates",
    detail:
      "Move, extend or shorten the stay. Booked nights keep their price; added nights are quoted at today's rate. Adding nights is offered only when the booked nights still cost what they did, otherwise the caller goes to the Front Desk.",
  },
  {
    kind: "guests",
    label: "Number of guests",
    detail:
      "Add or remove adults or children, up to what the room type holds, when the price is the same for the new number of guests.",
  },
]

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

// Voice self-service changes to an existing Cloudbeds reservation.
export function CloudbedsReservationChangeCard({ hotelId }: { hotelId: string }) {
  const [setup, setSetup] = useState<CloudbedsReservationChangeSetup | null>(null)
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [rateIdsText, setRateIdsText] = useState("")
  const [kinds, setKinds] = useState<Set<string>>(new Set(["dates", "guests"]))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const applySetup = useCallback((next: CloudbedsReservationChangeSetup) => {
    setSetup(next)
    setSources(new Set((next.saved?.allowed_sources ?? []).map((ref) => ref.id)))
    setRateIdsText((next.saved?.allowed_rate_ids ?? []).join("\n"))
    setKinds(new Set(next.saved?.allowed_changes ?? ["dates", "guests"]))
    setError(null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySetup(await fetchCloudbedsReservationChangeSetup(hotelId))
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
  const readyToSave =
    kinds.size > 0 && sources.size > 0 && rateIds.length > 0 && badRateIds.length === 0

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

  const toggleIn = (setter: typeof setSources, id: string) => {
    setter((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggle = (id: string) => toggleIn(setSources, id)

  const save = async () => {
    if (!readyToSave) return
    setSaving(true)
    try {
      const next = await saveCloudbedsReservationChangeSetup(hotelId, {
        allowed_changes: CHANGE_KINDS.map(({ kind }) => kind).filter((kind) => kinds.has(kind)),
        allowed_source_ids: [...sources],
        allowed_rate_ids: rateIds,
      })
      applySetup(next)
      toast.success("Cloudbeds reservation-change setup validated and saved.")
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
      await disableCloudbedsReservationChanges(hotelId)
      await load()
      toast.success("Self-service reservation changes disabled.")
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
                <CalendarClock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Cloudbeds Reservation Changes</CardTitle>
                <CardDescription className="text-xs">
                  Let callers change a direct booking&apos;s dates or number of guests by phone.
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
                  <li>{kinds.size ? `${kinds.size} kind(s) of change enabled` : "Enable at least one kind of change"}</li>
                  {!setup.cancellation_rule_saved && (
                    <li>
                      No cancellation rule is saved in the Cloudbeds Cancellation card, so a
                      caller who wants to shorten or move a stay goes to the Front Desk.
                    </li>
                  )}
                  {setup.validation_errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
                <div className="mt-2 text-xs text-muted-foreground">
                  Last successful validation: {verifiedAt}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">What callers can change</div>
                {CHANGE_KINDS.map(({ kind, label, detail }) => (
                  <label key={kind} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={kinds.has(kind)}
                      onChange={() => toggleIn(setKinds, kind)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{detail}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Approved booking sources</Label>
                <p className="text-xs text-muted-foreground">
                  Only the hotel&apos;s own sources can be approved. Bookings from travel sites
                  ({thirdPartyCount} third-party source(s) not shown) are never changed on a
                  call: the guest is told to change it with the site they booked on.
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
                <Label htmlFor="cloudbeds-change-rates">Approved rate IDs</Label>
                <p className="text-xs text-muted-foreground">
                  The Cloudbeds rate IDs a caller may change by phone, one per line. A
                  reservation on any other rate goes to the Front Desk.
                </p>
                <Textarea
                  id="cloudbeds-change-rates"
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

              <p className="text-xs text-muted-foreground">
                A reservation is changed on a call only when it is a single room from an
                approved source on an approved rate and arrives after today. Shortening or
                moving a stay also needs the free-cancellation deadline (set in the Cloudbeds
                Cancellation card) not to have passed, and a change that lowers the total on a
                reservation with money paid goes to the Front Desk. The caller hears the new
                total before taxes and fees and must agree before anything is changed.
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
            <AlertDialogTitle>Disable Cloudbeds self-service reservation changes?</AlertDialogTitle>
            <AlertDialogDescription>
              New calls will return to staff transfer behavior immediately. This removes only
              the reviewed reservation-change setup; other PMS settings are preserved.
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
