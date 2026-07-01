"use client"

import { useState, useRef, useCallback } from "react"
import { Save, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/sidebar"
import { useHotel } from "@/lib/hotel-context"
import { HotelLoadError, NoHotelAccess } from "@/components/hotel-access-state"
import { AgentConfigTab } from "@/components/knowledge-base/agent-config-tab"

export default function AgentConfigPage() {
  const { hotelId, hotels, loading: hotelLoading, accessState, refresh } =
    useHotel()
  const hotel = hotels.find((h) => h.hotel_id === hotelId)

  // Agent Config owns its own form state but delegates save-state and the
  // save trigger up here, so the page-level top Save button can drive it.
  const [configSaveState, setConfigSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [configSaveError, setConfigSaveError] = useState<string | null>(null)
  const [configDirty, setConfigDirty] = useState(false)
  const configSaveRef = useRef<(() => Promise<void>) | null>(null)
  const registerConfigSave = useCallback(
    (fn: (() => Promise<void>) | null) => {
      configSaveRef.current = fn
    },
    [],
  )

  if (hotelLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Loading hotels…
        </div>
      </div>
    )
  }

  if (!hotelId) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        {accessState === "error" ? (
          <HotelLoadError onRetry={refresh} />
        ) : (
          <NoHotelAccess />
        )}
      </div>
    )
  }

  const topSaveDisabled = configSaveState === "saving"
  const showDirty =
    configDirty && configSaveState !== "saving" && configSaveState !== "saved"

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b border-border px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              {hotel?.display_name ?? "Agent Configuration"}
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3">
              {showDirty && (
                <span className="text-xs text-amber-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              {configSaveState === "saved" && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {configSaveState === "error" && (
                <span className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Save failed
                </span>
              )}
              <Button
                onClick={() => configSaveRef.current?.()}
                disabled={topSaveDisabled}
              >
                <Save className="w-4 h-4 mr-2" />
                {configSaveState === "saving" ? "Saving…" : "Save"}
              </Button>
            </div>
            {configSaveState === "error" && configSaveError && (
              <p className="text-xs text-destructive max-w-md text-right leading-relaxed">
                {configSaveError}
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/30">
          <AgentConfigTab
            hotelId={hotelId}
            registerSave={registerConfigSave}
            onStateChange={setConfigSaveState}
            onErrorChange={setConfigSaveError}
            onDirtyChange={setConfigDirty}
          />
        </div>
      </div>
    </div>
  )
}
