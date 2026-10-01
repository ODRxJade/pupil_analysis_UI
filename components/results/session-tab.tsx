"use client"

import { EmptyState, Panel } from "@/components/page-header"
import { EventTable, Stats, count, med, runsOf } from "@/components/analysis/stage-results"
import { TracePlot, type Interval } from "@/components/viewer/trace-plot"
import { fmt, formatDuration } from "@/lib/format"
import type { PipelineResults } from "@/lib/results"
import type { EyeSignal } from "@/lib/signal"

export function SessionTab({ signal, results: r, frame, onSeek }: { signal: EyeSignal; results: PipelineResults; frame: number; onSeek: (f: number) => void }) {
  if (!r.filter) return <EmptyState title="No filtered traces yet" description="Run quality review, pupil centre and filtering in Analysis to populate session results." />
  const common = { frameCount: signal.frameCount, fps: signal.fps, frame, onSeek }
  const v = r.velocity
  const blinkIntervals: Interval[] = (r.blinks ?? []).map((b) => ({ start: b.startFrame, end: b.endFrame, color: "--chart-3", label: "blink" }))
  const eventIntervals: Interval[] = (r.events?.events ?? []).map((e) => ({ start: e.startFrame, end: e.endFrame, color: "--chart-5", label: "fast movement" }))
  const excludedPct = (count(r.filter.excluded) / signal.frameCount) * 100

  return (
    <div className="flex flex-col gap-4">
      <Stats
        items={[
          ["Duration", `${formatDuration(signal.frameCount / signal.fps)} · ${signal.frameCount.toLocaleString()} frames @ ${signal.fps} fps`],
          ["Median pupil diameter", `${fmt(med(r.filter.d), 1)} px`],
          ["Excluded samples", `${fmt(excludedPct, 1)}%`],
          ["Fast movements", r.events ? String(r.events.events.length) : "Not run"],
          ["Blinks", r.blinks ? String(r.blinks.length) : "Not run"],
          ["Speed threshold", r.events && v ? `${fmt(r.events.threshold, 1)} ${v.speedUnit}` : "Not run"],
        ]}
      />
      <Panel title="Pupil diameter and position" description="Filtered traces. Shaded amber regions are blinks. Click a plot to move the cursor." bodyClassName="flex flex-col gap-4 p-4">
        <TracePlot {...common} title="Pupil diameter" unit="px" series={[{ label: "diameter", values: r.filter.d, color: "--chart-1", width: 1.5 }]} intervals={blinkIntervals} />
        <TracePlot {...common} title="Pupil position" unit="px" series={[{ label: "x", values: r.filter.x, color: "--chart-2" }, { label: "y", values: r.filter.y, color: "--chart-3" }]} intervals={blinkIntervals} />
      </Panel>
      {v ? (
        <Panel title="Velocity" description={`Derived from filtered position. Units: ${v.speedUnit}. Shaded regions are detected fast movements.`} bodyClassName="flex flex-col gap-4 p-4">
          <TracePlot {...common} title="Velocity components" unit={v.speedUnit} series={[{ label: "vx", values: v.vx, color: "--chart-2" }, { label: "vy", values: v.vy, color: "--chart-3" }]} />
          <TracePlot
            {...common}
            title="Resultant speed"
            unit={v.speedUnit}
            series={[{ label: "speed", values: v.speed, color: "--chart-1" }]}
            intervals={eventIntervals}
            hline={r.events ? { value: r.events.threshold, color: "--destructive", label: "threshold" } : undefined}
          />
        </Panel>
      ) : (
        <Panel title="Velocity">
          <EmptyState title="Velocity not computed" description="Run the velocity stage in Analysis." />
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Fast movements</h3>
          {r.events && v && r.events.events.length ? (
            <EventTable
              head={["Onset (s)", "Duration (ms)", `Peak (${v.speedUnit})`, `Amplitude (${v.unit})`]}
              rows={r.events.events.map((e) => ({ id: e.id, frame: e.startFrame, cells: [fmt(e.startTime, 2), fmt(e.durationMs, 0), fmt(e.peakSpeed, 1), fmt(e.amplitude, 2)] }))}
              onSeek={onSeek}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{r.events ? "No fast movements above threshold." : "Run fast-movement detection to list events."}</p>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Blinks</h3>
          {r.blinks && r.blinks.length ? (
            <EventTable
              head={["Onset (s)", "Duration (ms)", "Flags"]}
              rows={r.blinks.map((b) => ({ id: b.id, frame: b.startFrame, cells: [fmt(b.startTime, 2), fmt(b.durationMs, 0), b.flags.join(", ") || "—"] }))}
              onSeek={onSeek}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{r.blinks ? "No blinks detected." : "Run blink detection to list blinks."}</p>
          )}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Cursor at frame {frame} · {fmt(signal.t[frame] ?? frame / signal.fps, 2)} s · {runsOf(r.filter.excluded).length} excluded intervals
      </p>
    </div>
  )
}
