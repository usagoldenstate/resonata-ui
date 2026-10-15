"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  SalesDepartmentsEditor,
  departmentDrafts,
  departmentPayload as emailRoutingPayload,
  validateDepartments,
  type DepartmentDraft,
} from "@/components/sales-departments-editor"
import {
  Star,
  Mail,
  ArrowRight,
  Plus,
  Trash2,
  Users,
  MessageSquareQuote,
  PhoneForwarded,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { OptionSelect } from "@/components/ui/option-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import {
  api,
  ApiError,
  type SalesIntakeQuestion,
  type SalesDepartment,
} from "@/lib/api"
import { lineSetOf, type HotelLines, type LineSet } from "@/lib/product-lines"
import {
  confirmDiscardUnsaved,
  registerUnsavedGuard,
} from "@/lib/unsaved-guard"

// ─── Agent Config Tab ───
// Transfers dial the stored number over SIP as a `tel:<E.164>` URI (a SIP
// REFER via LiveKit's TransferSIPParticipant for a cold transfer, an outbound
// SIP call for a warm one), so it must be strict E.164. The input is split
// into three fields (country code, area code, 7-digit number) — optimized
// for NANP, which is what this hotel agent serves — and recombined into an
// E.164 string on save. Country code 1 + 10 national digits = 11 digits
// total, which matches the E.164 minimum we enforce backend-side too.
const E164_RE = /^\+[1-9]\d{9,14}$/

type PhoneParts = { countryCode: string; areaCode: string; number: string }

const EMPTY_PARTS: PhoneParts = { countryCode: "1", areaCode: "", number: "" }

// Try to split an existing E.164 value back into three fields. Only supports
// NANP-shaped numbers (+1 + 3-digit area + 7-digit subscriber) since that's
// what the three-field UI represents. Everything else is surfaced as a
// "legacy invalid" value so the admin can re-enter it cleanly.
function parsePhoneParts(e164: string | null | undefined): PhoneParts | null {
  if (!e164 || !e164.startsWith("+")) return null
  const digits = e164.slice(1).replace(/\D/g, "")
  if (digits.startsWith("1") && digits.length === 11) {
    return {
      countryCode: "1",
      areaCode: digits.slice(1, 4),
      number: digits.slice(4),
    }
  }
  return null
}

function buildE164FromParts(parts: PhoneParts): string | null {
  const cc = parts.countryCode.replace(/\D/g, "")
  const area = parts.areaCode.replace(/\D/g, "")
  const num = parts.number.replace(/\D/g, "")
  if (!cc || !area || !num) return null
  const combined = `+${cc}${area}${num}`
  return E164_RE.test(combined) ? combined : null
}

function describeInvalidParts(parts: PhoneParts): string | null {
  const cc = parts.countryCode.replace(/\D/g, "")
  const area = parts.areaCode.replace(/\D/g, "")
  const num = parts.number.replace(/\D/g, "")
  if (!cc) return "Enter a country code"
  if (cc.startsWith("0")) return "Country code can't start with 0"
  if (!area) return "Enter an area code"
  if (area.length !== 3)
    return `Area code must be 3 digits (got ${area.length})`
  if (!num) return "Enter a phone number"
  if (num.length !== 7)
    return `Phone number must be 7 digits (got ${num.length})`
  return null
}

// Backend shape for transfer-department rows. Returned both inline on
// `HotelDetail.transfer_departments` (the read path the editor uses) and
// from the dedicated `GET /transfer-departments` endpoint (kept available
// for future use; the editor only relies on the inline shape).
type TransferDepartmentRow = {
  department_id: string
  name: string
  phone_number: string
  routing_rules: string
  position: number
  is_default: boolean
  sales_line_transfer: boolean
}

