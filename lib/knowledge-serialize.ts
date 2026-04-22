// Convert the Knowledge Base UI's in-memory Section[] into the shape the
// backend stores (one HotelKnowledge row per section).
//
// Two payloads per section:
//   - `content` — human-readable text the voice agent sees in its system
//     prompt. Strip per-field metadata (confidence/source) so the LLM isn't
//     reading editor state aloud.
//   - `structured_content` — the raw UI section, persisted verbatim so the
//     editor can re-hydrate with confidence/source/edited flags intact.

type Field = {
  key: string
  label: string
  value: string
  confidence?: string
  source?: string | null
  critical?: boolean
  edited?: boolean
  custom?: boolean
}

type CatalogItem = Record<string, string | null | undefined>

type PoolCard = {
  name: string
  poolType: string
  heated: boolean
  hours: string
  hotTub: boolean
  poolsideService: boolean
  poolBar: boolean
  cabanas: boolean
  cabanaSurcharge: string
  otherInfo: string
}

type VenueCard = { name: string; capacity: string; description: string }

type Section = {
  id: string
  title: string
  fields?: Field[]
  type?: "catalog" | "pool" | "venue"
  itemLabel?: string
  schema?: Array<{ key: string; label: string }>
  items?: CatalogItem[]
  meta?: Field[]
  pools?: PoolCard[]
  venues?: VenueCard[]
}

export type KnowledgeEntry = {
  topic: string
  content: string
  structured_content: unknown
  sort_order: number
}

function renderFields(fields: Field[] | undefined): string[] {
  if (!fields) return []
  const lines: string[] = []
  for (const f of fields) {
    const v = (f.value ?? "").trim()
    if (!v) continue
    lines.push(`${f.label}: ${v}`)
  }
  return lines
}

function renderCatalog(section: Section): string[] {
  const lines: string[] = []
  lines.push(...renderFields(section.meta))
  for (const item of section.items ?? []) {
    const primaryKey = section.schema?.[0]?.key
    const header = primaryKey ? (item[primaryKey] ?? "") : ""
    if (header) lines.push(`- ${header}`)
    for (const col of section.schema ?? []) {
      if (col.key === primaryKey) continue
      const v = item[col.key]
      if (v == null || String(v).trim() === "") continue
      lines.push(`  ${col.label}: ${v}`)
    }
  }
  return lines
}

function renderPool(section: Section): string[] {
  const lines: string[] = []
  for (const p of section.pools ?? []) {
    const header = p.name?.trim() || "Pool"
    lines.push(`- ${header}`)
    if (p.poolType) lines.push(`  Type: ${p.poolType}`)
    if (p.hours) lines.push(`  Hours: ${p.hours}`)
    if (p.heated) lines.push(`  Heated: yes`)
    if (p.hotTub) lines.push(`  Hot tub: yes`)
    if (p.poolsideService) lines.push(`  Poolside service: yes`)
    if (p.poolBar) lines.push(`  Pool bar: yes`)
    if (p.cabanas) {
      const surcharge = p.cabanaSurcharge ? ` (${p.cabanaSurcharge})` : ""
      lines.push(`  Cabanas: yes${surcharge}`)
    }
    if (p.otherInfo) lines.push(`  Notes: ${p.otherInfo}`)
  }
  return lines
}

function renderVenue(section: Section): string[] {
  const lines: string[] = []
  for (const v of section.venues ?? []) {
    const header = v.name?.trim() || "Venue"
    lines.push(`- ${header}`)
    if (v.capacity) lines.push(`  Capacity: ${v.capacity}`)
    if (v.description) lines.push(`  ${v.description}`)
  }
  return lines
}

export function renderSectionContent(section: Section): string {
  let lines: string[]
  switch (section.type) {
    case "catalog":
      lines = renderCatalog(section)
      break
    case "pool":
      lines = renderPool(section)
      break
    case "venue":
      lines = renderVenue(section)
      break
    default:
      lines = renderFields(section.fields)
  }
  if (lines.length === 0) return ""
  return [section.title, ...lines].join("\n")
}

/**
 * Serialize the UI's sections into the backend payload. Skips sections that
 * would render to empty content so the voice agent's system prompt isn't
 * padded with "Section: (empty)" noise. An all-empty Knowledge Base still
 * saves as `[]` which the backend accepts.
 */
export function sectionsToEntries(sections: Section[]): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = []
  sections.forEach((section, idx) => {
    const content = renderSectionContent(section)
    if (!content) return
    entries.push({
      topic: section.id,
      content,
      structured_content: section,
      sort_order: idx,
    })
  })
  return entries
}

/**
 * Re-hydrate the editor's sections from what the backend returned.
 * Uses `structured_content` when present (lossless) and otherwise falls back
 * to a minimal Section so legacy YAML-seeded rows still render something.
 */
export function entriesToSections(
  entries: Array<{
    topic: string
    content: string
    structured_content: unknown
    sort_order: number
  }>,
  fallback: Section[],
): Section[] {
  // Backend rows that carry structured_content take precedence. Any fallback
  // section whose topic isn't in the response is kept (so empty sections the
  // operator hasn't filled yet still appear in the editor).
  const byId = new Map<string, Section>()
  for (const s of fallback) byId.set(s.id, s)
  for (const e of entries) {
    if (e.structured_content && typeof e.structured_content === "object") {
      byId.set(e.topic, e.structured_content as Section)
      continue
    }
    // Legacy / YAML-seeded row — preserve existing UI structure but shove
    // the raw text into a one-field placeholder so operators see what was
    // saved.
    const existing = byId.get(e.topic)
    if (existing) continue
    byId.set(e.topic, {
      id: e.topic,
      title: e.topic,
      fields: [
        {
          key: "content",
          label: "Content",
          value: e.content,
          confidence: "confirmed",
          source: null,
          critical: false,
          edited: false,
        },
      ],
    })
  }
  // Preserve fallback order; append any extra topics the backend returned.
  const out: Section[] = []
  const used = new Set<string>()
  for (const s of fallback) {
    const merged = byId.get(s.id) ?? s
    out.push(merged)
    used.add(s.id)
  }
  for (const e of entries) {
    if (!used.has(e.topic)) {
      const s = byId.get(e.topic)
      if (s) out.push(s)
    }
  }
  return out
}
