"use client"

// Manages the "Listen to recording" link one sales email carried: anyone who
// holds it can play the call without signing in, so staff can switch it off
// here if it reached the wrong person. Renders nothing when the email had no
// link.

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { setSalesRecordingLinkDisabled, type SalesInquiryDetail } from "@/lib/api"

function expiryDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: timezone }).format(new Date(value))
}

export function RecordingLinkControl({ row, timezone, onChanged }: {
  row: SalesInquiryDetail
  timezone: string
  onChanged: (updated: SalesInquiryDetail) => void
}) {
  const [saving, setSaving] = useState(false)
  const status = row.recording_link_status
  if (!status || !row.recording_link_expires_at) return null
  const expires = expiryDate(row.recording_link_expires_at, timezone)
  const message = {
    active: `The email's recording link works without sign-in until ${expires}.`,
    disabled: "The email's recording link is disabled and will not play.",
    expired: `The email's recording link expired on ${expires}.`,
  }[status]

  async function setDisabled(disabled: boolean) {
    setSaving(true)
    try {
      onChanged(await setSalesRecordingLinkDisabled(row.hotel_id, row.id, disabled))
    } catch {
      toast.error("Could not update the recording link", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5">
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">{message}</p>
      {status !== "expired" && (
        <Button variant="outline" size="sm" disabled={saving} onClick={() => void setDisabled(status === "active")}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {status === "active" ? "Disable link" : "Turn back on"}
        </Button>
      )}
    </div>
  )
}
