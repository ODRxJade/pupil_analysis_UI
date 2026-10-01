"use client"

import { LoaderIcon } from "lucide-react"
import { StatusBadge, type Tone } from "@/components/status-badge"
import { STAGES, type StageStatus, type StageStatusInfo } from "@/lib/stages"
import type { StageId } from "@/lib/types"
import { cn } from "@/lib/utils"

export const STAGE_STATUS: Record<StageStatus, { tone: Tone; label: string }> = {
  blocked: { tone: "neutral", label: "Blocked" },
  ready: { tone: "primary", label: "Ready" },
  complete: { tone: "success", label: "Complete" },
  outdated: { tone: "warning", label: "Outdated" },
  modified: { tone: "warning", label: "Modified" },
  failed: { tone: "danger", label: "Failed" },
}

export function StageRail({
  statuses,
  active,
  running,
  onSelect,
}: {
  statuses: Record<StageId, StageStatusInfo>
  active: StageId
  running: StageId | null
  onSelect: (id: StageId) => void
}) {
  return (
    <nav aria-label="Analysis stages" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {STAGES.map((s) => {
        const st = statuses[s.id]
        const meta = STAGE_STATUS[st.status]
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            aria-current={active === s.id ? "step" : undefined}
            title={st.reason ?? undefined}
            className={cn(
              "flex min-w-48 shrink-0 items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors lg:min-w-0",
              active === s.id ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded font-mono text-xs font-semibold",
                st.status === "complete" ? "bg-success/15 text-success" : active === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {running === s.id ? <LoaderIcon className="size-3.5 animate-spin" aria-label="Running" /> : s.letter}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm leading-tight font-medium">{s.title}</span>
              <StatusBadge tone={meta.tone}>{running === s.id ? "Running" : meta.label}</StatusBadge>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
