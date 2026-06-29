"use client"

// Full-pane empty states shown when there is no hotel to render a page for.
// Two distinct cases, distinguished by `accessState` from useHotel():
//   no-access — the login works but hasn't been granted any hotel. The user
//               can't fix this themselves, so we point them at Resonata.
//   error     — a genuine failure loading hotels; offer a retry.
// Reused by every data-bound page so the messaging stays consistent.

import { AlertCircle, Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"

// Single source of truth for the support contact. Set to a mailto: or an https
// help URL. Set to null to drop the CTA button entirely.
const SUPPORT_CONTACT: { label: string; href: string } | null = {
  label: "Contact Resonata",
  href: "mailto:vince@resonata.io",
}

export function NoHotelAccess() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-base font-medium text-foreground">
          Your account isn&apos;t set up for any hotels yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your login works, but it hasn&apos;t been granted access to a hotel.
          Contact Resonata to have your account configured.
        </p>
        {SUPPORT_CONTACT && (
          <Button asChild variant="outline" size="sm" className="mt-5">
            <a href={SUPPORT_CONTACT.href}>{SUPPORT_CONTACT.label}</a>
          </Button>
        )}
      </div>
    </div>
  )
}

export function HotelLoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-base font-medium text-foreground">
          Couldn&apos;t load your hotels
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong reaching the server. Please try again in a
          moment.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}
