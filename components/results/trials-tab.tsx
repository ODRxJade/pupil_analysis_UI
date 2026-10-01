"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Panel } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { SummaryChart } from "@/components/analysis/stage-results"
import { TracePlot } from "@/components/viewer/trace-plot"
import { fmt } from "@/lib/format"
import type { PipelineResults } from "@/lib/results"
import type { EyeSignal } from "@/lib/signal"
import type { AnalysisState, Session } from "@/lib/types"

function NoSummary({ session }: { session: Session }) {
  return (
    <EmptyState
      title={session.metadata ? "Trial summary not run yet" : "No stimulus metadata"}
      description={session.metadata ? "Run alignment and the trial summary stage in Analysis." : "Attach a metadata file with stimulus timings to this session to compute trial outputs."}
      action={
        <Button size="sm" variant="outline" render={<Link href={session.metadata ? "/analysis" : "/experiments"} />} nativeButton={false}>
          {session.metadata ? "Open Analysis" : "Open Experiments"}
        </Button>
      }
    />
  )
}

export function TrialsTab({
  session,
  signal,
  results: r,
  analysis,
  frame,
  onSeek,
}: {
  session: Session
  signal: EyeSignal
  results: PipelineResults
  analysis: AnalysisState
  frame: number
  onSeek: (f: number) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  if (!r.summary || !r.filter) return <NoSummary session={session} />
  const speedUnit = r.velocity?.speedUnit ?? "px/s"
  const trial = signal.trials.find((t) => t.index === selected)

  const select = (index: number) => {
    setSelected(index)
    const t = signal.trials.find((x) => x.index === index)
    if (t) onSeek(Math.round(t.onset * signal.fps))
  }

  return (
    <div className="flex flex-col gap-4">
      {trial && (
        <Panel title={`Trial ${trial.index} · ${trial.stimulusId}`} description="Shaded region is the stimulus window. Green marks onset, red marks offset." bodyClassName="p-4">
          <TracePlot
            title="Pupil diameter"
            unit="px"
            frameCount={signal.frameCount}
            fps={signal.fps}
            frame={frame}
            onSeek={onSeek}
            series={[{ label: "diameter", values: r.filter.d, color: "--chart-1", width: 1.5 }]}
            intervals={[{ start: Math.round(trial.onset * signal.fps), end: Math.round(trial.offset * signal.fps), color: "--chart-4", label: "stimulus" }]}
            markers={[
              { frame: Math.round(trial.onset * signal.fps), color: "--success" },
              { frame: Math.round(trial.offset * signal.fps), color: "--destructive" },
            ]}
          />
        </Panel>
      )}
      <Panel title="Trial summaries" description={`${r.summary.metrics.length} trials. Select a row to inspect. Units: px, ms, ${speedUnit}.`} bodyClassName="max-h-[28rem] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trial</TableHead>
              <TableHead>Stimulus</TableHead>
              <TableHead className="text-right">Baseline (px)</TableHead>
              <TableHead className="text-right">Peak Δ (px)</TableHead>
              <TableHead className="text-right">Latency (ms)</TableHead>
              <TableHead className="text-right">Mean speed ({speedUnit})</TableHead>
              <TableHead className="text-right">Fast mov.</TableHead>
              <TableHead className="text-right">Blinks</TableHead>
              <TableHead className="text-right">Valid</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.summary.metrics.map((m) => {
              const excluded = analysis.excludedTrials[m.index]
              return (
                <TableRow
                  key={m.index}
                  data-state={selected === m.index ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => select(m.index)}
                  onKeyDown={(e) => e.key === "Enter" && select(m.index)}
                  tabIndex={0}
                >
                  <TableCell className="font-mono text-xs">{m.index}</TableCell>
                  <TableCell className="font-mono text-xs">{m.stimulusId}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{fmt(m.baseline, 1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{fmt(m.peakChange, 2)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{fmt(m.latencyMs, 0)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{fmt(m.meanSpeed, 1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{m.fastMovements}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{m.blinks}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">{fmt(m.validFraction * 100, 0)}%</TableCell>
                  <TableCell>
                    {excluded !== undefined ? (
                      <span title={excluded}>
                        <StatusBadge tone="danger">Excluded</StatusBadge>
                      </span>
                    ) : m.flags.length ? (
                      <span title={m.flags.join("; ")}>
                        <StatusBadge tone="warning">{m.flags.length} flag{m.flags.length > 1 ? "s" : ""}</StatusBadge>
                      </span>
                    ) : (
                      <StatusBadge tone="success">Included</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  )
}

export function StimuliTab({ session, results: r, analysis }: { session: Session; results: PipelineResults; analysis: AnalysisState }) {
  if (!r.summary) return <NoSummary session={session} />
  const variability = String(analysis.stages.summary.lastRun?.configUsed.variability ?? "sd").toUpperCase()
  const baseline = analysis.stages.summary.lastRun?.configUsed.baselineCorrection ? "baseline-corrected" : "not baseline-corrected"
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Stimulus-aligned pupil diameter" description={`Mean ± ${variability} across included trials, ${baseline}. Units: px, seconds from onset.`} bodyClassName="p-4">
        <SummaryChart stimuli={r.summary.stimuli} />
      </Panel>
      <Panel title="Stimulus summaries" bodyClassName="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stimulus</TableHead>
              <TableHead className="text-right">Included trials</TableHead>
              <TableHead className="text-right">Mean peak Δ (px)</TableHead>
              <TableHead className="text-right">{variability} (px)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.summary.stimuli.map((s) => (
              <TableRow key={s.stimulusId}>
                <TableCell className="font-mono text-xs">{s.stimulusId}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular">{s.n}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular">{fmt(s.meanPeakChange, 2)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular">{fmt(s.variability, 2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  )
}
