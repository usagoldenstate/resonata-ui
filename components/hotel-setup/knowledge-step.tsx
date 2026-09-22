"use client"

// Step 9 — the knowledge base. Never blocks activation: with nothing loaded
// the agent simply transfers general questions to staff.

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchHotelKnowledge,
  patchSetupProgress,
  replaceHotelKnowledge,
  type HotelKnowledgeEntry,
} from "@/lib/api"
import { sectionsToEntries } from "@/lib/knowledge-serialize"
import { researchProperty, type ResearchSection } from "@/lib/research"
import { defaultSections } from "@/components/knowledge-base/knowledge-base-tab"

import {
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  isAbortError,
  type StepContext,
} from "./shared"

function filledFieldCount(sections: ResearchSection[]): number {
  return sections.reduce(
    (n, s) => n + (s.fields ?? []).filter((f) => f.value?.trim()).length,
    0,
  )
}

export function KnowledgeStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext, goBack, hasBack } = ctx
  const [query, setQuery] = React.useState("")
  const [researching, setResearching] = React.useState(false)
  const [draft, setDraft] = React.useState<ResearchSection[] | null>(null)
  const [existing, setExisting] = React.useState<HotelKnowledgeEntry[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetchHotelKnowledge(hotelId, { signal: controller.signal })
      .then(setExisting)
      .catch((e) => {
        if (isAbortError(e)) return
        setExisting([])
      })
    return () => controller.abort()
  }, [hotelId])

  const research = async () => {
    if (!query.trim()) {
      setError("Enter the property's website or its name and city.")
      return
    }
    setResearching(true)
    setError(null)
    try {
      const fresh = await researchProperty(
        hotelId,
        query.trim(),
        defaultSections() as unknown as ResearchSection[],
      )
      setDraft(fresh.sections)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setResearching(false)
    }
  }

  const saveDraft = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      // The serializer's Section type is structurally identical but not
      // exported; cast rather than duplicate the definition (same as the
      // Knowledge Base page does).
      const entries = sectionsToEntries(
        draft as unknown as Parameters<typeof sectionsToEntries>[0],
      )
      await replaceHotelKnowledge(hotelId, entries)
      await patchSetupProgress(hotelId, { step: "knowledge", status: "done" })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const mark = async (status: "done" | "skipped") => {
    setSaving(true)
    setError(null)
    try {
      await patchSetupProgress(hotelId, { step: "knowledge", status })
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
        title="Research from the property's website"
        description="One LLM web-search pass fills the knowledge sections — check-in times, amenities, policies, parking. It takes up to a minute."
      >
        <Field label="Website or property name" htmlFor="researchQuery">
          <div className="flex gap-2">
            <Input
              id="researchQuery"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="https://anchoragebythesea.com"
            />
            <Button type="button" onClick={research} disabled={researching}>
              {researching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {researching ? "Researching…" : "Research"}
            </Button>
          </div>
        </Field>

        {draft ? (
          <div className="space-y-3">
            <Notice tone="success">
              {draft.length} sections drafted, {filledFieldCount(draft)} fields filled.
              Everything is reviewable and editable on the Knowledge Base page afterwards.
            </Notice>
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {draft.map((s) => (
                <li key={s.id}>
                  <span className="text-foreground">{s.title}</span>{" "}
                  <span>
                    ({(s.fields ?? []).filter((f) => f.value?.trim()).length} filled)
                  </span>
                </li>
              ))}
            </ul>
            {existing && existing.length > 0 ? (
              <Notice tone="warn">
                This hotel already has {existing.length} saved knowledge{" "}
                {existing.length === 1 ? "entry" : "entries"}. Saving replaces them.
              </Notice>
            ) : null}
            <Button type="button" onClick={saveDraft} disabled={saving}>
              {saving ? "Saving…" : "Save to knowledge base"}
            </Button>
          </div>
        ) : null}
      </StepCard>

      <StepCard title="Or add it by hand later">
        <p className="text-xs leading-relaxed text-muted-foreground">
          The Knowledge Base page has the full editor. It works against the hotel selected
          in the sidebar, so it can only open this hotel once the hotel is active and
          granted to you.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/knowledge-base" target="_blank" rel="noreferrer noopener">
            <Button type="button" variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Knowledge Base
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={() => mark("done")}
            disabled={saving}
          >
            Mark as done
          </Button>
        </div>
        <Notice>
          Knowledge never blocks activation. Until it is added, the agent transfers general
          questions to staff instead of answering them.
        </Notice>
      </StepCard>

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onSkip={() => mark("skipped")}
        saving={saving}
        error={error}
        skipLabel="Skip for now"
      />
      <p className="text-[11px] text-muted-foreground">
        {detail.display_name} — knowledge can be filled in at any point after launch.
      </p>
    </div>
  )
}
