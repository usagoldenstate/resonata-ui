"use client"

// Step 8 — who the agent is on the phone, and where it can hand a caller off.
// The full department editor lives on the Agent Configuration page; this is
// the compact version that gets a new hotel to a workable routing table.
//
// Each line has its own opener column — `first_message` for reservations,
// `sales_first_message` for sales intake — and a blank column falls back to
// that line's template on the voice path. Only the boxes for the lines the
// hotel actually runs are rendered, and only those columns are written.

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  fetchHotelSetup,
  patchSetupProgress,
  replaceTransferDepartments,
  updateHotelOperatorSettings,
  type HotelOperatorUpdate,
  type TransferDepartmentInput,
} from "@/lib/api"

import {
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  includesReservations,
  includesSales,
  type StepContext,
} from "./shared"

const E164_RE = /^\+[1-9]\d{9,14}$/

type DraftDepartment = TransferDepartmentInput & { key: string }

function newKey() {
  return `dept_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// One opening line. `dirty` separates "the admin typed this" from "we are
// only showing the server's template default", which lets us do two things
// safely while untouched:
//   • preview a newly-typed agent name by substituting it into the default
//     (display only — a no-op when the server rendered it with no name to
//     swap out);
//   • on save, take the AUTHORITATIVE default back from GET /setup once
//     agent_name has landed, so what gets stored is the server's own
//     rendering rather than our string surgery.
type OpeningLine = {
  text: string
  dirty: boolean
  set: (value: string) => void
}

function useOpeningLine(stored: string | null, template: string): OpeningLine {
  const [text, setText] = React.useState(stored ?? template)
  const [dirty, setDirty] = React.useState(Boolean(stored))
  return {
    text,
    dirty,
    set: (value: string) => {
      setDirty(true)
      setText(value)
    },
  }
}

export function PersonaStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, status, linesMode, reload, goNext, goBack, hasBack } = ctx
  const showReservations = includesReservations(linesMode)
  const showSales = includesSales(linesMode)
  const defaults = status.first_message_defaults
  // Each line's template default, as the backend renders it from the hotel's
  // name + the agent name ON FILE. Used for prefill only — both columns are
  // editable per hotel now.
  const reservationsDefault = defaults?.reservations ?? ""
  const salesDefault = defaults?.sales ?? ""
  const renderedAgentName = (detail.agent_name ?? "").trim()

  const [agentName, setAgentName] = React.useState(detail.agent_name ?? "")
  const reservationsLine = useOpeningLine(detail.first_message, reservationsDefault)
  const salesLine = useOpeningLine(detail.sales_first_message, salesDefault)
  const [departments, setDepartments] = React.useState<DraftDepartment[]>(() =>
    (detail.transfer_departments ?? []).map((d) => ({
      key: newKey(),
      name: d.name,
      phone_number: d.phone_number,
      routing_rules: d.routing_rules,
      is_default: d.is_default,
      sales_line_transfer: d.sales_line_transfer,
    })),
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Display-only substitution of the agent name into a server-rendered
  // template. Skipped entirely when there is no name on file to replace —
  // that case is covered by re-reading the default after the save.
  const previewWithTypedName = React.useCallback(
    (template: string) => {
      const typed = agentName.trim()
      if (!template || !renderedAgentName || !typed || typed === renderedAgentName) {
        return template
      }
      return template.split(renderedAgentName).join(typed)
    },
    [agentName, renderedAgentName],
  )

  // What each box actually shows: the admin's text once touched, otherwise
  // the template with the typed agent name previewed into it.
  const displayed = (line: OpeningLine, template: string) =>
    line.dirty ? line.text : previewWithTypedName(template)
  const reservationsValue = displayed(reservationsLine, reservationsDefault)
  const salesValue = displayed(salesLine, salesDefault)

  const update = (key: string, patch: Partial<TransferDepartmentInput>) =>
    setDepartments((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    )

  // Both flags are at-most-one-per-hotel, enforced by the backend too.
  const setExclusive = (
    key: string,
    field: "is_default" | "sales_line_transfer",
    next: boolean,
  ) =>
    setDepartments((prev) =>
      prev.map((d) => ({
        ...d,
        [field]: d.key === key ? next : next ? false : d[field],
      })),
    )

  const save = async () => {
    if (departments.length === 0) {
      setError("Keep at least one transfer destination.")
      return
    }
    const payload: TransferDepartmentInput[] = []
    const seen = new Set<string>()
    for (const [i, d] of departments.entries()) {
      const label = d.name.trim() || `Department ${i + 1}`
      if (!d.name.trim()) return setError(`${label}: name is required.`)
      if (seen.has(d.name.trim().toLowerCase()))
        return setError(`Duplicate department name: ${d.name.trim()}.`)
      seen.add(d.name.trim().toLowerCase())
      if (!E164_RE.test(d.phone_number.trim()))
        return setError(`${label}: the phone number must be E.164, e.g. +14075551234.`)
      if (!d.routing_rules.trim())
        return setError(`${label}: describe at least one situation that routes here.`)
      payload.push({
        name: d.name.trim(),
        phone_number: d.phone_number.trim(),
        routing_rules: d.routing_rules,
        is_default: d.is_default,
        sales_line_transfer: d.sales_line_transfer,
      })
    }

    setSaving(true)
    setError(null)
    try {
      // A line the hotel doesn't run never reads its column, so leave it
      // alone rather than writing wording nothing will speak.
      const body: HotelOperatorUpdate = { agent_name: agentName.trim() || null }
      if (showReservations && reservationsLine.dirty) {
        body.first_message = reservationsLine.text.trim() || null
      }
      if (showSales && salesLine.dirty) {
        body.sales_first_message = salesLine.text.trim() || null
      }
      await updateHotelOperatorSettings(hotelId, body)

      // Untouched boxes: store the server's OWN rendering of each default,
      // re-read after agent_name landed, instead of the preview substituted
      // in on screen. One extra round-trip for both, and it is exact.
      const pendingReservations = showReservations && !reservationsLine.dirty
      const pendingSales = showSales && !salesLine.dirty
      if (pendingReservations || pendingSales) {
        const fresh = (await fetchHotelSetup(hotelId)).first_message_defaults
        const second: HotelOperatorUpdate = {}
        if (pendingReservations) {
          const value = fresh?.reservations?.trim() || reservationsValue.trim()
          if (value) second.first_message = value
        }
        if (pendingSales) {
          const value = fresh?.sales?.trim() || salesValue.trim()
          if (value) second.sales_first_message = value
        }
        if (Object.keys(second).length > 0) {
          await updateHotelOperatorSettings(hotelId, second)
        }
      }

      await replaceTransferDepartments(hotelId, payload)
      await patchSetupProgress(hotelId, { step: "persona", status: "done" })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <StepCard
        title="Voice persona"
        description="The name the agent gives and how each line opens. The rest of the persona is shared across hotels and edited under Dev Pages."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Agent name" htmlFor="agentName">
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Sarah"
            />
          </Field>
        </div>
        {showReservations ? (
          <Field
            label="Reservations line opening"
            htmlFor="firstMessage"
            hint="What callers to the reservations line hear first. Leave the default unless the hotel wants different wording. A recording disclosure is appended automatically."
          >
            <Textarea
              id="firstMessage"
              value={reservationsValue}
              onChange={(e) => reservationsLine.set(e.target.value)}
              rows={3}
              placeholder="Thank you for calling Anchorage by the Sea, this is Sarah — how can I help you today?"
            />
          </Field>
        ) : null}

        {showSales ? (
          <Field
            label="Sales line opening"
            htmlFor="salesFirstMessage"
            hint="What callers to the sales line hear first. Leave the default unless the hotel wants different wording."
          >
            <Textarea
              id="salesFirstMessage"
              value={salesValue}
              onChange={(e) => salesLine.set(e.target.value)}
              rows={3}
            />
          </Field>
        ) : null}
      </StepCard>

      <StepCard
        title="Transfer routing"
        description="Where the agent sends a caller it can't help. Write the situations the way a guest would say them."
      >
        {departments.map((dept, index) => (
          <div key={dept.key} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <Input
                value={dept.name}
                onChange={(e) => update(dept.key, { name: e.target.value })}
                placeholder="Front desk"
                className="max-w-xs"
              />
              <Input
                value={dept.phone_number}
                onChange={(e) => update(dept.key, { phone_number: e.target.value })}
                placeholder="+14075551234"
                className="max-w-[200px] font-mono"
              />
              <button
                type="button"
                onClick={() =>
                  setDepartments((prev) => prev.filter((d) => d.key !== dept.key))
                }
                disabled={departments.length <= 1}
                aria-label={`Remove department ${index + 1}`}
                className="ml-auto p-2 text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Textarea
              value={dept.routing_rules}
              onChange={(e) => update(dept.key, { routing_rules: e.target.value })}
              rows={3}
              placeholder={
                "Guest was charged incorrectly\nGuest wants to change an existing reservation"
              }
            />
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={dept.is_default}
                  onChange={(e) => setExclusive(dept.key, "is_default", e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Catch-all destination
              </label>
              {includesSales(linesMode) ? (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={dept.sales_line_transfer}
                    onChange={(e) =>
                      setExclusive(dept.key, "sales_line_transfer", e.target.checked)
                    }
                    className="h-3.5 w-3.5"
                  />
                  Sales-line transfer target
                </label>
              ) : null}
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() =>
            setDepartments((prev) => [
              ...prev,
              {
                key: newKey(),
                name: "",
                phone_number: "",
                routing_rules: "",
                is_default: false,
                sales_line_transfer: false,
              },
            ])
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add department
        </Button>
        <Notice>
          Only one department can be the catch-all
          {includesSales(linesMode)
            ? ", and only one can be the sales line's transfer target — with none set, the sales agent reads out the reservations number instead."
            : "."}
        </Notice>
      </StepCard>

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={save}
        saving={saving}
        error={error}
      />
    </div>
  )
}
