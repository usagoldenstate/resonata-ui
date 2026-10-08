"use client"

// A list edited as removable tags: type a value and press Enter (or comma) to
// add it, click × or Backspace to remove one. Pasting a list splits it, and
// leaving the field adds whatever valid value was typed, so a save never
// silently drops one. Used for department recipients, the sales team roster
// and the hotel's own phone numbers.

import * as React from "react"
import { X } from "lucide-react"

import { Label } from "@/components/ui/label"

export function TagInput({
  id,
  label,
  hint,
  values,
  onChange,
  disabled = false,
  placeholder,
  max,
  noun = "items",
  separators = /[,;\n]+/,
  validate,
  inputType = "text",
}: {
  id: string
  label: string
  hint: string
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  placeholder?: string
  max?: number
  // Plural, for the "At most N …" message.
  noun?: string
  // What splits a pasted or typed list. Names and phone numbers contain
  // spaces, so only commas, semicolons and newlines split by default.
  separators?: RegExp
  // An error message for an invalid value, or null when it is fine.
  validate?: (value: string) => string | null
  inputType?: "text" | "email" | "tel"
}) {
  const [draft, setDraft] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const commit = (raw: string): boolean => {
    const parts = raw.split(separators).map((p) => p.trim()).filter(Boolean)
    if (parts.length === 0) return true
    const problems = parts.map((p) => validate?.(p) ?? null)
    const invalid = parts.filter((_, i) => problems[i])
    const seen = new Set(values.map((v) => v.toLowerCase()))
    const added: string[] = []
    parts.forEach((part, i) => {
      if (problems[i] || seen.has(part.toLowerCase())) return
      seen.add(part.toLowerCase())
      added.push(part)
    })
    const next = [...values, ...added]
    if (max !== undefined && next.length > max) {
      setError(`At most ${max} ${noun}.`)
      return false
    }
    if (added.length) onChange(next)
    if (invalid.length) {
      setDraft(invalid.join(", "))
      setError(problems.find(Boolean) ?? null)
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
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs"
          >
            <span className="truncate">{value}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          type={inputType}
          value={draft}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commit(draft)
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (separators.test(text.trim())) {
              e.preventDefault()
              commit(`${draft}\n${text}`)
            }
          }}
          onBlur={() => commit(draft)}
        />
      </div>
      <p className={`text-[11px] ${error ? "text-destructive" : "text-muted-foreground"}`}>{error ?? hint}</p>
    </div>
  )
}
