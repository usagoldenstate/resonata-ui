"use client"

// Sales departments: where the sales intake emails each inquiry.
//
// The agent reads every department's name and description to decide where an
// inquiry goes; anything that doesn't clearly fit lands on the one catch-all.
// A hotel with a single department never asks the agent to choose. Shared by
// Settings → Sales and the setup wizard's Sales step, which own saving.

import * as React from "react"
import { Inbox, Plus, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { SalesDepartment, SalesDepartmentInput } from "@/lib/api"

// Mirrors the backend limits in api/admin.py (_normalize_sales_departments).
const MAX_DEPARTMENTS = 10
const MAX_NAME = 80
const MAX_DESCRIPTION = 300
const MAX_RECIPIENTS = 20
// Same shape the backend accepts: one local part, one "@", a dotted domain,
// and no separators (recipient lists are stored comma-joined).
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/

export type DepartmentDraft = SalesDepartmentInput & { key: string }

export function departmentDrafts(departments: SalesDepartment[] | undefined): DepartmentDraft[] {
  return (departments ?? []).map((d) => ({ ...d, key: d.id }))
}

// What a hotel with no departments starts from: one catch-all that takes
// every inquiry, so routing is invisible until a second department exists.
export function defaultDepartmentDraft(): DepartmentDraft {
  return {
    key: crypto.randomUUID(),
    name: "Sales Department",
    description: "All sales inquiries go here.",
    to: [],
    cc: [],
    catch_all: true,
  }
}

// Client keys keep React state stable; only server-issued ids go back.
export function departmentPayload(drafts: DepartmentDraft[]): SalesDepartmentInput[] {
  return drafts.map(({ id, name, description, to, cc, catch_all }) => ({
    ...(id ? { id } : {}),
    name: name.trim(),
    description: description.trim(),
    to,
    cc,
    catch_all,
  }))
}

export function departmentsChanged(drafts: DepartmentDraft[], saved: SalesDepartment[] | undefined) {
  return JSON.stringify(departmentPayload(drafts)) !== JSON.stringify(departmentPayload(departmentDrafts(saved)))
}

// First problem that would make the save fail, phrased for the hotelier.
export function validateDepartments(drafts: DepartmentDraft[]): string | null {
  const names = new Set<string>()
  for (const d of drafts) {
    const name = d.name.replace(/\s+/g, " ").trim()
    if (!name) return "Every sales department needs a name."
    if (name.length > MAX_NAME) return `${name}: shorten the name to ${MAX_NAME} characters.`
    if (names.has(name.toLowerCase())) return `Two sales departments are named “${name}”.`
    names.add(name.toLowerCase())
    if (d.description.replace(/\s+/g, " ").trim().length > MAX_DESCRIPTION) {
      return `${name}: shorten the description to ${MAX_DESCRIPTION} characters.`
    }
    if (d.to.length === 0) return `${name}: add at least one “Send to” email address.`
  }
  if (drafts.length > 0 && drafts.filter((d) => d.catch_all).length !== 1) {
    return "Choose one catch-all department."
  }
  return null
}

export function SalesDepartmentsEditor({
  departments,
  onChange,
  disabled = false,
}: {
  departments: DepartmentDraft[]
  onChange: (departments: DepartmentDraft[]) => void
  disabled?: boolean
}) {
  const update = (key: string, patch: Partial<DepartmentDraft>) =>
    onChange(departments.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const makeCatchAll = (key: string) =>
    onChange(departments.map((d) => ({ ...d, catch_all: d.key === key })))

  const add = () =>
    onChange([
      ...departments,
      {
        key: crypto.randomUUID(),
        name: "",
        description: "",
        to: [],
        cc: [],
        // The first department is the catch-all by necessity.
        catch_all: departments.length === 0,
      },
    ])

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        The agent reads each department&apos;s name and description to decide where an inquiry goes,
        without asking the caller. Anything that doesn&apos;t clearly fit goes to the catch-all. With a
        single department, every inquiry goes there.
      </p>

      {departments.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <p className="text-sm font-medium">No sales departments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add one so the sales intake has somewhere to send inquiries.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {departments.map((department, index) => {
          const descriptionLength = department.description.replace(/\s+/g, " ").trim().length
          return (
            <li key={department.key} className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Inbox className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {department.name.trim() || `Department ${index + 1}`}
                  </span>
                  {department.catch_all && <Badge variant="secondary">Catch-all</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {!department.catch_all && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => makeCatchAll(department.key)}
                    >
                      Make catch-all
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || (department.catch_all && departments.length > 1)}
                    title={
                      department.catch_all && departments.length > 1
                        ? "Make another department the catch-all before removing this one"
                        : undefined
                    }
                    aria-label={`Remove ${department.name.trim() || `department ${index + 1}`}`}
                    onClick={() => onChange(departments.filter((d) => d.key !== department.key))}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`dept-name-${department.key}`} className="text-xs text-muted-foreground">
                  Name
                </Label>
                <Input
                  id={`dept-name-${department.key}`}
                  value={department.name}
                  maxLength={MAX_NAME}
                  disabled={disabled}
                  placeholder="e.g. Corporate"
                  onChange={(e) => update(department.key, { name: e.target.value })}
                  className="bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`dept-description-${department.key}`} className="text-xs text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  id={`dept-description-${department.key}`}
                  rows={2}
                  value={department.description}
                  disabled={disabled}
                  placeholder="e.g. Company meetings, offsites, trainings, client dinners"
                  onChange={(e) => update(department.key, { description: e.target.value })}
                  className="bg-card"
                />
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    Which inquiries belong here. Examples help with borderline calls.
                  </span>
                  <span
                    className={
                      descriptionLength > MAX_DESCRIPTION ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"
                    }
                  >
                    {descriptionLength}/{MAX_DESCRIPTION}
                  </span>
                </div>
              </div>

              <EmailTagInput
                id={`dept-to-${department.key}`}
                label="Send to"
                hint="Press Enter after each address. Every recipient sees the others."
                addresses={department.to}
                disabled={disabled}
                onChange={(to) => update(department.key, { to })}
              />
              <EmailTagInput
                id={`dept-cc-${department.key}`}
                label="CC"
                hint="Optional. Copied on every inquiry sent to this department."
                addresses={department.cc}
                disabled={disabled}
                onChange={(cc) => update(department.key, { cc })}
              />
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || departments.length >= MAX_DEPARTMENTS}
          onClick={add}
        >
          <Plus className="mr-2 size-4" /> Add department
        </Button>
        <p className="text-xs text-muted-foreground">
          {departments.length} of {MAX_DEPARTMENTS} departments
        </p>
      </div>
    </div>
  )
}

// Type an address and press Enter (or comma) to add it as a tag. Pasting a
// list splits it; leaving the field adds whatever valid address was typed,
// so a save never silently drops one.
function EmailTagInput({
  id,
  label,
  hint,
  addresses,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint: string
  addresses: string[]
  onChange: (addresses: string[]) => void
  disabled: boolean
}) {
  const [draft, setDraft] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const commit = (raw: string): boolean => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
    if (parts.length === 0) return true
    const invalid = parts.filter((p) => !EMAIL_RE.test(p))
    const seen = new Set(addresses.map((a) => a.toLowerCase()))
    const added: string[] = []
    for (const part of parts) {
      if (!EMAIL_RE.test(part) || seen.has(part.toLowerCase())) continue
      seen.add(part.toLowerCase())
      added.push(part)
    }
    const next = [...addresses, ...added]
    if (next.length > MAX_RECIPIENTS) {
      setError(`At most ${MAX_RECIPIENTS} addresses.`)
      return false
    }
    if (added.length) onChange(next)
    if (invalid.length) {
      setDraft(invalid.join(", "))
      setError(`“${invalid[0]}” isn't a valid email address.`)
      return false
    }
    setDraft("")
    setError(null)
    return true
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div
        className={`flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/50 ${
          error ? "border-destructive" : "border-input"
        } ${disabled ? "opacity-70" : ""}`}
      >
        {addresses.map((address) => (
          <span
            key={address}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs"
          >
            <span className="truncate">{address}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(addresses.filter((a) => a !== address))}
                aria-label={`Remove ${address}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          type="email"
          value={draft}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          placeholder={addresses.length ? "" : "name@example.com"}
          className="min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commit(draft)
            } else if (e.key === "Backspace" && !draft && addresses.length) {
              onChange(addresses.slice(0, -1))
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault()
              commit(`${draft} ${text}`)
            }
          }}
          onBlur={() => commit(draft)}
        />
      </div>
      <p className={`text-[11px] ${error ? "text-destructive" : "text-muted-foreground"}`}>{error ?? hint}</p>
    </div>
  )
}
