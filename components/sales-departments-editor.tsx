"use client"

// Sales departments: where the sales intake emails each inquiry.
//
// The agent reads every department's name and description to decide where an
// inquiry goes; anything that doesn't clearly fit lands on the one catch-all.
// A hotel with a single department never asks the agent to choose. Shared by
// Settings → Sales and the setup wizard's Sales step, which own saving.

import * as React from "react"
import { Inbox, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TagInput } from "@/components/tag-input"
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

// Recipient addresses as removable tags. Emails never contain spaces, so
// whitespace splits a pasted list as well as commas and semicolons.
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
  return (
    <TagInput
      id={id}
      label={label}
      hint={hint}
      values={addresses}
      onChange={onChange}
      disabled={disabled}
      placeholder="name@example.com"
      max={MAX_RECIPIENTS}
      noun="addresses"
      separators={/[\s,;]+/}
      inputType="email"
      validate={(value) => (EMAIL_RE.test(value) ? null : `“${value}” isn't a valid email address.`)}
    />
  )
}
