"use client"

// Platform-admin Download / Upload of a hotel's sales script as a JSON file, for
// moving a script between hotels or deployments. Download saves the script as it
// is on screen (unsaved edits included). Upload loads a file into the builder as an
// unsaved, undoable draft — nothing goes live until Save script, which the server
// validates exactly like a hand-built script.

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
import type { SalesGraphFlow } from "@/lib/api"
import { readSalesScriptFile, salesScriptFile, validateGraph, type SalesScriptFile } from "@/lib/sales-flow"

export function SalesFlowTransferButtons({
  hotelId,
  hotelName,
  flow,
  hasUnsavedChanges,
  disabled,
  onLoad,
}: {
  hotelId: string
  hotelName: string
  flow: SalesGraphFlow
  hasUnsavedChanges: boolean
  disabled: boolean
  onLoad: (flow: SalesGraphFlow) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<SalesScriptFile | null>(null)

  const handleDownload = () => {
    const file = salesScriptFile(flow, {
      hotel_id: hotelId,
      display_name: hotelName,
      deployment: typeof window === "undefined" ? null : window.location.host,
    })
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sales-script-${hotelId}-${file.exported_at.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(
      hasUnsavedChanges
        ? "Downloaded the script as shown, including your unsaved changes."
        : `Downloaded the script (${flow.nodes.length} questions).`,
    )
  }

  const handleFile = async (file: File) => {
    const result = readSalesScriptFile(await file.text())
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    setPending(result.file)
  }

  const problems = pending ? validateGraph(pending.flow) : []
  const source = pending?.source
  const sourceLabel = source
    ? `${source.display_name ?? source.hotel_id}${source.deployment ? ` (${source.deployment})` : ""}`
    : ""

  return (
    <>
      <Button
        variant="outline"
        onClick={handleDownload}
        disabled={disabled}
        title="Platform admin: download this script as a file"
      >
        <Download className="mr-2 size-4" /> Download
      </Button>
      <Button
        variant="outline"
        onClick={() => fileInput.current?.click()}
        disabled={disabled}
        title="Platform admin: load a downloaded script into this builder"
      >
        <Upload className="mr-2 size-4" /> Upload
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

      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load this script into the builder?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  The {pending?.flow.nodes.length ?? 0} questions in the file replace the draft for{" "}
                  <span className="font-medium text-foreground">{hotelName}</span>. Nothing goes live until
                  you click <span className="font-medium text-foreground">Save script</span>, and you can undo it.
                </p>
                <p>
                  File from <span className="font-medium text-foreground">{sourceLabel}</span>
                  {pending?.exported_at && `, downloaded ${new Date(pending.exported_at).toLocaleString()}`}.
                </p>
                {source && source.hotel_id !== hotelId && (
                  <p className="text-amber-600">The file came from a different hotel ({source.hotel_id}).</p>
                )}
                {hasUnsavedChanges && (
                  <p className="text-amber-600">Your unsaved edits will be replaced (Undo brings them back).</p>
                )}
                {problems.length > 0 && (
                  <div className="text-amber-600">
                    <p>This script needs fixing before it can be saved:</p>
                    <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onLoad(pending.flow)
                setPending(null)
                toast.success("Script loaded as a draft. Review it, then click Save script.")
              }}
            >
              Load as draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
