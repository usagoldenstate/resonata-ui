"use client"

import * as React from "react"
import { PhoneNumbersPanel } from "@/components/telephony/phone-numbers-panel"
import { patchSetupProgress } from "@/lib/api"
import { Notice, StepNav, describeApiError, includesReservations, includesSales, type StepContext } from "./shared"

// Reuses the provider-backed control plane. This step never silently writes
// a raw agent-number field or enables sales before routing is prepared.
export function TelephonyStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, linesMode, reload, goNext, goBack, hasBack } = ctx
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const missingReservations = includesReservations(linesMode) && !detail.agent_phone_number
  const missingSales = includesSales(linesMode) && (!detail.sales_agent_phone_number || !detail.sales_line_enabled)
  const finish = async (status: "done" | "skipped") => {
    if (status === "done" && (missingReservations || missingSales)) {
      setError("Connect a number for each selected line, or choose Skip for now.")
      return
    }
    setSaving(true); setError(null)
    try {
      await patchSetupProgress(hotelId, { step: "telephony", status })
      await reload(); goNext()
    } catch (e) { setError(describeApiError(e)) } finally { setSaving(false) }
  }
  return <div className="space-y-6">
    <PhoneNumbersPanel initialHotelId={hotelId} onChanged={reload} />
    {(missingReservations || missingSales) ? <Notice tone="warn">A line without a connected number cannot answer calls. Skipping sales leaves that line unavailable until its number and sales configuration are ready.</Notice> : null}
    <StepNav onBack={goBack} hasBack={hasBack} onNext={() => void finish("done")} onSkip={() => void finish("skipped")} saving={saving} error={error} nextLabel="Continue" />
  </div>
}
