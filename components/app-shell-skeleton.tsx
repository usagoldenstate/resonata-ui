"use client"

import { Skeleton } from "@/components/ui/skeleton"

// Static placeholder for the authenticated shell, shown while Clerk's JS is
// still loading and the real providers (hotel list, current user) haven't
// mounted yet. Rendering this instead of `null` means a hard load / refresh
// shows the app's structure — sidebar rail on the left, content column on the
// right — instead of a blank white screen. It deliberately depends on no
// context/hooks so it can render before any provider exists, and it mirrors the
// real layout's outer container (`min-h-screen bg-background flex`) and sidebar
// width (`w-52`) so the transition to the live UI doesn't shift.
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background flex" aria-busy="true" aria-label="Loading">
      <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="px-5 pt-6 pb-3">
          <img src="/images/logo.png" alt="Resonata" className="h-7 w-auto" />
        </div>

        <div className="px-4 pb-4">
          <Skeleton className="mb-1.5 h-2.5 w-10" />
          <Skeleton className="h-8 w-full" />
        </div>

        <div className="flex-1 space-y-6 px-4 py-2">
          {[6, 3].map((count, section) => (
            <div key={section} className="space-y-1.5">
              <Skeleton className="mb-2 h-2.5 w-14" />
              {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 p-8">
        <div className="mb-8 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </main>
    </div>
  )
}
