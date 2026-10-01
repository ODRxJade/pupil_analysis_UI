"use client"

import { useState } from "react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { CheckIcon, ChevronDownIcon, RefreshCwIcon, RotateCcwIcon, SquareIcon, TerminalIcon } from "lucide-react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { EmptyState, Panel } from "@/components/page-header"
import { ProgressBar, StatusBadge, jobTone } from "@/components/status-badge"
import { useWorkspace } from "@/components/workspace-provider"
import { api } from "@/lib/api"
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format"
import { JOB_PIPELINE, JOB_STATUS_LABEL, isActive } from "@/lib/jobs"
import type { JobView } from "@/lib/types"
import { cn } from "@/lib/utils"

export function JobMonitor({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { jobs, experiments, sessions } = useWorkspace()
  const { mutate } = useSWRConfig()
  const job = jobs.find((j) => j.id === selectedId) ?? jobs[0]
  const [refreshing, setRefreshing] = useState(false)

  if (!jobs.length) return <EmptyState title="No jobs submitted" description="Configure inference and submit a simulated job to see it here." />

  const refresh = async () => {
    setRefreshing(true)
    await mutate("jobs")
    setRefreshing(false)
    toast.success("Status refreshed", { description: "Fetched from demo job service." })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="Jobs" bodyClassName="">
        <ul className="divide-y divide-border">
          {jobs.map((j) => (
            <li key={j.id}>
              <button
                onClick={() => onSelect(j.id)}
                aria-current={j.id === job?.id}
                className={cn("flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50", j.id === job?.id && "bg-primary/5")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{j.id}</span>
                  <StatusBadge tone={jobTone(j.status)} pulse={isActive(j.status)}>
                    {JOB_STATUS_LABEL[j.status]}
                  </StatusBadge>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {experiments.find((e) => e.id === j.experimentId)?.name} · {sessions.find((s) => s.id === j.sessionId)?.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {job && <JobDetail job={job} onRefresh={refresh} refreshing={refreshing} />}
    </div>
  )
}

function JobDetail({ job, onRefresh, refreshing }: { job: JobView; onRefresh: () => void; refreshing: boolean }) {
  const { experiments, sessions } = useWorkspace()
  const { mutate } = useSWRConfig()
  const exp = experiments.find((e) => e.id === job.experimentId)
  const session = sessions.find((s) => s.id === job.sessionId)
  const currentIdx = JOB_PIPELINE.indexOf(job.status)
  const failedIdx = job.failedPhase ? JOB_PIPELINE.indexOf(job.failedPhase) : -1

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    await fn()
    await mutate("jobs")
    toast.success(msg)
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{job.id}</span>
            <StatusBadge tone={jobTone(job.status)} pulse={isActive(job.status)}>
              {JOB_STATUS_LABEL[job.status]}
            </StatusBadge>
            <StatusBadge tone="warning">Simulated</StatusBadge>
          </span>
        }
        description={`${exp?.name} · ${session?.label} · attempt ${job.attempts}`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
              <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
              Refresh status
            </Button>
            {job.status === "failed" && (
              <Button size="sm" variant="outline" onClick={() => act(() => api.retryJob(job.id), `Retrying ${job.failedPhase} stage`)}>
                <RotateCcwIcon data-icon="inline-start" />
                Retry failed stage
              </Button>
            )}
            {isActive(job.status) && job.status !== "retrieving" && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button size="sm" variant="destructive" />}>
                  <SquareIcon data-icon="inline-start" />
                  Cancel job
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel {job.id}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The backend would issue scancel for this job. Partial outputs are kept but inference will need to be resubmitted. In demo mode no real job exists.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep running</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => act(() => api.cancelJob(job.id), `${job.id} cancelled`)}>
                      Cancel job
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <ol className="flex flex-wrap gap-1" aria-label="Job lifecycle">
            {JOB_PIPELINE.map((st, k) => {
              const done = currentIdx > k || job.status === "ready"
              const current = currentIdx === k && job.status !== "ready"
              const failed = failedIdx === k && job.status === "failed"
              return (
                <li
                  key={st}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs whitespace-nowrap",
                    done && "border-success/30 bg-success/10 text-success",
                    current && "border-info/40 bg-info/10 text-info",
                    failed && "border-destructive/40 bg-destructive/10 text-destructive",
                    !done && !current && !failed && "border-border text-muted-foreground",
                  )}
                >
                  {done && <CheckIcon className="size-3" aria-hidden />}
                  {JOB_STATUS_LABEL[st]}
                </li>
              )
            })}
          </ol>
          {isActive(job.status) && (
            <div className="flex flex-col gap-1.5">
              <ProgressBar value={job.phaseProgress} label="Phase progress" />
              <span className="text-xs text-muted-foreground">
                {job.phaseProgress === null ? "Frame-level progress not reported by SLURM — waiting for next status update." : `${Math.round(job.phaseProgress * 100)}% of current phase`}
              </span>
            </div>
          )}
          {job.status === "failed" && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {job.failure?.message} Check the paths in Configuration, then retry the failed stage.
            </p>
          )}
          <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <Item label="Submitted" value={formatDateTime(job.submittedAt)} />
            <Item label="Elapsed" value={formatDuration(job.elapsedSec)} mono />
            <Item label="Last status update" value={formatRelative(job.lastUpdate)} />
            <Item label="Partition / account" value={`${job.resources.partition || "<partition>"} · ${job.resources.account || "<account>"}`} mono />
            <Item label="Requested" value={`${job.resources.gpuCount}× ${job.resources.gpuType || "GPU"} · ${job.resources.cpus} CPU · ${job.resources.memoryGb} GB`} mono />
            <Item label="Wall time" value={job.resources.wallTime} mono />
            <Item label="Input" value={job.inputPath} mono />
            <Item label="Output" value={job.outputDir} mono />
          </dl>
        </div>
      </Panel>
      <LogViewer job={job} />
    </div>
  )
}

function LogViewer({ job }: { job: JobView }) {
  const [open, setOpen] = useState(false)
  const [stream, setStream] = useState<"stdout" | "stderr">("stdout")
  const lines = job.logs[stream]
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <TerminalIcon className="size-4" aria-hidden /> Logs
          <span className="font-normal text-muted-foreground">
            {job.logs.stdout.length} stdout · {job.logs.stderr.length} stderr lines
          </span>
        </span>
        <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 border-t border-border p-4">
          <div className="flex gap-1">
            {(["stdout", "stderr"] as const).map((s) => (
              <Button key={s} size="xs" variant={stream === s ? "secondary" : "ghost"} onClick={() => setStream(s)} className="font-mono">
                {s}
              </Button>
            ))}
          </div>
          <pre className="max-h-80 overflow-auto rounded-md bg-sidebar p-3 font-mono text-xs leading-5 text-sidebar-foreground">
            {lines.length ? lines.join("\n") : `(no ${stream} output yet)`}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate", mono && "font-mono text-xs")} title={value}>
        {value}
      </dd>
    </div>
  )
}
