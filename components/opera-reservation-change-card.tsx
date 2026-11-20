"use client"

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { CalendarRange, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { CatalogTable, errorText } from "@/components/opera-cancellation-card"
import {
  disableOperaReservationChanges,
  fetchOperaReservationChangeSetup,
  saveOperaReservationChangeSetup,
  type OperaReservationChangeSetup,
  type ReservationChangeKind,
} from "@/lib/api"

// The change kinds the voice flow can perform today. The backend rejects any
// other kind (room_type) until it is built, so only these are offered.
const CHANGE_KINDS: { kind: ReservationChangeKind; label: string; detail: string }[] = [
  {
    kind: "dates",
    label: "Stay dates",
    detail: "Move, extend or shorten the stay. Booked nights keep their price; added nights are quoted at today's rate.",
  },
  {
    kind: "guests",
    label: "Number of guests",
    detail: "Add or remove adults or children. Every night is re-priced at today's rate for the new guest count, and the caller hears the old and new totals before agreeing.",
  },
]

// Voice self-service changes to an existing OPERA reservation.
export function OperaReservationChangeCard({ hotelId }: { hotelId: string }) {
  const [setup, setSetup] = useState<OperaReservationChangeSetup | null>(null)
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [guarantees, setGuarantees] = useState<Set<string>>(new Set())
  const [kinds, setKinds] = useState<Set<string>>(new Set(["dates"]))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const applySetup = useCallback((next: OperaReservationChangeSetup) => {
    setSetup(next)
    setSources(new Set(Object.keys(next.saved?.allowed_source_codes ?? {})))
    setGuarantees(new Set(next.saved?.allowed_guarantee_codes ?? []))
    setKinds(new Set(next.saved?.allowed_changes ?? ["dates"]))
    setError(null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySetup(await fetchOperaReservationChangeSetup(hotelId))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [hotelId, applySetup])

  useEffect(() => {
    void load()
  }, [load])

  const readyToSave = Boolean(kinds.size && sources.size && guarantees.size)
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

  const toggle = (setter: Dispatch<SetStateAction<Set<string>>>, code: string) => {
    setter((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const save = async () => {
    if (!readyToSave) return
    setSaving(true)
    try {
      const next = await saveOperaReservationChangeSetup(hotelId, {
        allowed_changes: CHANGE_KINDS.map(({ kind }) => kind).filter((kind) => kinds.has(kind)),
        allowed_source_codes: [...sources],
        allowed_guarantee_codes: [...guarantees],
      })
      applySetup(next)
      toast.success("OPERA reservation-change setup validated and saved.")
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
      await disableOperaReservationChanges(hotelId)
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6b7a4a]/10">
                <CalendarRange className="h-5 w-5 text-[#6b7a4a]" />
              </div>
              <div>
                <CardTitle className="text-base">OPERA Reservation Changes</CardTitle>
                <CardDescription className="text-xs">
                  Let callers change a direct booking&apos;s dates or number of guests by phone. The
                  new price is quoted before the caller agrees.
                </CardDescription>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                setup?.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {readiness}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live OPERA catalogs…
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
                  <li>{kinds.size ? `${kinds.size} kind(s) of change enabled` : "Enable at least one kind of change"}</li>
                  <li>{sources.size ? `${sources.size} direct booking source(s) approved` : "Approve at least one direct booking source"}</li>
                  <li>{guarantees.size ? `${guarantees.size} guarantee code(s) approved` : "Approve at least one guarantee code"}</li>
                  <li>
                    Always sent to the Front Desk: checked-in guests, bookings with a deposit rule,
                    fixed-rate or group bookings, shortening or lowering the price inside the
                    cancellation window, and more guests than the room type holds.
                  </li>
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
                      onChange={() => toggle(setKinds, kind)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{detail}</span>
                    </span>
                  </label>
                ))}
              </div>

              <CatalogTable
                title="Direct booking sources"
                columns={["Allow", "Code", "Description", "Group"]}
                rows={setup.catalogs.sources.map((item) => ({
                  item,
                  checked: sources.has(item.code),
                  values: [item.code, item.description || "—", item.group_code || "—"],
                  onToggle: () => toggle(setSources, item.code),
                }))}
              />
              <CatalogTable
                title="Approved guarantee codes"
                columns={["Allow", "Code", "Description"]}
                rows={setup.catalogs.guarantees.map((item) => ({
                  item,
                  checked: guarantees.has(item.code),
                  values: [item.code, item.description || "—"],
                  onToggle: () => toggle(setGuarantees, item.code),
                }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void load()} disabled={loading || saving}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh from OPERA
                </Button>
                <Button onClick={() => void save()} disabled={!readyToSave || saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save and validate
                </Button>
                {setup.ready && (
                  <Button variant="destructive" onClick={() => setConfirmDisable(true)} disabled={saving}>
                    <Trash2 className="mr-2 h-4 w-4" /> Disable reservation changes
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
            <AlertDialogTitle>Disable self-service reservation changes?</AlertDialogTitle>
            <AlertDialogDescription>
              New calls will transfer change requests to staff immediately. This removes only the
              reviewed reservation-change setup; other PMS settings are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <AlertDialogAction onClick={() => void disable()} className="bg-destructive text-white">
              Disable reservation changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
