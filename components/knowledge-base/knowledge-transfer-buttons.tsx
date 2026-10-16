"use client"

// Platform-admin Export / Import of a hotel's whole knowledge base as a JSON
// file, for moving a hotel between deployments. The file is the backend's
// KnowledgeExport (GET /knowledge/export); Import POSTs it back verbatim to
// /knowledge/import, which replaces the hotel's KB in one transaction. Only
// format/version are pre-checked here, for a friendly preview — the backend
// is the real validator.

import { useRef, useState } from "react"
import { Download, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { api, ApiError } from "@/lib/api"

const EXPORT_FORMAT = "resonata.knowledge_base"
const EXPORT_VERSION = 1

type KnowledgeExport = {
  format: string
  format_version: number
  exported_at: string
  source: { hotel_id: string; display_name: string | null; environment: string | null }
  entries: unknown[]
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const detail = (e.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d))
        .join("; ")
    }
    return `${e.status} ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

export function KnowledgeTransferButtons({
  hotelId,
  hotelName,
  hasUnsavedChanges,
  disabled,
  onImported,
}: {
  hotelId: string
  hotelName: string | undefined
  hasUnsavedChanges: boolean
  disabled: boolean
  onImported: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pending, setPending] = useState<KnowledgeExport | null>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      const file = await api<KnowledgeExport>(
        `/api/v1/admin/hotels/${hotelId}/knowledge/export`,
      )
      const blob = new Blob([JSON.stringify(file, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `knowledge-base-${hotelId}-${file.exported_at.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(
        hasUnsavedChanges
          ? "Exported the last saved version. Your unsaved changes are not in the file."
          : `Exported ${file.entries.length} sections.`,
      )
    } catch (e) {
      toast.error(`Export failed: ${errorText(e)}`)
    } finally {
      setExporting(false)
    }
  }

  const handleFile = async (file: File) => {
    let parsed: KnowledgeExport
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast.error("That file isn't valid JSON.")
      return
    }
    if (parsed?.format !== EXPORT_FORMAT || !Array.isArray(parsed.entries)) {
      toast.error("That file isn't a Resonata knowledge base export.")
      return
    }
    if (parsed.format_version !== EXPORT_VERSION) {
      toast.error(
        `This file is export version ${parsed.format_version}; this deployment reads version ${EXPORT_VERSION}.`,
      )
      return
    }
    setPending(parsed)
  }

  const confirmImport = async () => {
    if (!pending) return
    setImporting(true)
    try {
      const entries = await api<unknown[]>(
        `/api/v1/admin/hotels/${hotelId}/knowledge/import`,
        { method: "POST", body: pending },
      )
      toast.success(`Imported ${entries.length} sections.`)
      setPending(null)
      onImported()
    } catch (e) {
      toast.error(`Import failed: ${errorText(e)}`)
    } finally {
      setImporting(false)
    }
  }

  const source = pending?.source
  const sourceLabel = source
    ? `${source.display_name ?? source.hotel_id}${source.environment ? ` (${source.environment})` : ""}`
    : ""

  return (
    <>
      <Button
        variant="outline"
        onClick={handleExport}
        disabled={disabled || exporting}
        title="Platform admin: download this knowledge base as a file"
      >
        <Download className="w-4 h-4 mr-2" />
        {exporting ? "Exporting…" : "Export"}
      </Button>
      <Button
        variant="outline"
        onClick={() => fileInput.current?.click()}
        disabled={disabled || importing}
        title="Platform admin: replace this knowledge base from an exported file"
      >
        <Upload className="w-4 h-4 mr-2" />
        Import
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset so picking the same file again still fires onChange.
          e.target.value = ""
          if (file) void handleFile(file)
        }}
      />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !importing) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this knowledge base?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This replaces every section of{" "}
                  <span className="font-medium text-foreground">{hotelName ?? hotelId}</span>{" "}
                  with the {pending?.entries.length ?? 0} sections in the file. This can't be undone.
                </p>
                <p>
                  File from <span className="font-medium text-foreground">{sourceLabel}</span>
                  {pending?.exported_at &&
                    `, exported ${new Date(pending.exported_at).toLocaleString()}`}
                  .
                </p>
                {source && source.hotel_id !== hotelId && (
                  <p className="text-amber-600">
                    The file came from a hotel with a different ID ({source.hotel_id}).
                  </p>
                )}
                {hasUnsavedChanges && (
                  <p className="text-amber-600">Your unsaved changes on this page will be lost.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={importing}
              onClick={(e) => {
                // Keep the dialog open until the request settles.
                e.preventDefault()
                void confirmImport()
              }}
            >
              {importing ? "Importing…" : "Replace knowledge base"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
