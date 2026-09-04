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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ApiError,
  disableOperaCancellation,
  fetchOperaCancellationSetup,
  saveOperaCancellationSetup,
  type OperaCancellationSetup,
} from "@/lib/api"

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const detail = (error.body as { detail?: unknown }).detail
    if (Array.isArray(detail)) return detail.map(String).join("; ")
    if (typeof detail === "string") return detail
  }
  return error instanceof Error ? error.message : String(error)
}

export function OperaCancellationCard({ hotelId }: { hotelId: string }) {
  const [setup, setSetup] = useState<OperaCancellationSetup | null>(null)
  const [reason, setReason] = useState("")
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [guarantees, setGuarantees] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const applySetup = useCallback((next: OperaCancellationSetup) => {
    setSetup(next)
    setReason(next.saved?.reason_code ?? "")
    setSources(new Set(Object.keys(next.saved?.allowed_source_codes ?? {})))
    setGuarantees(new Set(next.saved?.allowed_guarantee_codes ?? []))
    setError(null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySetup(await fetchOperaCancellationSetup(hotelId))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [hotelId, applySetup])

  useEffect(() => {
    void load()
  }, [load])

  const readyToSave = Boolean(reason && sources.size && guarantees.size)
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
    setter: Dispatch<SetStateAction<Set<string>>>,
    code: string,
  ) => {
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
      const next = await saveOperaCancellationSetup(hotelId, {
        reason_code: reason,
        allowed_source_codes: [...sources],
        allowed_guarantee_codes: [...guarantees],
      })
      applySetup(next)
      toast.success("OPERA cancellation setup validated and saved.")
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
      await disableOperaCancellation(hotelId)
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
                <CardTitle className="text-base">OPERA Cancellation</CardTitle>
                <CardDescription className="text-xs">
                  Review the exact property vocabulary allowed for free voice cancellations.
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
                  <li>{reason ? "Cancellation reason selected" : "Select a cancellation reason"}</li>
                  <li>{sources.size ? `${sources.size} booking source(s) approved` : "Approve at least one booking source"}</li>
                  <li>{guarantees.size ? `${guarantees.size} guarantee code(s) approved` : "Approve at least one guarantee code"}</li>
                  {setup.validation_errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
                <div className="mt-2 text-xs text-muted-foreground">
                  Last successful validation: {verifiedAt}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cancellation reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Select an OPERA reason" /></SelectTrigger>
                  <SelectContent>
                    {setup.catalogs.reasons.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.code} — {item.description || "No description"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <CatalogTable
                title="Approved booking sources"
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
            <AlertDialogTitle>Disable OPERA self-service cancellation?</AlertDialogTitle>
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
  item: { code: string }
  checked: boolean
  values: string[]
  onToggle: () => void
}

function CatalogTable({ title, columns, rows }: { title: string; columns: string[]; rows: CatalogRow[] }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>{columns.map((column) => <th className="px-3 py-2 font-medium" key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-border" key={row.item.code}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={row.checked} onChange={row.onToggle} aria-label={`Allow ${row.item.code}`} />
                </td>
                {row.values.map((value, index) => <td className={index === 0 ? "px-3 py-2 font-mono" : "px-3 py-2"} key={`${row.item.code}-${index}`}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
