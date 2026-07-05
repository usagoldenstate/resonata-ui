"use client"

import { useRef, useState } from "react"
import { ArrowUp, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const MAX_MESSAGE_CHARS = 4000 // mirrors the backend ChatRequest limit

export function ChatInput({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const text = value.trim()
    if (!text || disabled || streaming) return
    setValue("")
    onSend(text)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value.slice(0, MAX_MESSAGE_CHARS))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder="Ask about your calls — “Why didn’t people book last month?”"
        rows={1}
        disabled={disabled}
        className="max-h-40 min-h-[40px] flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
      />
      {streaming ? (
        <Button size="icon" variant="outline" onClick={onStop} title="Stop">
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button size="icon" onClick={submit} disabled={disabled || !value.trim()} title="Send">
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
