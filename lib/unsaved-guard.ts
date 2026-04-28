// Cross-component guard for unsaved edits. Mounted components register a
// getter that returns a confirmation message when they hold dirty state, or
// null when they're clean. Navigation entry points (sidebar links, hotel
// selector) call `confirmDiscardUnsaved()` before changing route/hotel and
// bail out on cancel. The first non-null message wins.

type GuardGetter = () => string | null

const getters = new Set<GuardGetter>()

export function registerUnsavedGuard(fn: GuardGetter): () => void {
  getters.add(fn)
  return () => {
    getters.delete(fn)
  }
}

export function getUnsavedMessage(): string | null {
  for (const fn of getters) {
    const msg = fn()
    if (msg) return msg
  }
  return null
}

export function confirmDiscardUnsaved(): boolean {
  const msg = getUnsavedMessage()
  if (!msg) return true
  return typeof window !== "undefined" ? window.confirm(msg) : true
}
