"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CrosshairIcon, SkipForwardIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, PageHeader, Panel } from "@/components/page-header"
import { StageRail } from "@/components/analysis/stage-rail"
import { StageSettings } from "@/components/analysis/stage-settings"
import { StageResults } from "@/components/analysis/stage-results"
import { EyeViewer, DEFAULT_OVERLAYS, type Overlays } from "@/components/viewer/eye-viewer"
import { Transport } from "@/components/viewer/transport"
import { useWorkspace } from "@/components/workspace-provider"
import { usePlayback } from "@/hooks/use-playback"
import { useAnalysisMutate, useSessionResults } from "@/hooks/use-results"
import { api } from "@/lib/api"
import { STAGE_MAP, canRun } from "@/lib/stages"
import type { StageId } from "@/lib/types"
import { cn } from "@/lib/utils"

const OVERLAY_LABELS: Record<keyof Overlays, string> = {
  landmarks: "Landmarks",
  centre: "Centre",
  boundary: "Fitted boundary",
  roi: "ROI",
  flow: "Flow",
  events: "Events",
}

export default function AnalysisPage() {
  const { session, experiment, analysis, job } = useWorkspace()
  const { signal, results, statuses } = useSessionResults()

  if (!session) return <Skeleton className="m-6 h-96" />
  if (job?.status !== "ready" && !session.predictionsAvailable)
    return (
      <div className="flex flex-col">
        <PageHeader title="Analysis" />
        <div className="p-6">
          <EmptyState
            title="Predictions not yet available"
            description="Analysis starts once DeepLabCut outputs have been retrieved from MASSIVE for this session."
            action={
              <Button render={<Link href="/jobs?tab=outputs" />} nativeButton={false}>
                Go to job outputs
              </Button>
            }
          />
        </div>
      </div>
    )
  if (!signal || !results || !statuses || !analysis) return <Skeleton className="m-6 h-96" />

  return <Workspace key={session.id} title={`${experiment?.name ?? ""} · ${session.label}`} />
}