type HotelDetail = {
  hotel_id: string
  display_name: string
  timezone: string
  pms_provider: string
  agent_name: string | null
  first_message: string | null
  // What the reservations line says while first_message is empty, rendered
  // for this hotel — shown as the placeholder.
  first_message_default?: string
  email_from: string | null
  preferred_rate_code: string | null
  max_call_minutes: number | null
  is_active: boolean
  transfer_departments: TransferDepartmentRow[]
  // Which products the hotel bought; decides which per-line sections show.
  lines?: HotelLines
  // The sales line's own opener (null = the template) and the template
  // rendered for this hotel, shown as the placeholder.
  sales_first_message?: string | null
  sales_first_message_default?: string
  sales_intake_questions?: SalesIntakeQuestion[]
  sales_departments?: SalesDepartment[]
  sales_email_from?: string | null
}

// Local edit-time shape. Carries the 3-field phone breakdown alongside the
// raw E.164 value so legacy non-NANP numbers can still be displayed and
// re-entered. `id` is a stable client-side key — generated fresh on every
// hydration so focus state survives reloads predictably.
type Department = {
  id: string
  name: string
  phoneParts: PhoneParts
  legacyPhone: string | null
  situations: string
  isDefault: boolean
  // The sales intake line's one transfer target (room-reservation callers).
  // At most one per hotel, like the catch-all.
  salesLineTransfer: boolean
}

