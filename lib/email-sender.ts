// The backend stores the sender as a single RFC 5322 string ("Name <addr>" or
// a bare address). The UI splits it into two fields on load and recomposes on
// save so operators never see raw angle-bracket syntax.
export function splitEmailFrom(value: string | null | undefined): {
  name: string
  email: string
} {
  const v = (value ?? "").trim()
  if (!v) return { name: "", email: "" }
  const m = v.match(/^(.*?)<([^>]+)>\s*$/)
  if (!m) return { name: "", email: v } // bare address, no display name
  let name = m[1].trim()
  // Unwrap a quoted display name, e.g. "Smith, John" <...>.
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\(["\\])/g, "$1")
  }
  return { name, email: m[2].trim() }
}

export function composeEmailFrom(name: string, email: string): string | null {
  const e = email.trim()
  if (!e) return null // no address → clear the sender entirely
  const n = name.trim()
  if (!n) return e
  // RFC 5322 requires quoting display names that contain specials.
  const display = /[(),:;<>@[\]\\"]/.test(n)
    ? `"${n.replace(/(["\\])/g, "\\$1")}"`
    : n
  return `${display} <${e}>`
}
