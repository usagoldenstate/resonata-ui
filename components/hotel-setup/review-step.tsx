"use client"

// Step 12 — review and activate. Activation is a platform-settings PATCH;
// the button stays disabled until the server says it can happen, and the
// server re-checks anyway.

import * as React from "react"
import Link from "next/link"
import { PartyPopper, Rocket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { updateHotelPlatformSettings } from "@/lib/api"

import { SetupStatusPanel } from "./setup-status-panel"
import {
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  type StepContext,
} from "./shared"

export function ReviewStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, status, reload, goBack, hasBack, goTo } = ctx
  const [activating, setActivating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [justActivated, setJustActivated] = React.useState(false)

  const activate = async () => {
    setActivating(true)
    setError(null)
    try {
      await updateHotelPlatformSettings(hotelId, { is_active: true })
      await reload()
      setJustActivated(true)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setActivating(false)
    }
  }

  if (detail.is_active) {
    return (
      <div className="space-y-6">
        <StepCard
          title={`${detail.display_name} is live`}
          description="The hotel is active. Anything below can still be revisited."
        >
          <Notice tone="success">
            <span className="inline-flex items-start gap-2">
              <PartyPopper className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {justActivated
                  ? "Activated. Place a test call to the hotel's number before handing it over."
                  : "This hotel is already active."}{" "}
                You can also exercise the agent without telephony using{" "}
                <span className="font-mono">chat.py</span> or the offline simulator.
              </span>
            </span>
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings">
              <Button type="button" variant="outline">
                Open Settings
              </Button>
            </Link>
            <Link href={`/call-log?hotel_id=${encodeURIComponent(hotelId)}`}>
              <Button type="button" variant="outline">
                Open Call Log
              </Button>
            </Link>
          </div>
          <SetupStatusPanel status={status} onEdit={(step) => goTo(step)} />
        </StepCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <StepCard
        title="Review & activate"
        description="Everything the server knows about this hotel's setup. Activation is what starts answering real calls."
      >
        <SetupStatusPanel status={status} onEdit={(step) => goTo(step)} />
        <div className="flex items-center gap-3">
          <Button type="button" onClick={activate} disabled={!status.can_activate || activating}>
            <Rocket className="mr-2 h-4 w-4" />
            {activating ? "Activating…" : "Activate hotel"}
          </Button>
          {!status.can_activate ? (
            <span className="text-xs text-muted-foreground">
              Clear the blockers above first.
            </span>
          ) : null}
        </div>
      </StepCard>
      <StepNav onBack={goBack} hasBack={hasBack} error={error} />
    </div>
  )
}
