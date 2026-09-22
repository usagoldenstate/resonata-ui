"use client"

// The whole new-hotel setup flow, rendered inside the Dev Pages "Hotel Setup"
// tab. It owns two views:
//   • no `hotel` param — the landing: create a new hotel, or resume one of the
//     inactive ones.
//   • `hotel=<id>`     — the step rail plus the current step.
//
// The hotel being set up comes from the `hotel` QUERY PARAM, never from
// `useHotel()` / the sidebar picker: the picker lists only active hotels the
// caller was granted, and a hotel in setup is by definition neither. Dev
// Pages' own HotelSlugBar keeps showing the picker's hotel — the two are
// deliberately unrelated.
//
// Resumability is the design: every step persists through an ordinary admin
// endpoint, GET /setup reports what landed, and arriving with no `step` jumps
// to the first incomplete step that applies to this hotel.

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  fetchAdminHotels,
  fetchHotelDetail,
  fetchHotelSetup,
  type AdminHotelListItem,
  type HotelDetail,
  type SetupStatus,
} from "@/lib/api"

import { AccessStep } from "./access-step"
import { CatalogStep } from "./catalog-step"
import { DeliveryStep } from "./delivery-step"
import { IdentityCreateForm, IdentityStep } from "./identity-step"
import { KnowledgeStep } from "./knowledge-step"
import { LinesStep } from "./lines-step"
import { PersonaStep } from "./persona-step"
import { PmsStep } from "./pms-step"
import { ReservationFlowStep } from "./reservation-flow-step"
import { ReviewStep } from "./review-step"
import { SalesStep } from "./sales-step"
import { StepRail } from "./step-rail"
import { TelephonyStep } from "./telephony-step"
import {
  STEP_LABELS,
  WIZARD_STEPS,
  describeApiError,
  hotelSetupHref,
  isAbortError,
  isWizardStep,
  linesModeOf,
  type StepContext,
  type WizardStep,
} from "./shared"

export function HotelSetupPanel() {
  const searchParams = useSearchParams()
  const hotelParam = searchParams.get("hotel")

  return (
    <div className="max-w-6xl">
      {hotelParam ? <SetupWizard hotelId={hotelParam} /> : <SetupLanding />}
    </div>
  )
}

// ── Landing ─────────────────────────────────────────────────────────────────

function SetupLanding() {
  const [creating, setCreating] = React.useState(false)

  if (creating) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              New hotel · {STEP_LABELS.identity}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This creates the hotel inactive. Every later step saves as you go, so you
              can stop and come back to it.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
        <div className="max-w-3xl">
          <IdentityCreateForm />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <CardTitle className="text-base">New hotel</CardTitle>
              <CardDescription className="text-xs">
                Twelve short steps from an empty tenant to a hotel answering calls.
              </CardDescription>
            </div>
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New hotel
            </Button>
          </div>
        </CardHeader>
      </Card>
      <HotelsInSetupList />
    </div>
  )
}

