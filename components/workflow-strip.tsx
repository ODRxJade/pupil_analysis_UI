"use client"

import Link from "next/link"
import { CheckIcon, ChevronRightIcon, CircleDashedIcon, LoaderIcon, LockIcon, XIcon } from "lucide-react"
import { StatusBadge, stepTone } from "@/components/status-badge"
import { useWorkspace } from "@/components/workspace-provider"
import { sessionWorkflow } from "@/lib/workflow"
import type { StepState } from "@/lib/types"
import { cn } from "@/lib/utils"

const ICONS: Record<StepState, typeof CheckIcon> = {
  complete: CheckIcon,
  running: LoaderIcon,
  failed: XIcon,
  ready: CircleDashedIcon,
  awaiting: CircleDashedIcon,
  blocked: LockIcon,
}

const LABEL: Record<StepState, string> = {
  complete: "Complete",
  running: "Running",
  failed: "Failed",
  ready: "Ready",
  awaiting: "Awaiting input",
  blocked: "Blocked",
}

export function WorkflowStrip() {
  const { session, job, analysis, experiment } = useWorkspace()
  if (!session) return null
  const steps = sessionWorkflow(session, job, analysis)
  return (
    <section aria-label="Session workflow" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Workflow <span className="font-normal text-muted-foreground">· {experiment?.name} / {session.label}</span>
        </h2>
      </div>
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {steps.map((s, k) => {
          const Icon = ICONS[s.state]
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <Link
                href={s.href}
                className={cn(
                  "flex flex-1 items-start gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/60",
                  s.state === "running" && "border-info/40 bg-info/5",
                  s.state === "failed" && "border-destructive/40 bg-destructive/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    s.state === "complete" && "bg-success text-primary-foreground",
                    s.state === "running" && "bg-info text-primary-foreground",
                    s.state === "failed" && "bg-destructive text-primary-foreground",
                    (s.state === "ready" || s.state === "awaiting") && "bg-primary/10 text-primary",
                    s.state === "blocked" && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className={cn("size-3.5", s.state === "running" && "animate-spin")} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium">{s.label}</span>
                  <StatusBadge tone={stepTone(s.state)} className="w-fit">
                    {LABEL[s.state]}
                  </StatusBadge>
                  <span className="truncate text-xs text-muted-foreground">{s.detail}</span>
                </span>
              </Link>
              {k < steps.length - 1 && <ChevronRightIcon className="hidden size-4 shrink-0 text-muted-foreground lg:block" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
