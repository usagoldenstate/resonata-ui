"use client"

import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertTriangle, Phone } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { ChatTurn } from "@/lib/reporting-chat"
import { ToolActivityList } from "./tool-activity"

// The model cites calls as [call:<provider_call_id>] (system-prompt contract).
// Rewrite the markers into markdown links before rendering; a half-streamed
// marker just shows as literal text until it completes.
const CITATION_RE = /\[call:([A-Za-z0-9._-]+)\]/g

function withCitationLinks(text: string): string {
  return text.replace(
    CITATION_RE,
    (_match, id: string) => `[view call](/call-log?call_id=${encodeURIComponent(id)})`,
  )
}

function ScanProgress({ scanned, total, matched }: { scanned: number; total: number; matched: number }) {
  const pct = total > 0 ? Math.round((scanned / total) * 100) : 0
  const running = scanned < total
  return (
    <div className="mb-2 rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
      <div className="mb-1.5 flex justify-between">
        <span>{running ? "Scanning transcripts…" : "Transcript scan complete"}</span>
        <span>
          {scanned}/{total} · {matched} matched
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  )
}

export function ChatMessage({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-insights/10 px-4 py-2.5 text-sm whitespace-pre-wrap">
          {turn.text}
        </div>
      </div>
    )
  }

  const showThinkingPlaceholder = turn.status === "streaming" && !turn.text && turn.tools.length === 0

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%]">
        <ToolActivityList tools={turn.tools} />
        {turn.scan && <ScanProgress {...turn.scan} />}
        {showThinkingPlaceholder && (
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <Spinner className="h-3.5 w-3.5" /> Looking at your data…
          </div>
        )}
        {turn.text && (
          <div className="text-sm leading-relaxed">
            {/* No @tailwindcss/typography in this repo — style markdown
                elements explicitly via the components map. */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="my-2">{children}</p>,
                ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
                h1: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
                h2: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
                h3: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
                code: ({ children }) => (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>
                ),
                table: ({ children }) => (
                  <div className="my-2 overflow-x-auto">
                    <table className="w-full border-collapse text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border-b border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                    {children}
                  </th>
                ),
                td: ({ children }) => <td className="border-b border-border/50 px-2 py-1.5">{children}</td>,
                a: ({ href, children }) => {
                  const isCallLink = href?.startsWith("/call-log")
                  return (
                    <Link
                      href={href ?? "#"}
                      className={cn(
                        "text-brand-insights underline underline-offset-2",
                        isCallLink &&
                          "inline-flex items-center gap-0.5 no-underline rounded bg-brand-insights/10 px-1.5 py-0.5 text-xs font-medium hover:bg-brand-insights/20",
                      )}
                    >
                      {isCallLink && <Phone className="h-3 w-3" />}
                      {children}
                    </Link>
                  )
                },
              }}
            >
              {withCitationLinks(turn.text)}
            </ReactMarkdown>
          </div>
        )}
        {turn.status === "error" && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {turn.errorMessage ?? "Response interrupted."}
          </p>
        )}
      </div>
    </div>
  )
}