function HotelsInSetupList() {
  const [hotels, setHotels] = React.useState<AdminHotelListItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetchAdminHotels({ signal: controller.signal })
      .then(setHotels)
      .catch((e) => {
        if (isAbortError(e)) return
        setError(describeApiError(e))
        setHotels([])
      })
    return () => controller.abort()
  }, [])

  const inactive = (hotels ?? []).filter((h) => !h.is_active)

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Hotels in setup</CardTitle>
        <CardDescription className="text-xs">
          Inactive hotels never appear in the sidebar picker — resume them here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : hotels === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : inactive.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every hotel is active. Start a new one above.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {inactive.map((hotel) => (
              <li key={hotel.hotel_id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{hotel.display_name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {hotel.hotel_id} · {hotel.pms_provider}
                  </span>
                </span>
                <Link href={hotelSetupHref(hotel.hotel_id)}>
                  <Button size="sm" variant="outline">
                    Resume
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ── Wizard ──────────────────────────────────────────────────────────────────

function SetupWizard({ hotelId }: { hotelId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [detail, setDetail] = React.useState<HotelDetail | null>(null)
  const [status, setStatus] = React.useState<SetupStatus | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [nextDetail, nextStatus] = await Promise.all([
          fetchHotelDetail(hotelId, { signal }),
          fetchHotelSetup(hotelId, { signal }),
        ])
        setDetail(nextDetail)
        setStatus(nextStatus)
        setLoadError(null)
      } catch (e) {
        if (isAbortError(e)) return
        setLoadError(describeApiError(e))
      } finally {
        setLoading(false)
      }
    },
    [hotelId],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const linesMode = linesModeOf(status)

  // Steps the backend says apply to this hotel, in wizard order. Review is
  // always last and always present.
  const applicable = React.useMemo<WizardStep[]>(() => {
    if (!status) return ["review"]
    const byKey = new Map(status.steps.map((s) => [s.key, s]))
    return WIZARD_STEPS.filter(
      (step) => step === "review" || byKey.get(step)?.status !== "not_applicable",
    )
  }, [status])

  const firstIncomplete = React.useMemo<WizardStep>(() => {
    if (!status) return "review"
    const byKey = new Map(status.steps.map((s) => [s.key, s]))
    const next = applicable.find(
      (step) => step !== "review" && byKey.get(step)?.status === "incomplete",
    )
    return next ?? "review"
  }, [applicable, status])

  const requested = searchParams.get("step")
  const current: WizardStep =
    isWizardStep(requested) && applicable.includes(requested) ? requested : firstIncomplete

  const goTo = React.useCallback(
    (step: WizardStep) => {
      router.replace(hotelSetupHref(hotelId, step))
      if (typeof window !== "undefined") window.scrollTo({ top: 0 })
    },
    [hotelId, router],
  )

  const index = applicable.indexOf(current)
  const goNext = React.useCallback(() => {
    goTo(applicable[index + 1] ?? "review")
  }, [applicable, goTo, index])
  const goBack = React.useCallback(() => {
    const prev = applicable[index - 1]
    if (prev) goTo(prev)
  }, [applicable, goTo, index])

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (loadError || !detail || !status) {
    return (
      <div className="max-w-xl space-y-3">
        <p className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
          {loadError ?? "Could not load this hotel's setup."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
          <Link href={hotelSetupHref()}>
            <Button variant="ghost">Back to hotel list</Button>
          </Link>
        </div>
      </div>
    )
  }

  const ctx: StepContext = {
    hotelId,
    detail,
    status,
    linesMode,
    reload: () => load(),
    goTo,
    goNext,
    goBack,
    hasBack: index > 0,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Setup · {detail.display_name}
            {detail.is_active ? " · live" : " · not yet active"}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {STEP_LABELS[current]}
          </h2>
        </div>
        <Link href={hotelSetupHref()}>
          <Button variant="ghost">All hotels in setup</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <StepRail status={status} current={current} onSelect={goTo} />
        <div className="min-w-0 max-w-3xl flex-1">
          <StepBody step={current} ctx={ctx} />
        </div>
      </div>
    </div>
  )
}

function StepBody({ step, ctx }: { step: WizardStep; ctx: StepContext }) {
  switch (step) {
    case "identity":
      return <IdentityStep ctx={ctx} />
    case "lines":
      return <LinesStep ctx={ctx} />
    case "pms":
      return <PmsStep ctx={ctx} />
    case "catalog":
      return <CatalogStep ctx={ctx} />
    case "reservation_flow":
      return <ReservationFlowStep ctx={ctx} />
    case "delivery":
      return <DeliveryStep ctx={ctx} />
    case "sales":
      return <SalesStep ctx={ctx} />
    case "persona":
      return <PersonaStep ctx={ctx} />
    case "knowledge":
      return <KnowledgeStep ctx={ctx} />
    case "telephony":
      return <TelephonyStep ctx={ctx} />
    case "access":
      return <AccessStep ctx={ctx} />
    case "review":
      return <ReviewStep ctx={ctx} />
  }
}
