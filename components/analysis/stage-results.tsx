"use client"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Panel } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { TracePlot, type Interval, type Series } from "@/components/viewer/trace-plot"
import { fmt } from "@/lib/format"
import type { StimulusSummary } from "@/lib/pipeline"
import type { PipelineResults } from "@/lib/results"
import type { EyeSignal } from "@/lib/signal"
import type { AnalysisState, StageId } from "@/lib/types"

const PALETTE = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]

export function StageResults({
  stage,
  signal,
  results,
  analysis,
  frame,
  onSeek,
  onToggleTrial,
}: {
  stage: StageId
  signal: EyeSignal
  results: PipelineResults
  analysis: AnalysisState
  frame: number
  onSeek: (f: number) => void
  onToggleTrial: (index: number, excluded: boolean) => void
}) {
  const common = { frameCount: signal.frameCount, fps: signal.fps, frame, onSeek }
  const trialIntervals: Interval[] = signal.trials.map((tr) => ({
    start: Math.round(tr.onset * signal.fps),
    end: Math.round(tr.offset * signal.fps),
    color: "--chart-4",
  }))

  const r = results
  const empty = (what: string) => <EmptyState title={`Run this stage to see ${what}`} description="Outputs are computed from the settings used at the last run." />

  switch (stage) {
    case "quality": {
      const q = r.liveQuality
      const lowIntervals = runsOf(q.low).map(([a, b]) => ({ start: a, end: b, color: "--destructive" }))
      return (
        <div className="flex flex-col gap-4">
          <Stats items={[
            ["Low-confidence frames", `${q.lowCount} (${fmt((q.lowCount / signal.frameCount) * 100, 1)}%)`],
            ["Manual corrections", String(Object.keys(analysis.corrections).length)],
            ["Weakest landmark", `${fmt(Math.min(...q.perLandmark), 3)} mean p`],
          ]} />
          <TracePlot {...common} title="Mean landmark likelihood" unit="p" yDomain={[0, 1]} series={[{ label: "mean p", values: q.meanLik, color: "--chart-1" }, { label: "min p", values: q.minLik, color: "--chart-3", opacity: 0.6 }]} intervals={lowIntervals} />
        </div>
      )
    }
    case "centre":
      if (!r.centre) return empty("pupil centre and diameter")
      return (
        <div className="flex flex-col gap-4">
          <Stats items={[["Invalid frames", String(r.centre.invalidCount)], ["Corrected frames", String(count(r.centre.corrected))], ["Median diameter", `${fmt(med(r.centre.diam), 1)} px`]]} />
          <TracePlot {...common} title="Pupil diameter" unit="px" series={[{ label: "diameter", values: r.centre.diam, color: "--chart-1" }]} />
          <TracePlot {...common} title="Pupil centre" unit="px" series={[{ label: "x", values: r.centre.x, color: "--chart-2" }, { label: "y", values: r.centre.y, color: "--chart-3" }]} />
        </div>
      )
    case "filter":
      if (!r.filter) return empty("filtered traces")
      return (
        <div className="flex flex-col gap-4">
          <Stats items={[["Excluded samples", String(r.filter.excludedCount)], ["Interpolated samples", String(r.filter.interpolatedCount)]]} />
          <TracePlot {...common} title="Diameter: raw vs filtered" unit="px" series={[{ label: "raw", values: r.filter.rawD, color: "--muted-foreground", opacity: 0.5 }, { label: "filtered", values: r.filter.d, color: "--chart-1", width: 1.5 }]} intervals={runsOf(r.filter.interpolated).map(([a, b]) => ({ start: a, end: b, color: "--chart-4" }))} />
          <TracePlot {...common} title="Horizontal position: raw vs filtered" unit="px" series={[{ label: "raw", values: r.filter.rawX, color: "--muted-foreground", opacity: 0.5 }, { label: "filtered", values: r.filter.x, color: "--chart-2", width: 1.5 }]} />
        </div>
      )
    case "velocity":
      if (!r.velocity) return empty("velocity")
      return (
        <div className="flex flex-col gap-4">
          <TracePlot {...common} title="Speed" unit={r.velocity.speedUnit} series={[{ label: "speed", values: r.velocity.speed, color: "--chart-1" }]} />
          <TracePlot {...common} title="Velocity components" unit={r.velocity.speedUnit} series={[{ label: "vx", values: r.velocity.vx, color: "--chart-2" }, { label: "vy", values: r.velocity.vy, color: "--chart-3" }]} />
        </div>
      )
    case "events":
      if (!r.events || !r.velocity) return empty("detected events")
      return (
        <div className="flex flex-col gap-4">
          <Stats items={[[r.events.label, String(r.events.events.length)], ["Threshold", `${fmt(r.events.threshold, 0)} ${r.velocity.speedUnit}`], ["Speed mean ± SD", `${fmt(r.events.mean, 0)} ± ${fmt(r.events.sd, 0)}`]]} />
          <TracePlot {...common} title="Speed with threshold" unit={r.velocity.speedUnit} series={[{ label: "speed", values: r.velocity.speed, color: "--chart-1" }]} hline={{ value: r.events.threshold, color: "--destructive", label: "threshold" }} intervals={r.events.events.map((e) => ({ start: e.startFrame, end: e.endFrame, color: "--chart-5" }))} />
          <EventTable rows={r.events.events.map((e) => ({ id: e.id, frame: e.startFrame, cells: [fmt(e.startTime, 2) + " s", `${fmt(e.durationMs, 0)} ms`, fmt(e.peakSpeed, 0), fmt(e.amplitude, 1)] }))} head={["Start", "Duration", "Peak speed", "Amplitude"]} onSeek={onSeek} />
        </div>
      )
    case "blinks":
      if (!r.blinks) return empty("blinks")
      return (
        <div className="flex flex-col gap-4">
          <Stats items={[["Blinks", String(r.blinks.length)], ["Flagged", String(r.blinks.filter((b) => b.flags.length).length)]]} />
          <TracePlot {...common} title="Eyelid aperture" unit="px" series={[{ label: "aperture", values: signal.aperture, color: "--chart-2" }]} intervals={r.blinks.map((b) => ({ start: b.startFrame, end: b.endFrame, color: "--chart-4" }))} />
          <EventTable rows={r.blinks.map((b) => ({ id: b.id, frame: b.startFrame, cells: [fmt(b.startTime, 2) + " s", `${fmt(b.durationMs, 0)} ms`, b.flags.join(", ") || "—"] }))} head={["Start", "Duration", "Flags"]} onSeek={onSeek} />
        </div>
      )
    case "flow":
      if (!r.flow) return empty("optical flow")
      return (
        <div className="flex flex-col gap-4">
          <Stats items={[["Mean magnitude", fmt(r.flow.meanMagnitude, 2)], ["Peak magnitude", fmt(r.flow.peakMagnitude, 2)], ["Active fraction", `${fmt(r.flow.activeFraction * 100, 1)}%`]]} />
          <TracePlot {...common} title="Flow magnitude" unit="px/frame" series={[{ label: "magnitude", values: r.flow.magnitude, color: "--chart-3" }]} />
        </div>
      )
    case "align":
      if (!r.aligned) return empty("stimulus-aligned trials")
      return (
        <div className="flex flex-col gap-4">
          <TracePlot {...common} title="Diameter with stimulus windows" unit="px" series={[{ label: "diameter", values: r.filter?.d ?? r.centre?.diam ?? [], color: "--chart-1" }]} intervals={trialIntervals} />
          <Panel title="Trials" description="Exclude trials from the summary. Exclusions are recorded in provenance." bodyClassName="">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Stimulus</TableHead>
                  <TableHead>Onset</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Include</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.aligned.map((t) => {
                  const excluded = t.index in analysis.excludedTrials
                  return (
                    <TableRow key={t.index} className={excluded ? "opacity-50" : undefined}>
                      <TableCell className="font-mono text-xs">{t.index + 1}</TableCell>
                      <TableCell>
                        <button className="font-mono text-xs underline-offset-2 hover:underline" onClick={() => onSeek(t.onsetFrame)}>
                          {t.stimulusId}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular">{fmt(t.onset, 2)} s</TableCell>
                      <TableCell className="flex flex-wrap gap-1">
                        {t.flags.length ? t.flags.map((f) => <StatusBadge key={f} tone="warning">{f}</StatusBadge>) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="xs" variant={excluded ? "outline" : "ghost"} onClick={() => onToggleTrial(t.index, !excluded)}>
                          {excluded ? "Excluded" : "Included"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )
    case "summary":
      if (!r.summary) return empty("stimulus summaries")
      return (
        <div className="flex flex-col gap-4">
          <Panel title="Mean response by stimulus" description="Shaded band shows the selected variability measure.">
            <SummaryChart stimuli={r.summary.stimuli} />
          </Panel>
          <Panel title="Per-stimulus summary" bodyClassName="">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stimulus</TableHead>
                  <TableHead>n</TableHead>
                  <TableHead>Mean peak change</TableHead>
                  <TableHead>Variability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.summary.stimuli.map((s) => (
                  <TableRow key={s.stimulusId}>
                    <TableCell className="font-mono text-xs">{s.stimulusId}</TableCell>
                    <TableCell className="tabular">{s.n}</TableCell>
                    <TableCell className="font-mono text-xs tabular">{fmt(s.meanPeakChange, 2)}</TableCell>
                    <TableCell className="font-mono text-xs tabular">{fmt(s.variability, 2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )
  }
}

function SummaryChart({ stimuli }: { stimuli: StimulusSummary[] }) {
  const W = 640
  const H = 220
  const pad = { l: 40, r: 12, t: 10, b: 24 }
  const all = stimuli.flatMap((s) => [...s.lo, ...s.hi]).filter(Number.isFinite)
  const t = stimuli.flatMap((s) => s.relT)
  if (!all.length || !t.length) return <p className="text-sm text-muted-foreground">No included trials.</p>
  const [y0, y1] = [Math.min(...all), Math.max(...all)]
  const [x0, x1] = [Math.min(...t), Math.max(...t)]
  const sx = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b)
  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Mean stimulus-aligned diameter by stimulus">
        <line x1={sx(0)} x2={sx(0)} y1={pad.t} y2={H - pad.b} className="stroke-border" strokeDasharray="3 3" />
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="stroke-border" />
        <text x={sx(0) + 4} y={pad.t + 10} className="fill-muted-foreground text-[10px]">onset</text>
        <text x={pad.l} y={H - 6} className="fill-muted-foreground text-[10px]">{fmt(x0, 1)} s</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmt(x1, 1)} s</text>
        <text x={4} y={sy(y1) + 8} className="fill-muted-foreground text-[10px]">{fmt(y1, 1)}</text>
        <text x={4} y={sy(y0)} className="fill-muted-foreground text-[10px]">{fmt(y0, 1)}</text>
        {stimuli.map((s, k) => {
          const c = `var(${PALETTE[k % PALETTE.length]})`
          const band = [...s.relT.map((x, i) => `${sx(x)},${sy(s.hi[i])}`), ...s.relT.map((x, i) => `${sx(x)},${sy(s.lo[i])}`).reverse()].join(" ")
          return (
            <g key={s.stimulusId}>
              <polygon points={band} fill={c} opacity={0.15} />
              <polyline points={s.relT.map((x, i) => `${sx(x)},${sy(s.mean[i])}`).join(" ")} fill="none" stroke={c} strokeWidth={1.75} />
            </g>
          )
        })}
      </svg>
      <ul className="flex flex-wrap gap-4 text-xs">
        {stimuli.map((s, k) => (
          <li key={s.stimulusId} className="flex items-center gap-1.5 font-mono">
            <span className="size-2.5 rounded-sm" style={{ background: `var(${PALETTE[k % PALETTE.length]})` }} aria-hidden />
            {s.stimulusId} <span className="text-muted-foreground">n={s.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-mono text-sm tabular">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function EventTable({ rows, head, onSeek }: { rows: { id: number; frame: number; cells: string[] }[]; head: string[]; onSeek: (f: number) => void }) {
  if (!rows.length) return null
  return (
    <Panel bodyClassName="max-h-64 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            {head.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onSeek(r.frame)}>
              <TableCell className="font-mono text-xs">{r.id}</TableCell>
              {r.cells.map((c, k) => (
                <TableCell key={k} className="font-mono text-xs tabular">
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  )
}

export function runsOf(mask: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && start < 0) start = i
    if (!mask[i] && start >= 0) {
      out.push([start, i - 1])
      start = -1
    }
  }
  if (start >= 0) out.push([start, mask.length - 1])
  return out
}

function count(a: ArrayLike<number>) {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i]) n++
  return n
}

function med(a: Float64Array) {
  const f = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y)
  return f.length ? f[Math.floor(f.length / 2)] : NaN
}

export type { Series }
