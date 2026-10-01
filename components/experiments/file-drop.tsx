"use client"

import { useRef, useState } from "react"
import { UploadIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function FileDrop({
  accept,
  multiple,
  label,
  hint,
  onFiles,
}: {
  accept: string
  multiple?: boolean
  label: string
  hint: string
  onFiles: (files: { name: string; size: number }[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = (list: FileList | null) => {
    if (!list?.length) return
    onFiles(Array.from(list).map((f) => ({ name: f.name, size: f.size })))
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        handle(e.dataTransfer.files)
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors",
        over && "border-primary bg-primary/5",
      )}
    >
      <UploadIcon className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
