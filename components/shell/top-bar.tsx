"use client"

import { FlaskConicalIcon, UserIcon } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge, stepTone } from "@/components/status-badge"
import { useWorkspace } from "@/components/workspace-provider"
import { useSettings } from "@/hooks/use-data"
import { sessionWorkflow } from "@/lib/workflow"

export function TopBar() {
  const { experiments, sessions, session, experiment, job, analysis, sessionId, setSessionId } = useWorkspace()
  const { data: settings } = useSettings()
  const steps = session ? sessionWorkflow(session, job, analysis) : []
  const current = steps.find((s) => s.state !== "complete") ?? steps[steps.length - 1]

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      <div className="flex min-w-0 items-center gap-2">
        <FlaskConicalIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Active session</span>
        <Select value={sessionId} onValueChange={(v) => v && setSessionId(v as string)}>
          <SelectTrigger className="h-8 min-w-64 max-w-md" aria-label="Select experiment and session">
            <SelectValue>
              {experiment && session ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{experiment.name}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-mono text-xs">{session.label}</span>
                </span>
              ) : (
                "Select session"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-80">
            {experiments.map((e) => (
              <SelectGroup key={e.id}>
                <SelectLabel>{e.name}</SelectLabel>
                {sessions
                  .filter((s) => s.experimentId === e.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-mono text-xs">{s.label}</span>
                      <span className="text-muted-foreground">{s.recordingDate}</span>
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {current && (
        <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
          <span>Status</span>
          <StatusBadge tone={stepTone(current.state)} pulse={current.state === "running"}>
            {current.label}: {current.detail}
          </StatusBadge>
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        <span
          className="inline-flex h-6 items-center gap-1.5 rounded-md border border-warning/50 bg-warning/15 px-2 text-xs font-semibold text-warning-foreground"
          title="All services are mocked. No data leaves the browser and no MASSIVE jobs are submitted."
        >
          <span className="size-1.5 rounded-full bg-warning" aria-hidden />
          Demo mode
        </span>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <UserIcon className="size-3.5" aria-hidden />
          </span>
          <span className="hidden font-medium md:inline">{settings?.researcher ?? "…"}</span>
        </div>
      </div>
    </header>
  )
}
