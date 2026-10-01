"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FileJsonIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, PageHeader } from "@/components/page-header"
import { FilesTab } from "@/components/results/files-tab"
import { QualityTab } from "@/components/results/quality-tab"
import { SessionTab } from "@/components/results/session-tab"
import { StimuliTab, TrialsTab } from "@/components/results/trials-tab"
import { resolveColor } from "@/components/viewer/trace-plot"
import { useWorkspace } from "@/components/workspace-provider"
import { useInferenceConfig } from "@/hooks/use-data"
import { useSessionResults } from "@/hooks/use-results"
import { buildExports, fileBase, processingConfig } from "@/lib/exports"
import { downloadText } from "@/lib/format"

export default function ResultsPage() {
  const { session, sessionId, analysis, experiment } = useWorkspace()
  const { signal, results } = useSessionResults()
  const { data: config } = useInferenceConfig(sessionId)
  const [frame, setFrame] = useState(0)

  const items = useMemo(
    () => (session && signal && results && analysis ? buildExports({ session, signal, results, analysis, config, resolveColor }) : []),
    [session, signal, results, analysis, config],
  )

  if (!session || !signal || !results || !analysis) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const anyRun = Object.values(analysis.stages).some((s) => s.lastRun)
  const exportConfig = () => downloadText(`${fileBase(session)}_processing_config.json`, JSON.stringify(processingConfig({ session, analysis, config }), null, 2), "application/json")

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Results"
        description={`${experiment?.name ?? "Experiment"} · ${session.label}. Review session traces, trial and stimulus summaries, data quality, and export files.`}
        actions={
          <Button size="sm" variant="outline" onClick={exportConfig}>
            <FileJsonIcon data-icon="inline-start" />
            Processing config
          </Button>
        }
      />
      <div className="p-6">
        {!anyRun ? (
          <EmptyState
            title="No analysis results yet"
            description="Run the analysis stages for this session to populate results and exports."
            action={
              <Button size="sm" render={<Link href="/analysis" />} nativeButton={false}>
                Open Analysis
              </Button>
            }
          />
        ) : (
          <Tabs defaultValue="session" className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="session">Session</TabsTrigger>
              <TabsTrigger value="trials">Trials</TabsTrigger>
              <TabsTrigger value="stimuli">Stimuli</TabsTrigger>
              <TabsTrigger value="quality">Data quality</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
            <TabsContent value="session">
              <SessionTab signal={signal} results={results} frame={frame} onSeek={setFrame} />
            </TabsContent>
            <TabsContent value="trials">
              <TrialsTab session={session} signal={signal} results={results} analysis={analysis} frame={frame} onSeek={setFrame} />
            </TabsContent>
            <TabsContent value="stimuli">
              <StimuliTab session={session} results={results} analysis={analysis} />
            </TabsContent>
            <TabsContent value="quality">
              <QualityTab signal={signal} results={results} analysis={analysis} frame={frame} onSeek={setFrame} />
            </TabsContent>
            <TabsContent value="files">
              <FilesTab items={items} analysis={analysis} config={config} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
