"use client"

// The GET /setup read-out for the hotel currently selected on Settings,
// collapsed by default so it never crowds the page. Useful long after
// onboarding: it is what says a live hotel still has no knowledge base or no
// Vapi binding.
//
// The wizard itself lives in the Dev Pages "Hotel Setup" tab, so every link
// out of here is a `?tab=hotel-setup&hotel=…` URL, not a route.

import * as React from "react"
import Link from "next/link"
import { ChevronRight, Stethoscope } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { fetchHotelSetup, type SetupStatus } from "@/lib/api"

import { SetupStatusPanel } from "./setup-status-panel"
import { describeApiError, hotelSetupHref, isAbortError } from "./shared"

export function SetupHealthCard({ hotelId }: { hotelId: string }) {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<SetupStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setError(null)
    fetchHotelSetup(hotelId, { signal: controller.signal })
      .then(setStatus)
      .catch((e) => {
        if (isAbortError(e)) return
        setError(describeApiError(e))
      })
    return () => controller.abort()
  }, [hotelId, open])

  const remaining =
    status?.steps.filter((s) => s.status === "incomplete").length ?? null

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6b7a4a]/10">
            <Stethoscope className="h-5 w-5 text-[#6b7a4a]" />
          </span>
          <span className="flex-1">
            <CardTitle className="text-base">Setup health</CardTitle>
            <CardDescription className="text-xs">
              What this hotel still needs — before or after going live
            </CardDescription>
          </span>
          {remaining !== null && remaining > 0 ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
              {remaining} to do
            </span>
          ) : null}
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4">
          {error ? (
            <p className="rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : status ? (
            <>
              <SetupStatusPanel
                status={status}
                editHref={(step) => hotelSetupHref(hotelId, step)}
              />
              <Link href={hotelSetupHref(hotelId)}>
                <Button variant="outline" size="sm">
                  Open setup
                </Button>
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      ) : null}
    </Card>
  )
}
