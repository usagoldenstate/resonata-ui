"use client"

import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

// One of these per data-bound page, in the header. Pages fetch through SWR
// (see lib/swr-config.tsx), which already revalidates on window focus and
// caches across navigations — this button covers the remaining case: "a call
// just happened, show me now" without waiting for a focus event.
export function RefreshButton({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void
  refreshing: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={refreshing}
      className="gap-1.5 border-border"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      Refresh
    </Button>
  )
}
