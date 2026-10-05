"use client"

import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SalesIntakeQuestionInput } from "@/lib/api"

export type QuestionDraft = SalesIntakeQuestionInput & { key: string }

// Client keys keep focus stable when reordering. Only server-issued IDs go back.
export function questionPayload(questions: QuestionDraft[]): SalesIntakeQuestionInput[] {
  return questions.map(({ id, text }) => ({ ...(id ? { id } : {}), text }))
}

export function SalesQuestionsEditor({ questions, onChange }: {
  questions: QuestionDraft[]
  onChange: (questions: QuestionDraft[]) => void
}) {
  function move(index: number, direction: -1 | 1) {
    const next = [...questions]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-primary" /> Intake Questions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add the questions you want your sales agent to ask before collecting contact details.
          The agent adds a natural acknowledgment before each question.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.length === 0 && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-sm font-medium">What else should sales know?</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first question. The standard intake questions still apply.</p>
          </div>
        )}
        <ol className="space-y-3">
          {questions.map((question, index) => {
            const length = [...question.text.replace(/\s+/g, " ").trim()].length
            const duplicate = questions.some((other, i) => i !== index && other.text.replace(/\s+/g, " ").trim().toLowerCase() === question.text.replace(/\s+/g, " ").trim().toLowerCase())
            const error = length > 200 ? "Shorten this question to 200 characters." : duplicate && length > 0 ? "This question is already in your list." : null
            return (
              <li key={question.key} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`question-${question.key}`} className="text-sm font-medium">Question {index + 1}</label>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={index === questions.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove question ${index + 1}`} onClick={() => onChange(questions.filter((_, i) => i !== index))}><Trash2 className="size-4 text-muted-foreground" /></Button>
                  </div>
                </div>
                <textarea id={`question-${question.key}`} rows={2} value={question.text}
                  aria-invalid={Boolean(error)} aria-describedby={`question-help-${question.key}`}
                  placeholder="e.g. Will you need audiovisual equipment?"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  onChange={event => onChange(questions.map((q, i) => i === index ? { ...q, text: event.target.value } : q))} />
                <div id={`question-help-${question.key}`} className="flex justify-between gap-2 text-xs">
                  <span className={error ? "text-destructive" : "text-muted-foreground"}>{error ?? "One question at a time, in your own words."}</span>
                  <span className={length > 200 ? "text-destructive shrink-0" : "text-muted-foreground shrink-0"}>{length}/200</span>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={questions.length >= 5}
            onClick={() => onChange([...questions, { key: crypto.randomUUID(), text: "" }])}>
            <Plus className="mr-2 size-4" /> Add question
          </Button>
          <p className="text-xs text-muted-foreground" aria-live="polite">{questions.length} of 5 questions · Use Save to apply changes</p>
        </div>
      </CardContent>
    </Card>
  )
}
