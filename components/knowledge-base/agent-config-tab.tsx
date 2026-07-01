"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Star, Plus, Trash2, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, ApiError } from "@/lib/api"
import { registerUnsavedGuard } from "@/lib/unsaved-guard"

// ─── Agent Config Tab ───
// VAPI's transferCall destination requires strict E.164. The input is split
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
    return { countryCode: "1", areaCode: digits.slice(1, 4), number: digits.slice(4) }
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
  if (area.length !== 3) return `Area code must be 3 digits (got ${area.length})`
  if (!num) return "Enter a phone number"
  if (num.length !== 7) return `Phone number must be 7 digits (got ${num.length})`
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
}

type HotelDetail = {
  hotel_id: string
  display_name: string
  timezone: string
  pms_provider: string
  agent_name: string | null
  first_message: string | null
  email_from: string | null
  preferred_rate_code: string | null
  max_call_minutes: number | null
  is_active: boolean
  transfer_departments: TransferDepartmentRow[]
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
  }
}

function DepartmentCard({
  dept,
  onChange,
  onDelete,
  canDelete,
  onSetDefault,
}: {
  dept: Department
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
      <div className="flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
          aria-hidden
        />
        <Input
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
          title={canDelete ? "Remove department" : "At least one department is required"}
          aria-label="Remove department"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
          Transfer Phone
        </label>
        <div className="flex gap-2 items-end">
          <div className="w-20">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Country
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">+</span>
              <Input
                inputMode="numeric"
                maxLength={3}
                value={dept.phoneParts.countryCode}
                onChange={(e) =>
                  onChange({
                    phoneParts: {
                      ...dept.phoneParts,
                      countryCode: e.target.value.replace(/\D/g, "").slice(0, 3),
                    },
                  })
                }
                placeholder="1"
              />
            </div>
          </div>
          <div className="w-24">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Area Code
            </div>
            <Input
              inputMode="numeric"
              maxLength={3}
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
          <div className="flex-1 max-w-[180px]">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Phone Number
            </div>
            <Input
              inputMode="numeric"
              maxLength={8}
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

      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
          When should calls transfer here?
        </label>
        <textarea
          className="w-full min-h-[120px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          value={dept.situations}
          onChange={(e) => onChange({ situations: e.target.value })}
          placeholder={
            "Guest has not received their confirmation email\nGuest was charged incorrectly\nGuest wants to cancel or modify an existing reservation\nGuest is asking about a current or past stay"
          }
        />
        <p className="mt-2 text-xs text-muted-foreground">
          List the situations that should route to this department. One per line — write them the way a guest would actually say it.
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
          <span className="font-medium">Catch-all department</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            If the caller wants a transfer but no other department&apos;s situations match, the agent routes here. Only one department can be the catch-all.
          </span>
        </span>
      </label>
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
  const [departments, setDepartments] = useState<Department[]>([])
  const [preferredRateCode, setPreferredRateCode] = useState("")
  const [agentName, setAgentName] = useState("")
  const [firstMessage, setFirstMessage] = useState("")
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
      }),
    [
      departments,
      agentName,
      firstMessage,
      preferredRateCode,
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
    const loadedDepartments = (hotel.transfer_departments ?? []).map(rowToDepartment)
    // Defensive: backend invariant is ≥1 department, but if a hotel ever
    // ends up empty (manual DB edit, mid-migration), give the user a blank
    // row to type into. Save validation will block empty saves.
    if (loadedDepartments.length === 0) loadedDepartments.push(blankDepartment())
    setAgentName(loadedAgentName)
    setFirstMessage(loadedFirstMessage)
    setPreferredRateCode(loadedPreferredRateCode)
    setDepartments(loadedDepartments)
    // Baseline must match the shape `formSnapshot` produces so dirty reads
    // false immediately after load.
    setSavedJson(
      JSON.stringify({
        departments: loadedDepartments.map(snapshotDepartment),
        agentName: loadedAgentName,
        firstMessage: loadedFirstMessage,
        preferredRateCode: loadedPreferredRateCode,
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
    }[] = []
    for (const [idx, d] of departments.entries()) {
      const name = d.name.trim()
      const label = name || `Department ${idx + 1}`
      if (!name) {
        onErrorChange(`${label}: name is required.`)
        onStateChange("error")
        return
      }
      const key = name.toLowerCase()
      if (seenNames.has(key)) {
        onErrorChange(`Duplicate department name: ${name}.`)
        onStateChange("error")
        return
      }
      seenNames.add(key)
      const phone = buildE164FromParts(d.phoneParts)
      if (phone === null) {
        const reason =
          describeInvalidParts(d.phoneParts) ?? "invalid phone number"
        onErrorChange(`${label}: ${reason}.`)
        onStateChange("error")
        return
      }
      const situations = d.situations.trim()
      if (!situations) {
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
      })
    }

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
      await api(`/api/v1/admin/hotels/${hotelId}`, {
        method: "PUT",
        body: {
          agent_name: agentName || null,
          first_message: firstMessage || null,
          preferred_rate_code: preferredRateCode || null,
        },
      })
      hotelSaved = true

      await api(`/api/v1/admin/hotels/${hotelId}/transfer-departments`, {
        method: "PUT",
        body: { departments: departmentPayload },
      })
      // Snapshot at save time matches the form right now; use it as the new
      // baseline so dirty drops back to false.
      setSavedJson(formSnapshot)
      onStateChange("saved")
      setTimeout(() => onStateChange((s) => (s === "saved" ? "idle" : s)), 3000)
    } catch (e) {
      const detail = formatError(e)
      // Stage 2 failed after stage 1 succeeded → resync the form with what
      // actually landed so the dirty indicator is trustworthy. The fetch is
      // best-effort: if it itself fails, we just leave the form alone and
      // surface a more conservative error.
      if (hotelSaved) {
        try {
          const fresh = await api<HotelDetail>(
            `/api/v1/admin/hotels/${hotelId}`,
          )
          applyHotelDetail(fresh)
        } catch {
          /* fall through to the partial-save error below */
        }
        onErrorChange(
          `Hotel-level settings saved, but transfer departments failed: ${detail}. ` +
            `The form has been refreshed — review the departments and save again.`,
        )
      } else {
        onErrorChange(detail)
      }
      onStateChange("error")
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

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {loadError && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            Failed to load hotel settings: {loadError}
          </CardContent>
        </Card>
      )}
      {/* Transfer & Escalation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Transfer & Escalation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure which departments receive transferred calls and define the situations that trigger each transfer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Departments</h3>
            <span className="text-xs text-muted-foreground">
              {departments.length} {departments.length === 1 ? "department" : "departments"}
            </span>
          </div>
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.id}
              dept={dept}
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
            Add Department
          </Button>
        </CardContent>
      </Card>

      {/* Preferred Rate Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="w-4 h-4 text-primary" />
            Preferred Rate Code
          </CardTitle>
          <p className="text-sm text-muted-foreground">The rate code the AI agent should use when selling this property</p>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Rate Code
            </label>
            <Input
              value={preferredRateCode}
              onChange={(e) => setPreferredRateCode(e.target.value)}
              placeholder="e.g. BAR, RACK, PROMO2024"
            />
          </div>
        </CardContent>
      </Card>

      {/* Agent Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            Agent Details
          </CardTitle>
          <p className="text-sm text-muted-foreground">Customize your AI agent&apos;s identity and greeting</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Agent Name
            </label>
            <Input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Sarah, Alex, Concierge"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              First Message
            </label>
            <textarea
              className="w-full min-h-[100px] px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="e.g. Hi, thank you for calling The Lakehouse. My name is Sarah, how can I help you today?"
            />
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