function newClientId(): string {
  return `dept_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function blankDepartment(): Department {
  return {
    id: newClientId(),
    name: "",
    phoneParts: { ...EMPTY_PARTS },
    legacyPhone: null,
    situations: "",
    isDefault: false,
    salesLineTransfer: false,
  }
}

function rowToDepartment(row: TransferDepartmentRow): Department {
  const parsed = parsePhoneParts(row.phone_number)
  return {
    id: newClientId(),
    name: row.name,
    phoneParts: parsed ?? { ...EMPTY_PARTS },
    legacyPhone: parsed ? null : row.phone_number || null,
    situations: row.routing_rules,
    isDefault: row.is_default,
    salesLineTransfer: row.sales_line_transfer,
  }
}

// Strip the unstable `id` so the snapshot used for dirty-detection isn't
// invalidated by random key generation.
function snapshotDepartment(d: Department) {
  return {
    name: d.name,
    phoneParts: d.phoneParts,
    legacyPhone: d.legacyPhone,
    situations: d.situations,
    isDefault: d.isDefault,
    salesLineTransfer: d.salesLineTransfer,
  }
}

function DepartmentCard({
  dept,
  onChange,
  onDelete,
  canDelete,
  onSetDefault,
  mode = "destinations",
}: {
  dept: Department
  mode?: "destinations" | "rules" | "all"
  onChange: (updates: Partial<Department>) => void
  onDelete: () => void
  canDelete: boolean
  // Toggling the catch-all on this row clears it on every other row.
  // Lifted to the parent so mutual-exclusivity stays consistent.
  onSetDefault: (next: boolean) => void
}) {
  const preview = buildE164FromParts(dept.phoneParts)
  const invalidReason = preview ? null : describeInvalidParts(dept.phoneParts)
  const anyInput =
    dept.phoneParts.areaCode.length > 0 || dept.phoneParts.number.length > 0

  return (
    <div className="border rounded-lg p-4 space-y-4">
      {mode !== "rules" && (
        <>
          <div className="flex items-center gap-3">
            <span
              className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
              aria-hidden
            />
            <Input
              aria-label="Transfer destination name"
              value={dept.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="e.g. Front desk, Sales, Billing"
              className="max-w-xs"
            />
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete}
              className="ml-auto p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
              title={
                canDelete
                  ? "Remove department"
                  : "At least one department is required"
              }
              aria-label="Remove department"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Transfer Phone
            </label>
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[5rem_6rem_minmax(0,180px)]">
              <div className="min-w-0">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Country
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">+</span>
                  <Input
                    inputMode="numeric"
                    maxLength={3}
                    aria-label={`${dept.name || "Destination"} country code`}
                    value={dept.phoneParts.countryCode}
                    onChange={(e) =>
                      onChange({
                        phoneParts: {
                          ...dept.phoneParts,
                          countryCode: e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 3),
                        },
                      })
                    }
                    placeholder="1"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Area Code
                </div>
                <Input
                  inputMode="numeric"
                  maxLength={3}
                  aria-label={`${dept.name || "Destination"} area code`}
                  value={dept.phoneParts.areaCode}
                  onChange={(e) =>
                    onChange({
                      phoneParts: {
                        ...dept.phoneParts,
                        areaCode: e.target.value.replace(/\D/g, "").slice(0, 3),
                      },
                    })
                  }
                  placeholder="555"
                />
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Phone Number
                </div>
                <Input
                  inputMode="numeric"
                  maxLength={8}
                  aria-label={`${dept.name || "Destination"} phone number`}
                  value={dept.phoneParts.number}
                  onChange={(e) =>
                    onChange({
                      phoneParts: {
                        ...dept.phoneParts,
                        number: e.target.value.replace(/\D/g, "").slice(0, 7),
                      },
                    })
                  }
                  placeholder="5551234"
                />
              </div>
            </div>
            {dept.legacyPhone && (
              <p className="mt-2 text-xs text-destructive">
                Current saved value{" "}
                <span className="font-mono">{dept.legacyPhone}</span> is not a
                standard NANP number. Re-enter above and save to replace it.
              </p>
            )}
            {preview && (
              <p className="mt-2 text-xs text-muted-foreground">
                Will be saved as <span className="font-mono">{preview}</span>
              </p>
            )}
            {!preview && anyInput && invalidReason && (
              <p className="mt-2 text-xs text-destructive">{invalidReason}.</p>
            )}
          </div>
        </>
      )}
      {mode !== "destinations" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {dept.name || "New transfer destination"}
            </span>
            <span className="text-sm text-muted-foreground">
              {preview || dept.legacyPhone || "Phone number not set"}
            </span>
          </div>
          <div>
            <label
              htmlFor={`transfer-rules-${dept.id}`}
              className="text-xs font-medium text-muted-foreground block mb-2"
            >
              When should calls transfer here?
            </label>
            <textarea
              id={`transfer-rules-${dept.id}`}
              className="w-full min-h-[120px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              value={dept.situations}
              onChange={(e) => onChange({ situations: e.target.value })}
              placeholder={
                "Guest has not received their confirmation email\nGuest was charged incorrectly\nGuest wants to cancel or modify an existing reservation\nGuest is asking about a current or past stay"
              }
            />
            <p className="mt-2 text-xs text-muted-foreground">
              List the situations that should route to this department. One per
              line — write them the way a guest would actually say it.
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dept.isDefault}
              onChange={(e) => onSetDefault(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
            />
            <span className="text-sm">
              <span className="font-medium">Default transfer destination</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                If the caller wants a transfer but no other department&apos;s
                situations match, the agent routes here. Choose one default
                destination for the reservations line.
              </span>
            </span>
          </label>
        </>
      )}
    </div>
  )
}

export function AgentConfigTab({
  hotelId,
  registerSave,
  onStateChange,
  onErrorChange,
  onDirtyChange,
}: {
  hotelId: string
  registerSave: (fn: (() => Promise<void>) | null) => void
  onStateChange: React.Dispatch<
    React.SetStateAction<"idle" | "saving" | "saved" | "error">
  >
  onErrorChange: React.Dispatch<React.SetStateAction<string | null>>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState("shared")
  const [emailRouting, setEmailRouting] = useState<DepartmentDraft[]>([])
  const [salesEmailSender, setSalesEmailSender] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [preferredRateCode, setPreferredRateCode] = useState("")
  const [agentName, setAgentName] = useState("")
  const [firstMessage, setFirstMessage] = useState("")
  const [firstMessageDefault, setFirstMessageDefault] = useState("")
  const [saving, setSaving] = useState(false)
  const [salesFirstMessage, setSalesFirstMessage] = useState("")
  const [salesFirstMessageDefault, setSalesFirstMessageDefault] = useState("")
  // Which per-line sections this hotel gets. Null until the hotel loads.
  const [lines, setLines] = useState<LineSet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Saved-baseline JSON snapshot of the form. Null while loading or before
  // first successful load. Compared against the live snapshot to derive dirty.
  const [savedJson, setSavedJson] = useState<string | null>(null)

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        departments: departments.map(snapshotDepartment),
        agentName,
        firstMessage,
        preferredRateCode,
        salesFirstMessage,
        emailRouting: emailRoutingPayload(emailRouting),
      }),
    [
      departments,
      agentName,
      firstMessage,
      preferredRateCode,
      salesFirstMessage,
      emailRouting,
    ],
  )
  const dirty = savedJson !== null && formSnapshot !== savedJson

  // Single source of truth for "apply server-side hotel state to the form."
  // Used by initial load and by the partial-save recovery path below — both
  // need identical state-and-snapshot semantics so `dirty` lines up with what
  // actually persisted on the server.
  const applyHotelDetail = useCallback((hotel: HotelDetail) => {
    const loadedAgentName = hotel.agent_name ?? ""
    const loadedFirstMessage = hotel.first_message ?? ""
    const loadedPreferredRateCode = String(hotel.preferred_rate_code ?? "")
    const loadedEmailRouting = departmentDrafts(hotel.sales_departments)
    setEmailRouting(loadedEmailRouting)
    setSalesEmailSender(hotel.sales_email_from || hotel.email_from || null)
    const loadedSalesFirstMessage = hotel.sales_first_message ?? ""
    const loadedDepartments = (hotel.transfer_departments ?? []).map(
      rowToDepartment,
    )
    // Defensive: backend invariant is ≥1 department, but if a hotel ever
    // ends up empty (manual DB edit, mid-migration), give the user a blank
    // row to type into. Save validation will block empty saves.
    if (loadedDepartments.length === 0)
      loadedDepartments.push(blankDepartment())
    setAgentName(loadedAgentName)
    setFirstMessage(loadedFirstMessage)
    setPreferredRateCode(loadedPreferredRateCode)
    setSalesFirstMessage(loadedSalesFirstMessage)
    setFirstMessageDefault(hotel.first_message_default ?? "")
    setSalesFirstMessageDefault(hotel.sales_first_message_default ?? "")
    setLines(lineSetOf(hotel.lines))
    setDepartments(loadedDepartments)
    // Baseline must match the shape `formSnapshot` produces so dirty reads
    // false immediately after load.
    setSavedJson(
      JSON.stringify({
        departments: loadedDepartments.map(snapshotDepartment),
        agentName: loadedAgentName,
        firstMessage: loadedFirstMessage,
        preferredRateCode: loadedPreferredRateCode,
        salesFirstMessage: loadedSalesFirstMessage,
        emailRouting: emailRoutingPayload(loadedEmailRouting),
      }),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setSavedJson(null)
    ;(async () => {
      try {
        // `transfer_departments` is included on `GET /hotels/{id}` so the
        // editor hydrates from a single round-trip.
        const hotel = await api<HotelDetail>(`/api/v1/admin/hotels/${hotelId}`)
        if (cancelled) return
        applyHotelDetail(hotel)
      } catch (e) {
        if (cancelled) return
        setLoadError(
          e instanceof ApiError
            ? `${e.status} ${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hotelId, applyHotelDetail])

  useEffect(() => {
    const syncTab = () => {
      const tab = window.location.hash.slice(1)
      setActiveTab(
        tab === "sales" && lines?.sales
          ? "sales"
          : tab === "reservations" && lines?.reservations
            ? "reservations"
            : "shared",
      )
    }
    syncTab()
    window.addEventListener("hashchange", syncTab)
    return () => window.removeEventListener("hashchange", syncTab)
  }, [lines?.reservations, lines?.sales])

  const updateDepartment = useCallback(
    (id: string, updates: Partial<Department>) => {
      setDepartments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      )
    },
    [],
  )
  const addDepartment = useCallback(() => {
    setDepartments((prev) => [...prev, blankDepartment()])
  }, [])
  const removeDepartment = useCallback((id: string) => {
    setDepartments((prev) => prev.filter((d) => d.id !== id))
  }, [])
  // Mutual-exclusion: turning this row on clears every other row's flag.
  // Backend enforces the same invariant; doing it client-side too means
  // the form state never holds an illegal "two defaults" value the user
  // would have to fix manually.
  const setDepartmentDefault = useCallback((id: string, next: boolean) => {
    setDepartments((prev) =>
      prev.map((d) => ({
        ...d,
        isDefault: d.id === id ? next : next ? false : d.isDefault,
      })),
    )
  }, [])
  // The sales line's one transfer target, picked from a single dropdown
  // (null = none: the agent reads out the reservations number instead). At
  // most one department carries the flag, like the catch-all.
  const setSalesTransferTarget = useCallback((id: string | null) => {
    setDepartments((prev) =>
      prev.map((d) => ({ ...d, salesLineTransfer: d.id === id })),
    )
  }, [])

  // Push dirty state up so the parent can show the indicator next to the
  // top-level Save button.
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // In-app navigation guard (sidebar links, hotel selector). Ref keeps the
  // registered closure stable across dirty toggles.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    return registerUnsavedGuard(() =>
      dirtyRef.current
        ? "You have unsaved Agent Configuration changes. Leave anyway?"
        : null,
    )
  }, [])

  // Refresh/tab-close guard.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const handleSave = async () => {
    // Nothing loaded yet (or the load failed): saving now would write the
    // empty form over the hotel's real settings.
    if (savedJson === null || lines === null || saving) return
    const baseline = JSON.parse(savedJson) as {
      departments: unknown
      emailRouting: unknown
    }
    const transfersChanged =
      JSON.stringify(departments.map(snapshotDepartment)) !==
      JSON.stringify(baseline.departments)
    if (lines.sales) {
      const routingProblem = validateDepartments(emailRouting)
      if (routingProblem) {
        setActiveTab("sales")
        onErrorChange(routingProblem)
        onStateChange("error")
        return
      }

    }
    if (departments.length === 0) {
      onErrorChange("At least one transfer department is required.")
      onStateChange("error")
      return
    }
    // Per-department validation: name non-empty, phone normalizes to E.164.
    // Surface the first failure with a department label so the operator knows
    // which row is bad. Names also need to be unique (case-insensitive) since
    // the backend rejects duplicates.
    const seenNames = new Set<string>()
    const departmentPayload: {
      name: string
      phone_number: string
      routing_rules: string
      is_default: boolean
      sales_line_transfer: boolean
    }[] = []
    for (const [idx, d] of (transfersChanged ? departments : []).entries()) {
      const name = d.name.trim()
      const label = name || `Department ${idx + 1}`
      if (!name) {
        setActiveTab("shared")
        onErrorChange(`${label}: name is required.`)
        onStateChange("error")
        return
      }
      const key = name.toLowerCase()
      if (seenNames.has(key)) {
        setActiveTab("shared")
        onErrorChange(`Duplicate department name: ${name}.`)
        onStateChange("error")
        return
      }
      seenNames.add(key)
      const phone = buildE164FromParts(d.phoneParts)
      if (phone === null) {
        setActiveTab("shared")
        const reason =
          describeInvalidParts(d.phoneParts) ?? "invalid phone number"
        onErrorChange(`${label}: ${reason}.`)
        onStateChange("error")
        return
      }
      const situations = d.situations.trim()
      if (!situations) {
        setActiveTab(lines.reservations ? "reservations" : "shared")
        onErrorChange(
          `${label}: describe at least one situation under "When should calls transfer here?"`,
        )
        onStateChange("error")
        return
      }
      departmentPayload.push({
        name,
        phone_number: phone,
        routing_rules: d.situations,
        is_default: d.isDefault,
        sales_line_transfer: d.salesLineTransfer,
      })
    }

    setSaving(true)
    onStateChange("saving")
    onErrorChange(null)

    // Sequential, two-stage save. Hotel-level fields go first because they
    // can't fail server-side validation independently of departments — that
    // way if departments fail, we know exactly which half persisted.
    //
    // On any failure, we re-fetch the canonical hotel state and rehydrate
    // the form. That keeps the dirty indicator honest: stage-1 changes that
    // landed are no longer dirty, stage-2 changes that didn't are still in
    // the user's edits to retry.
    const formatError = (e: unknown) =>
      e instanceof ApiError
        ? `${e.status} ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e)

    let hotelSaved = false
    try {
      // Only the fields of the lines this hotel has: a sales-only hotel's
      // hidden reservation fields (and vice versa) are left exactly as stored.
      const hotelBody: Record<string, unknown> = {
        agent_name: agentName || null,
      }
      if (lines?.reservations) {
        hotelBody.first_message = firstMessage || null
        hotelBody.preferred_rate_code = preferredRateCode || null
      }
      if (lines?.sales) {
        // Blank clears to the template server-side.
        hotelBody.sales_first_message = salesFirstMessage
        if (
          JSON.stringify(emailRoutingPayload(emailRouting)) !==
          JSON.stringify(baseline.emailRouting)
        ) {
          hotelBody.sales_departments = emailRoutingPayload(emailRouting)
        }
      }
      const savedHotel = await api<HotelDetail>(
        `/api/v1/admin/hotels/${hotelId}`,
        {
          method: "PUT",
          body: hotelBody,
        },
      )
      hotelSaved = true
      // Retain minted IDs even if the subsequent department save fails.
      setSalesFirstMessageDefault(savedHotel.sales_first_message_default ?? "")
      const savedRouting = departmentDrafts(savedHotel.sales_departments)
      setEmailRouting(savedRouting)

      if (transfersChanged) {
        await api(`/api/v1/admin/hotels/${hotelId}/transfer-departments`, {
          method: "PUT",
          body: { departments: departmentPayload },
        })
      }
      // Snapshot at save time matches the form right now; use it as the new
      // baseline so dirty drops back to false.
      setSavedJson(
        JSON.stringify({
          ...JSON.parse(formSnapshot),
          emailRouting: emailRoutingPayload(savedRouting),
        }),
      )
      onStateChange("saved")
      setTimeout(() => onStateChange((s) => (s === "saved" ? "idle" : s)), 3000)
    } catch (e) {
      const detail = formatError(e)
      // Stage 2 failed after stage 1 succeeded → resync the form with what
      // actually landed so the dirty indicator is trustworthy. The fetch is
      // best-effort: if it itself fails, we just leave the form alone and
      // surface a more conservative error.
      if (hotelSaved) {
        let refreshed = false
        try {
          const fresh = await api<HotelDetail>(
            `/api/v1/admin/hotels/${hotelId}`,
          )
          applyHotelDetail(fresh)
          setDepartments(departments)
          refreshed = true
        } catch {
          /* fall through to the partial-save error below */
        }
        onErrorChange(
          `Hotel-level settings saved, but transfer departments failed: ${detail}. ` +
            (refreshed
              ? "Saved fields have been refreshed; your transfer edits are retained. Review them and save again."
              : "Could not refresh saved fields. Your edits are retained; review them before retrying."),
        )
      } else {
        onErrorChange(detail)
      }
      onStateChange("error")
    } finally {
      setSaving(false)
    }
  }

  // Keep a ref to the latest handleSave so the function we register with the
  // parent is stable — no re-registration on every keystroke — while still
  // capturing the current form-state closure when invoked.
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    registerSave(() => handleSaveRef.current())
    return () => registerSave(null)
  }, [registerSave])

  const salesTransferTarget =
    departments.find((d) => d.salesLineTransfer)?.id ?? ""

  const reservationsSection = (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareQuote className="w-4 h-4 text-primary" />
            Reservations Greeting
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            What the agent says when it answers the reservations line. Leave it
            empty to use the default shown below.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <label
            htmlFor="reservations-greeting"
            className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1"
          >
            First Message
          </label>
          <textarea
            id="reservations-greeting"
            className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            placeholder={firstMessageDefault}
          />
          {firstMessage.trim() !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFirstMessage("")}
              className="text-muted-foreground"
            >
              Reset to default
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="w-4 h-4 text-primary" />
            Preferred Rate Code
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            The rate code the AI agent should use when selling this property
          </p>
        </CardHeader>
        <CardContent>
          <div>
            <label
              htmlFor="preferred-rate"
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1"
            >
              Rate Code
            </label>
            <Input
              id="preferred-rate"
              value={preferredRateCode}
              onChange={(e) => setPreferredRateCode(e.target.value)}
              placeholder="e.g. BAR, RACK, PROMO2024"
            />
          </div>
        </CardContent>
      </Card>
    </>
  )

  const salesSection = (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareQuote className="w-4 h-4 text-primary" />
            Sales Greeting
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            What the agent says when it answers the sales line. Leave it empty
            to use the default shown below.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <label
            htmlFor="sales-greeting"
            className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1"
          >
            First Message
          </label>
          <textarea
            id="sales-greeting"
            className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            value={salesFirstMessage}
            onChange={(e) => setSalesFirstMessage(e.target.value)}
            placeholder={salesFirstMessageDefault}
          />
          {salesFirstMessage.trim() !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSalesFirstMessage("")}
              className="text-muted-foreground"
            >
              Reset to default
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sales conversation script</CardTitle>
          <p className="text-sm text-muted-foreground">Build question paths, describe branching conditions, and name the answers you want to capture.</p>
        </CardHeader>
        <CardContent><Button asChild variant="outline"><Link href="/agent-config/sales-script" onClick={event => { if (!confirmDiscardUnsaved()) event.preventDefault() }}>Open flow builder <ArrowRight className="ml-2 size-4" /></Link></Button></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Mail className="size-4 text-primary" /> Inquiry email routing
            <Badge variant="secondary">After intake</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which team receives each captured inquiry by email.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SalesDepartmentsEditor
            departments={emailRouting}
            onChange={setEmailRouting}
            disabled={saving}
          />
          <p className="text-sm text-muted-foreground">
            Email sender: {salesEmailSender || "Platform default"}
          </p>
          <Link
            href="/settings#delivery"
            onClick={(e) => {
              if (!confirmDiscardUnsaved()) e.preventDefault()
            }}
            className="text-sm text-primary underline underline-offset-4"
          >
            Manage email sender in Settings ↗
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <PhoneForwarded className="w-4 h-4 text-primary" />
            Room reservation requests
            <Badge variant="secondary">During call</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            The sales line only rings after the sales team didn&apos;t answer,
            so the agent never transfers callers back to sales or the front
            desk. The one exception is a caller who just wants an ordinary room
            reservation.
          </p>
        </CardHeader>
        <CardContent>
          <label
            htmlFor="sales-transfer-target"
            className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1"
          >
            Room-reservation callers are transferred to
          </label>
          <OptionSelect
            id="sales-transfer-target"
            value={salesTransferTarget}
            onValueChange={(v) => setSalesTransferTarget(v || null)}
            className="max-w-sm"
            options={[
              {
                value: "",
                label: "No transfer: read out the reservations number",
              },
              ...departments.map((d, idx) => ({
                value: d.id,
                label: d.name.trim() || `Department ${idx + 1}`,
              })),
            ]}
          />
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto px-0"
            onClick={() => setActiveTab("shared")}
          >
            Manage transfer phone destinations ↗
          </Button>
        </CardContent>
      </Card>
    </>
  )

  return (
    <fieldset
      disabled={saving || savedJson === null}
      className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 min-w-0 w-full"
    >
      {loadError && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            Failed to load hotel settings: {loadError}
          </CardContent>
        </Card>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-5">
        <TabsList
          aria-label="Agent configuration sections"
          className="h-auto flex-wrap justify-start"
        >
          <TabsTrigger value="shared">Shared</TabsTrigger>
          {lines?.reservations && (
            <TabsTrigger value="reservations">Reservations</TabsTrigger>
          )}
          {lines?.sales && <TabsTrigger value="sales">Sales</TabsTrigger>}
        </TabsList>
        <p className="text-xs text-muted-foreground">
          Save all agent changes applies edits across these tabs.
        </p>
        <TabsContent value="shared" className="space-y-6">
          {/* Agent name — shared by every line */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-primary" />
                Agent Details
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {lines?.reservations && lines?.sales
                  ? "The agent's name is shared by the reservations and sales lines"
                  : "Customize your AI agent's identity"}
              </p>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="agent-name"
                className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1"
              >
                Agent Name
              </label>
              <Input
                id="agent-name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. Sarah, Alex, Concierge"
              />
            </CardContent>
          </Card>

          {/* Transfer phone destinations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Transfer phone destinations
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Reusable phone numbers. Choose when to use them in each line’s
                configuration.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Destinations</h3>
                <span className="text-xs text-muted-foreground">
                  {departments.length}{" "}
                  {departments.length === 1 ? "destination" : "destinations"}
                </span>
              </div>
              {!lines?.reservations && (
                <p className="text-sm text-muted-foreground">
                  Reservation transfer rules are retained here for future use.
                  They do not apply to the sales line; choose its
                  room-reservation transfer on the Sales tab.
                </p>
              )}
              {lines?.reservations && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => setActiveTab("reservations")}
                >
                  Configure required call transfer rules in Reservations ↗
                </Button>
              )}
              {departments.map((dept) => (
                <DepartmentCard
                  key={dept.id}
                  dept={dept}
                  mode={lines?.reservations ? "destinations" : "all"}
                  onChange={(updates) => updateDepartment(dept.id, updates)}
                  onDelete={() => removeDepartment(dept.id)}
                  canDelete={departments.length > 1}
                  onSetDefault={(next) => setDepartmentDefault(dept.id, next)}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addDepartment}
                className="w-full border-dashed"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add destination
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        {lines?.reservations && (
          <TabsContent value="reservations" className="space-y-6">
            <CallFlow
              steps={[
                "Greet caller",
                "Help with booking",
                "Transfer when needed",
              ]}
            />
            {reservationsSection}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PhoneForwarded className="size-4 text-primary" /> Call
                  transfers
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  When to connect a live reservations caller to a hotel team.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {departments.map((dept) => (
                  <DepartmentCard
                    key={dept.id}
                    dept={dept}
                    mode="rules"
                    onChange={(updates) => updateDepartment(dept.id, updates)}
                    onDelete={() => removeDepartment(dept.id)}
                    canDelete={false}
                    onSetDefault={(next) => setDepartmentDefault(dept.id, next)}
                  />
                ))}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => setActiveTab("shared")}
                >
                  Manage transfer phone destinations ↗
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {lines?.sales && (
          <TabsContent value="sales" className="space-y-6">
            <CallFlow
              steps={[
                "Greet caller",
                "Collect details",
                "Email the right team",
              ]}
            />
            {salesSection}
          </TabsContent>
        )}
      </Tabs>
    </fieldset>
  )
}

function CallFlow({ steps }: { steps: string[] }) {
  return (
    <ol
      aria-label="Call flow"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary"
    >
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-3">
          {index > 0 && <ArrowRight aria-hidden="true" className="size-3.5" />}
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}
