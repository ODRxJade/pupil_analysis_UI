"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel } from "@/components/page-header"
import { ProgressBar, StatusBadge, jobTone, stepTone } from "@/components/status-badge"
import { useWorkspace } from "@/components/workspace-provider"
import { WorkflowStrip } from "@/components/workflow-strip"
import { JOB_STATUS_LABEL, isActive } from "@/lib/jobs"
import { formatDuration, formatRelative } from "@/lib/format"

export default function OverviewPage() {
  const router = useRouter()
  const { experiments, sessions, jobs, setSessionId, loading } = useWorkspace()
  const awaiting = sessions.filter((s) => !s.predictionsProvided && !jobs.some((j) => j.sessionId === s.id && j.status !== "cancelled"))
  const active = jobs.filter((j) => isActive(j.status) || j.status === "inference_complete" || j.status === "failed")
  const ready = jobs.filter((j) => j.status === "ready").map((j) => ({ job: j, session: sessions.find((s) => s.id === j.sessionId) }))
  const expName = (id: string) => experiments.find((e) => e.id === id)?.name ?? id

  const open = (sessionId: string, href: string) => {
    setSessionId(sessionId)
    router.push(href)
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Overview"
        description="Track footage from upload through DeepLabCut inference on MASSIVE to staged pupil analysis."
        actions={
          <Button render={<Link href="/experiments/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New experiment
          </Button>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <WorkflowStrip />

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="MASSIVE jobs" description="Queued, running and attention-needed jobs (simulated)." bodyClassName="">
            {active.length === 0 ? (
              <EmptyState title="No active jobs" description="Submitted inference jobs appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {active.map((j) => (
                  <li key={j.id}>
                    <button
                      onClick={() => open(j.sessionId, "/jobs?tab=monitor")}
                      className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-xs">{j.id}</span>
                          <span className="truncate text-sm text-muted-foreground">
                            {expName(j.experimentId)} · {sessions.find((s) => s.id === j.sessionId)?.label}
                          </span>
                        </div>
                        <StatusBadge tone={jobTone(j.status)} pulse={isActive(j.status)}>
                          {JOB_STATUS_LABEL[j.status]}
                        </StatusBadge>
                      </div>
                      {isActive(j.status) && (
                        <div className="flex items-center gap-3">
                          <ProgressBar value={j.phaseProgress} label={`${j.id} progress`} />
                          <span className="shrink-0 font-mono text-xs tabular text-muted-foreground">{formatDuration(j.elapsedSec)}</span>
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Ready for analysis" description="Predictions retrieved and available to the analysis workspace." bodyClassName="">
            {ready.length === 0 ? (
              <EmptyState title="Nothing ready yet" description="Retrieve outputs from a completed job to begin analysis." />
            ) : (
              <ul className="divide-y divide-border">
                {ready.map(({ job, session }) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{expName(job.experimentId)}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {session?.label} · {session?.video.fileName}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => open(job.sessionId, "/analysis")}>
                      Open analysis
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Datasets awaiting inference" bodyClassName="">
            {awaiting.length === 0 ? (
              <EmptyState title="All datasets have jobs" />
            ) : (
              <ul className="divide-y divide-border">
                {awaiting.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{expName(s.experimentId)}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {s.label} · {s.footageSource === "massive" ? "MASSIVE path" : "Uploaded"} · {s.metadata ? "metadata" : "full recording"}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => open(s.id, "/jobs")}>
                      Configure inference
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent experiments" bodyClassName="">
            {loading ? (
              <EmptyState title="Loading experiments…" />
            ) : (
              <ul className="divide-y divide-border">
                {experiments.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{e.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.subjectId} · {e.sessionIds.length} session{e.sessionIds.length === 1 ? "" : "s"} · created {formatRelative(e.createdAt)}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {e.tags.map((t) => (
                        <StatusBadge key={t} tone="neutral">
                          {t}
                        </StatusBadge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <RecentAnalyses />
      </div>
    </div>
  )
}

function RecentAnalyses() {
  const { analysis, session, experiment } = useWorkspace()
  const items = analysis?.history.slice(0, 6) ?? []
  return (
    <Panel
      title="Recent analysis activity"
      description={session ? `${experiment?.name} · ${session.label}` : undefined}
      bodyClassName=""
    >
      {items.length === 0 ? (
        <EmptyState title="No stages run for this session" description="Pick a session with retrieved predictions to start analysis." />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((h, k) => (
            <li key={k} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{h.summary}</span>
              <span className="flex items-center gap-3">
                <StatusBadge tone={stepTone("complete")}>Complete</StatusBadge>
                <span className="w-20 text-right text-xs text-muted-foreground">{formatRelative(h.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
