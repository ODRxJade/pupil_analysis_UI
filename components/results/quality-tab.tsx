"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Panel } from "@/components/page-header"
import { Stats, count, runsOf } from "@/components/analysis/stage-results"
import { TracePlot } from "@/components/viewer/trace-plot"
import { excludedIntervals } from "@/lib/exports"
import { fmt, formatDateTime } from "@/lib/format"
import type { PipelineResults } from "@/lib/results"
import type { EyeSignal } from "@/lib/signal"
import { STAGE_MAP } from "@/lib/stages"
import type { AnalysisState } from "@/lib/types"

export function QualityTab({
  signal,
  results: r,
  analysis,
  frame,
  onSeek,
}: {
  signal: EyeSignal
  results: PipelineResults
  analysis: AnalysisState
  frame: number
  onSeek: (f: number) => void
}) {
  const q = r.quality ?? r.liveQuality
  const intervals = excludedIntervals(signal, r)
  const excludedTrials = Object.entries(analysis.excludedTrials)

  return (
    <div className="flex flex-col gap-4">
      <Stats
        items={[
          ["Low-confidence frames", `${q.lowCount} (${fmt((q.lowCount / signal.frameCount) * 100, 1)}%)`],
          ["Excluded samples", r.filter ? String(r.filter.excludedCount) : "Filtering not run"],
          ["Interpolated samples", r.filter ? String(r.filter.interpolatedCount) : "Filtering not run"],
          ["Manual corrections", String(Object.keys(analysis.corrections).length)],
          ["Excluded trials", String(excludedTrials.length)],
          ["Pupil-fit invalid frames", r.centre ? String(r.centre.invalidCount) : "Centre not run"],
        ]}
      />
      <Panel title="Landmark likelihood" description="DeepLabCut prediction confidence (p, 0–1). Red regions are low-confidence runs." bodyClassName="p-4">
        <TracePlot
          title="Mean landmark likelihood"
          unit="p"
          yDomain={[0, 1]}
          frameCount={signal.frameCount}
          fps={signal.fps}
          frame={frame}
          onSeek={onSeek}
          series={[
            { label: "mean p", values: q.meanLik, color: "--chart-1" },
            { label: "min p", values: q.minLik, color: "--chart-3", opacity: 0.6 },
          ]}
          intervals={runsOf(q.low).map(([a, b]) => ({ start: a, end: b, color: "--destructive" }))}
        />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Per-landmark mean likelihood" bodyClassName="max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Landmark</TableHead>
                <TableHead className="text-right">Mean p</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.perLandmark.map((p, k) => (
                <TableRow key={k}>
                  <TableCell className="font-mono text-xs">pupil_{k + 1}</TableCell>
                  <TableCell className={`text-right font-mono text-xs tabular ${p < 0.9 ? "text-warning" : ""}`}>{fmt(p, 3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Excluded intervals" description={`${intervals.length} intervals · ${r.filter ? count(r.filter.excluded) : q.lowCount} frames. Select a row to move the cursor.`} bodyClassName="max-h-72 overflow-auto">
          {intervals.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Frames</TableHead>
                  <TableHead className="text-right">Start (s)</TableHead>
                  <TableHead className="text-right">Duration (ms)</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intervals.map((x) => (
                  <TableRow key={`${x.start}-${x.reason}`} className="cursor-pointer" onClick={() => onSeek(x.start)}>
                    <TableCell className="font-mono text-xs tabular">
                      {x.start}–{x.end}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular">{fmt(x.startSec, 2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular">{fmt(x.durationMs, 0)}</TableCell>
                    <TableCell className="text-xs">{x.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No excluded intervals.</p>
          )}
        </Panel>
      </div>
      {excludedTrials.length > 0 && (
        <Panel title="Excluded trials">
          <ul className="flex flex-col gap-1 text-sm">
            {excludedTrials.map(([idx, reason]) => (
              <li key={idx} className="flex gap-3">
                <span className="font-mono text-xs">Trial {idx}</span>
                <span className="text-muted-foreground">{reason || "No reason given"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Analysis history" description="Every stage run is recorded for this session.">
        {analysis.history.length ? (
          <ol className="flex flex-col gap-1.5 text-sm">
            {[...analysis.history].reverse().map((h, k) => (
              <li key={`${h.at}-${k}`} className="flex flex-wrap gap-x-3">
                <span className="font-mono text-xs text-muted-foreground tabular">{formatDateTime(h.at)}</span>
                <span className="font-medium">{STAGE_MAP[h.stageId]?.title ?? h.stageId}</span>
                <span className="text-muted-foreground">{h.summary}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No stages have been run yet.</p>
        )}
      </Panel>
    </div>
  )
}
