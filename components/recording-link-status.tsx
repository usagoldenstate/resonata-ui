// Says when the "Listen to recording" link one sales email carried stops
// working: anyone who holds it can play the call without signing in. Renders
// nothing when the email had no link.

import type { SalesInquiryDetail } from "@/lib/api"

function expiryDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: timezone }).format(new Date(value))
}

export function RecordingLinkStatus({ row, timezone }: { row: SalesInquiryDetail; timezone: string }) {
  const status = row.recording_link_status
  if (!status || !row.recording_link_expires_at) return null
  const expires = expiryDate(row.recording_link_expires_at, timezone)
  const message = {
    active: `The email's recording link works without sign-in until ${expires}.`,
    expired: `The email's recording link expired on ${expires}.`,
  }[status]

  return (
    <div className="border-t px-5 py-3.5">
      <p className="text-xs leading-relaxed text-muted-foreground">{message}</p>
    </div>
  )
}