function Workspace({ title }: { title: string }) {
  const { session, analysis } = useWorkspace()
  const { signal, results, statuses } = useSessionResults()
  const mutateAnalysis = useAnalysisMutate()
  const playback = usePlayback(signal!.frameCount, signal!.fps)
  const [stage, setStage] = useState<StageId>("quality")
  const [running, setRunning] = useState<StageId | null>(null)
  const [zoom, setZoom] = useState(1)
  const [overlays, setOverlays] = useState<Overlays>(DEFAULT_OVERLAYS)
  const [correcting, setCorrecting] = useState(false)

  if (!signal || !results || !statuses || !analysis || !session) return null
  const sid = session.id
  const def = STAGE_MAP[stage]
  const record = analysis.stages[stage]
  const t = signal.t[playback.frame] ?? playback.frame / signal.fps
  const trial = signal.trials.find((tr) => t >= tr.onset && t <= tr.offset)
  const lowThreshold = Number(analysis.stages.quality.settings.lowConfidenceThreshold)

  const run = async (id: StageId) => {
    setRunning(id)
    const next = await mutateAnalysis((s) => api.runStage(s, id))
    setRunning(null)
    const failed = next?.stages[id].failed
    if (failed) toast.error(`${STAGE_MAP[id].title} failed`, { description: failed })
    else toast.success(`${STAGE_MAP[id].title} complete`)
  }

  const nextLow = () => {
    const low = results.liveQuality.low
    for (let k = 1; k < signal.frameCount; k++) {
      const f = (playback.frame + k) % signal.frameCount
      if (low[f]) return playback.seek(f)
    }
    toast.info("No low-confidence frames at the current threshold")
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Analysis" description={title} />
      <div className="grid gap-6 p-6 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <StageRail statuses={statuses} active={stage} running={running} onSelect={setStage} />

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            bodyClassName="p-0"
            title="Synchronised viewer"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {stage === "quality" && (
                  <>
                    <Button size="sm" variant="outline" onClick={nextLow}>
                      <SkipForwardIcon data-icon="inline-start" />
                      Next low-confidence
                    </Button>
                    <Button size="sm" variant={correcting ? "default" : "outline"} aria-pressed={correcting} onClick={() => setCorrecting((c) => !c)}>
                      <CrosshairIcon data-icon="inline-start" />
                      {correcting ? "Click to set centre" : "Correct centre"}
                    </Button>
                    {analysis.corrections[playback.frame] && (
                      <Button size="sm" variant="ghost" onClick={() => mutateAnalysis((s) => api.setCorrection(s, playback.frame, null))}>
                        Clear correction
                      </Button>
                    )}
                  </>
                )}
              </div>
            }
          >
            <div className="flex flex-col gap-3 p-4">
              <EyeViewer
                signal={signal}
                frame={playback.frame}
                zoom={zoom}
                overlays={overlays}
                results={results}
                lowThreshold={lowThreshold}
                corrections={analysis.corrections}
                roi={session.roi}
                correcting={correcting}
                onCorrect={(p) => {
                  mutateAnalysis((s) => api.setCorrection(s, playback.frame, p))
                  toast.success(`Correction saved for frame ${playback.frame}`, { description: "Stage A is now modified — re-run to apply downstream." })
                }}
                stimulusLabel={trial?.stimulusId ?? null}
              />
              <Transport
                playback={playback}
                frameCount={signal.frameCount}
                fps={signal.fps}
                timestamps={signal.t}
                zoom={zoom}
                onZoom={setZoom}
                markers={signal.trials.map((tr) => ({ frame: Math.round(tr.onset * signal.fps), color: "--chart-4" }))}
              />
              <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
                <legend className="sr-only">Overlays</legend>
                {(Object.keys(OVERLAY_LABELS) as (keyof Overlays)[]).map((k) => (
                  <label key={k} className={cn("flex items-center gap-1.5 text-xs", !overlays[k] && "text-muted-foreground")}>
                    <Checkbox checked={overlays[k]} onCheckedChange={(v) => setOverlays((o) => ({ ...o, [k]: Boolean(v) }))} />
                    {OVERLAY_LABELS[k]}
                  </label>
                ))}
              </fieldset>
            </div>
          </Panel>

          <div className="2xl:hidden">
            <StageSettingsBound stage={stage} running={running} onRun={run} />
          </div>

          <StageResults
            stage={stage}
            signal={signal}
            results={results}
            analysis={analysis}
            frame={playback.frame}
            onSeek={playback.seek}
            onToggleTrial={(i, ex) => mutateAnalysis((s) => api.setTrialExclusion(s, i, ex ? "Excluded by researcher" : null))}
          />
        </div>

        <div className="hidden 2xl:block">
          <div className="sticky top-4">
            <StageSettingsBound stage={stage} running={running} onRun={run} />
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {def.title}: {statuses[stage].status}
        {record.failed ? `, ${record.failed}` : ""}
      </span>
    </div>
  )
}

function StageSettingsBound({ stage, running, onRun }: { stage: StageId; running: StageId | null; onRun: (id: StageId) => void }) {
  const { analysis } = useWorkspace()
  const { statuses } = useSessionResults()
  const mutateAnalysis = useAnalysisMutate()
  if (!analysis || !statuses) return null
  return (
    <StageSettings
      def={STAGE_MAP[stage]}
      record={analysis.stages[stage]}
      status={statuses[stage]}
      runnable={canRun(statuses, stage)}
      running={running === stage}
      onChange={(settings) => mutateAnalysis((s) => api.updateStageSettings(s, stage, settings))}
      onReset={() => mutateAnalysis((s) => api.resetStageSettings(s, stage))}
      onRun={() => onRun(stage)}
    />
  )
}
