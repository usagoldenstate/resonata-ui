import { useEffect, useState } from "react"

// Holds the last value that stayed unchanged for `delayMs`. Used to derive SWR
// keys from fast-changing inputs (date pickers, text search) so keystrokes
// don't each trigger a fetch — only the settled value does.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
