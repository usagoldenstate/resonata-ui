import type { SalesInquiryCustomAnswer } from "@/lib/api"

export function SalesCustomAnswers({ answers, className = "" }: {
  answers?: SalesInquiryCustomAnswer[]
  className?: string
}) {
  if (!answers?.length) return null
  return (
    <section className={`rounded-lg border bg-muted/20 p-4 ${className}`} aria-label="Intake answers">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intake answers</h3>
      <dl className="space-y-4">
        {answers.map((entry, index) => (
          <div key={`${entry.question_id}-${index}`} className="space-y-1">
            <dt className="text-sm font-medium whitespace-pre-wrap break-words">{entry.question || "Additional question"}</dt>
            <dd className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
