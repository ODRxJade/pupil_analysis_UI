"use client"

import { useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const TOKEN = /(#SBATCH[^\n]*)|(#[^\n]*)|(<[A-Z_]+>)|("(?:[^"\\]|\\.)*"|'[^']*')|(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)|\b(if|then|fi|else|for|do|done|set|export|echo|module|source|conda|python|srun|cd|mkdir)\b/g

function highlightLine(line: string, key: number): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(line.slice(last, idx))
    const cls = m[1]
      ? "text-info font-medium"
      : m[2]
        ? "text-muted-foreground italic"
        : m[3]
          ? "rounded-sm bg-warning/25 text-warning-foreground"
          : m[4]
            ? "text-success"
            : m[5]
              ? "text-primary"
              : "text-chart-5 font-medium"
    parts.push(
      <span key={`${key}-${idx}`} className={cls}>
        {m[0]}
      </span>,
    )
    last = idx + m[0].length
  }
  if (last < line.length) parts.push(line.slice(last))
  return parts
}

export function ScriptEditor({
  value,
  onChange,
  readOnly,
  label,
}: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  label: string
}) {
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lines = value.split("\n")

  return (
    <div className={cn("flex overflow-hidden rounded-md border border-border bg-muted/30 font-mono text-xs leading-5", !readOnly && "ring-primary/30 focus-within:ring-2")}>
      <div ref={gutterRef} aria-hidden className="w-10 shrink-0 overflow-hidden border-r border-border bg-muted/60 py-3 pr-2 text-right text-muted-foreground select-none">
        {lines.map((_, k) => (
          <div key={k}>{k + 1}</div>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <pre ref={preRef} aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-3 py-3 whitespace-pre text-foreground">
          {lines.map((l, k) => (
            <div key={k}>{highlightLine(l, k) || " "}</div>
          ))}
        </pre>
        <textarea
          aria-label={label}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={(e) => {
            if (preRef.current) {
              preRef.current.scrollTop = e.currentTarget.scrollTop
              preRef.current.scrollLeft = e.currentTarget.scrollLeft
            }
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          className={cn(
            "relative block h-[520px] w-full resize-none overflow-auto bg-transparent px-3 py-3 whitespace-pre text-transparent caret-foreground outline-none selection:bg-primary/25",
            readOnly && "cursor-default",
          )}
          wrap="off"
        />
      </div>
    </div>
  )
}
