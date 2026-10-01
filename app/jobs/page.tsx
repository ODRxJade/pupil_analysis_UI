"use client"

import { Suspense, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { JobsWorkspace } from "@/components/jobs/jobs-workspace"
import { JobMonitor } from "@/components/jobs/job-monitor"
import { OutputsPanel } from "@/components/jobs/outputs-panel"
import { useWorkspace } from "@/components/workspace-provider"
import { useInferenceConfig, useTemplates } from "@/hooks/use-data"

const TABS = [
  { id: "configuration", label: "Configuration" },
  { id: "script", label: "SLURM script" },
  { id: "monitor", label: "Job monitor" },
  { id: "outputs", label: "Outputs" },
] as const
type TabId = (typeof TABS)[number]["id"]

function JobsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "configuration") as TabId
  const { session, experiment, sessionId, job } = useWorkspace()
  const { data: config } = useInferenceConfig(sessionId)
  const { data: templates } = useTemplates()
  const [selectedJob, setSelectedJob] = useState<string | null>(null)

  const setTab = (t: TabId) => router.replace(`${pathname}?tab=${t}`, { scroll: false })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="MASSIVE Jobs"
        description={
          <>
            DeepLabCut inference for {experiment?.name ?? "—"} · <span className="font-mono">{session?.label}</span>. Jobs are submitted by the backend job
            service; the browser never holds cluster credentials.
          </>
        }
        actions={<StatusBadge tone="warning">Demo · simulated cluster</StatusBadge>}
      />
      <div className="flex flex-col gap-6 px-6 pt-4 pb-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {(tab === "configuration" || tab === "script") &&
          (config && templates && session ? (
            <JobsWorkspace
              key={sessionId}
              tab={tab}
              initial={config}
              templates={templates}
              session={session}
              experiment={experiment}
              job={job}
              onSubmitted={(id) => {
                setSelectedJob(id)
                setTab("monitor")
              }}
            />
          ) : (
            <Skeleton className="h-96 w-full" />
          ))}
        {tab === "monitor" && (
          <div className="pb-6">
            <JobMonitor selectedId={selectedJob ?? job?.id ?? null} onSelect={setSelectedJob} />
          </div>
        )}
        {tab === "outputs" && (
          <div className="pb-6">
            <OutputsPanel job={job} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <JobsContent />
    </Suspense>
  )
}
