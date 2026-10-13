'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Drop-in replacement for a native <select>: renders the branded Radix
// listbox instead of the OS menu. Radix forbids "" as an item value, so an
// empty-string option (the usual "All …" / "Unassigned" choice) is mapped to
// a sentinel internally — callers keep using "" as before.

export type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean }
export type SelectOptionGroup = { label: string; options: SelectOption[] }

const EMPTY = '__option_select_empty__'
const toRadix = (v: string) => (v === '' ? EMPTY : v)
const fromRadix = (v: string) => (v === EMPTY ? '' : v)

export function OptionSelect({
  id,
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder,
  disabled,
  className,
  contentClassName,
  size,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  /** Ungrouped options. Rendered after any `groups`. */
  options?: SelectOption[]
  groups?: SelectOptionGroup[]
  placeholder?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  size?: 'sm' | 'default'
  'aria-label'?: string
}) {
  const known = [...groups.flatMap((g) => g.options), ...options].some((o) => o.value === value)
  // A native <select> tolerates repeated values (e.g. the same department id
  // across a portfolio's hotels); Radix does not, so only the first renders.
  const seen = new Set<string>()
  const renderItem = (o: SelectOption) => {
    if (seen.has(o.value)) return null
    seen.add(o.value)
    return (
      <SelectItem key={o.value} value={toRadix(o.value)} disabled={o.disabled}>
        {o.label}
      </SelectItem>
    )
  }
  return (
    <Select
      value={known ? toRadix(value) : undefined}
      onValueChange={(v) => onValueChange(fromRadix(v))}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {groups.map((g, i) => (
          <React.Fragment key={g.label}>
            {i > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>{g.label}</SelectLabel>
              {g.options.map(renderItem)}
            </SelectGroup>
          </React.Fragment>
        ))}
        {groups.length > 0 && options.length > 0 && <SelectSeparator />}
        {options.map(renderItem)}
      </SelectContent>
    </Select>
  )
}
