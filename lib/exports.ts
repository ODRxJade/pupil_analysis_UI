import { runsOf } from "@/components/analysis/stage-results"
import type { PipelineResults } from "./results"
import type { EyeSignal } from "./signal"
import { STAGES } from "./stages"
import type { AnalysisState, InferenceConfig, Session } from "./types"

export type ExportCategory = "Tables" | "Figures" | "Clips" | "Configuration"

export interface ExportItem {
  id: string
  fileName: string
  format: "CSV" | "SVG" | "JSON" | "MP4"
  category: ExportCategory
  units: string
  description: string
  available: boolean
  unavailableReason?: string
  backendRendered?: boolean
  build?: () => { content: string; type: string }
}

interface ExportContext {
  session: Session
  signal: EyeSignal
  results: PipelineResults
  analysis: AnalysisState
  config: InferenceConfig | undefined
  resolveColor: (c: string) => string
}

function cell(v: unknown) {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : ""
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n")
}

export function fileBase(session: Session) {
  return session.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

export function excludedIntervals(signal: EyeSignal, results: PipelineResults) {
  const rows: { start: number; end: number; reason: string }[] = []
  if (results.filter) {
    for (const [a, b] of runsOf(results.filter.excluded)) rows.push({ start: a, end: b, reason: "Excluded: below likelihood threshold" })
    for (const [a, b] of runsOf(results.filter.interpolated)) rows.push({ start: a, end: b, reason: "Interpolated gap" })
  } else {
    for (const [a, b] of runsOf(results.liveQuality.low)) rows.push({ start: a, end: b, reason: "Low-confidence predictions" })
  }
  return rows
    .sort((x, y) => x.start - y.start)
    .map((r) => ({ ...r, startSec: r.start / signal.fps, durationMs: ((r.end - r.start + 1) / signal.fps) * 1000 }))
}

export function processingConfig({ session, analysis, config }: Pick<ExportContext, "session" | "analysis" | "config">) {
  return {
    session: { id: session.id, label: session.label, recordingDate: session.recordingDate, footagePath: session.footagePath },
    video: session.video,
    roi: session.roi,
    model: config
      ? { dlcConfigPath: config.dlcConfigPath, snapshot: config.snapshot, engine: config.engine, likelihoodThreshold: config.likelihoodThreshold }
      : null,
    stages: Object.fromEntries(
      STAGES.map((s) => [
        s.id,
        analysis.stages[s.id].lastRun
          ? { lastRun: new Date(analysis.stages[s.id].lastRun!.at).toISOString(), config: analysis.stages[s.id].lastRun!.configUsed }
          : null,
      ]),
    ),
    manualCorrections: Object.keys(analysis.corrections).length,
    excludedTrials: analysis.excludedTrials,
    history: analysis.history.map((h) => ({ ...h, at: new Date(h.at).toISOString() })),
    generatedBy: "Pupil Analysis UI (demo mode)",
  }
}

function lineFigure(
  title: string,
  unit: string,
  x: ArrayLike<number>,
  series: { label: string; values: ArrayLike<number>; color: string }[],
  xLabel: string,
) {
  const W = 900
  const H = 320
  const pad = { l: 64, r: 20, t: 40, b: 44 }
  const ys = series.flatMap((s) => Array.from(s.values)).filter(Number.isFinite)
  const xs = Array.from(x).filter(Number.isFinite)
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const sx = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b)
  const step = Math.max(1, Math.floor(x.length / 1500))
  const lines = series
    .map((s) => {
      const pts: string[] = []
      for (let i = 0; i < x.length; i += step) if (Number.isFinite(s.values[i])) pts.push(`${sx(x[i]).toFixed(1)},${sy(s.values[i]).toFixed(1)}`)
      return `<polyline fill="none" stroke="${s.color}" stroke-width="1.5" points="${pts.join(" ")}"/>`
    })
    .join("")
  const legend = series
    .map((s, k) => `<rect x="${pad.l + k * 140}" y="${H - 14}" width="10" height="10" fill="${s.color}"/><text x="${pad.l + k * 140 + 16}" y="${H - 5}">${s.label}</text>`)
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${pad.l}" y="22" font-size="14" font-weight="600">${title}</text>
<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="#999"/>
<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${H - pad.b}" stroke="#999"/>
<text x="${pad.l - 8}" y="${sy(y1) + 4}" text-anchor="end">${y1.toFixed(1)}</text>
<text x="${pad.l - 8}" y="${sy(y0) + 4}" text-anchor="end">${y0.toFixed(1)}</text>
<text x="14" y="${(H) / 2}" transform="rotate(-90 14 ${H / 2})" text-anchor="middle">${unit}</text>
<text x="${pad.l}" y="${H - pad.b + 16}">${x0.toFixed(1)}</text>
<text x="${W - pad.r}" y="${H - pad.b + 16}" text-anchor="end">${x1.toFixed(1)} ${xLabel}</text>
${lines}${legend}
</svg>`
}

export function buildExports(ctx: ExportContext): ExportItem[] {
  const { session, signal, results: r, analysis, resolveColor } = ctx
  const base = fileBase(session)
  const csv = (content: string) => ({ content, type: "text/csv" })
  const need = (stage: string) => `Run the ${stage} stage first.`
  const v = r.velocity
  const palette = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map(resolveColor)

  return [
    {
      id: "traces",
      fileName: `${base}_pupil_traces.csv`,
      format: "CSV",
      category: "Tables",
      units: v ? `frame, s, px, ${v.speedUnit}` : "frame, s, px",
      description: "Per-frame filtered pupil centre, diameter, velocity components, speed and exclusion flags.",
      available: !!r.filter,
      unavailableReason: need("filtering"),
      build: () =>
        csv(
          toCsv(
            ["frame", "time_s", "x_px", "y_px", "diameter_px", `vx_${v?.speedUnit ?? "na"}`, `vy_${v?.speedUnit ?? "na"}`, `speed_${v?.speedUnit ?? "na"}`, "excluded", "interpolated"],
            Array.from({ length: signal.frameCount }, (_, i) => [
              i,
              signal.t[i],
              r.filter!.x[i],
              r.filter!.y[i],
              r.filter!.d[i],
              v?.vx[i],
              v?.vy[i],
              v?.speed[i],
              r.filter!.excluded[i],
              r.filter!.interpolated[i],
            ]),
          ),
        ),
    },
    {
      id: "events",
      fileName: `${base}_fast_movements.csv`,
      format: "CSV",
      category: "Tables",
      units: v ? `frame, s, ms, ${v.speedUnit}, ${v.unit}` : "frame, s, ms",
      description: "Detected fast eye movements with onset, duration, peak speed and amplitude.",
      available: !!r.events && !!v,
      unavailableReason: need("fast-movement detection"),
      build: () =>
        csv(
          toCsv(
            ["id", "start_frame", "end_frame", "start_s", "duration_ms", `peak_speed_${v!.speedUnit}`, `amplitude_${v!.unit}`],
            r.events!.events.map((e) => [e.id, e.startFrame, e.endFrame, e.startTime, e.durationMs, e.peakSpeed, e.amplitude]),
          ),
        ),
    },
    {
      id: "blinks",
      fileName: `${base}_blinks.csv`,
      format: "CSV",
      category: "Tables",
      units: "frame, s, ms",
      description: "Blink intervals with duration and quality flags.",
      available: !!r.blinks,
      unavailableReason: need("blink detection"),
      build: () =>
        csv(toCsv(["id", "start_frame", "end_frame", "start_s", "duration_ms", "flags"], r.blinks!.map((b) => [b.id, b.startFrame, b.endFrame, b.startTime, b.durationMs, b.flags.join("; ")]))),
    },
    {
      id: "trials",
      fileName: `${base}_trial_summary.csv`,
      format: "CSV",
      category: "Tables",
      units: `px, ms, ${v?.speedUnit ?? "px/s"}, fraction`,
      description: "Per-trial baseline, peak diameter change, latency, motion counts, valid-sample fraction and exclusion status.",
      available: !!r.summary,
      unavailableReason: session.metadata ? need("trial summary") : "Attach stimulus metadata to enable trial outputs.",
      build: () =>
        csv(
          toCsv(
            ["trial", "stimulus_id", "baseline_px", "peak_change_px", "latency_ms", `mean_speed_${v?.speedUnit ?? "px_s"}`, "fast_movements", "blinks", "valid_fraction", "excluded", "exclusion_reason", "flags"],
            r.summary!.metrics.map((m) => [
              m.index,
              m.stimulusId,
              m.baseline,
              m.peakChange,
              m.latencyMs,
              m.meanSpeed,
              m.fastMovements,
              m.blinks,
              m.validFraction,
              analysis.excludedTrials[m.index] !== undefined ? 1 : 0,
              analysis.excludedTrials[m.index] ?? "",
              m.flags.join("; "),
            ]),
          ),
        ),
    },
    {
      id: "stimuli",
      fileName: `${base}_stimulus_summary.csv`,
      format: "CSV",
      category: "Tables",
      units: "px",
      description: "Mean peak diameter change and variability per stimulus across included trials.",
      available: !!r.summary,
      unavailableReason: session.metadata ? need("trial summary") : "Attach stimulus metadata to enable stimulus outputs.",
      build: () => {
        const variability = String(analysis.stages.summary.lastRun?.configUsed.variability ?? "sd")
        return csv(toCsv(["stimulus_id", "n_trials", "mean_peak_change_px", `variability_${variability}_px`], r.summary!.stimuli.map((s) => [s.stimulusId, s.n, s.meanPeakChange, s.variability])))
      },
    },
    {
      id: "quality",
      fileName: `${base}_excluded_intervals.csv`,
      format: "CSV",
      category: "Tables",
      units: "frame, s, ms",
      description: "Intervals excluded, interpolated or flagged as low confidence, with the reason for each.",
      available: true,
      build: () =>
        csv(toCsv(["start_frame", "end_frame", "start_s", "duration_ms", "reason"], excludedIntervals(signal, r).map((x) => [x.start, x.end, x.startSec, x.durationMs, x.reason]))),
    },
    {
      id: "fig-traces",
      fileName: `${base}_diameter_speed.svg`,
      format: "SVG",
      category: "Figures",
      units: "px over s",
      description: "Filtered pupil diameter across the full session.",
      available: !!r.filter,
      unavailableReason: need("filtering"),
      build: () => ({ content: lineFigure(`${session.label} · pupil diameter`, "diameter (px)", signal.t, [{ label: "diameter", values: r.filter!.d, color: palette[0] }], "s"), type: "image/svg+xml" }),
    },
    {
      id: "fig-stimuli",
      fileName: `${base}_stimulus_aligned.svg`,
      format: "SVG",
      category: "Figures",
      units: "px over s from onset",
      description: "Mean stimulus-aligned diameter for each stimulus.",
      available: !!r.summary && r.summary.stimuli.length > 0,
      unavailableReason: need("trial summary"),
      build: () => {
        const s = r.summary!.stimuli
        return {
          content: lineFigure(`${session.label} · stimulus-aligned diameter`, "Δ diameter (px)", s[0].relT, s.map((st, k) => ({ label: st.stimulusId, values: st.mean, color: palette[k % palette.length] })), "s from onset"),
          type: "image/svg+xml",
        }
      },
    },
    {
      id: "clip",
      fileName: `${base}_annotated.mp4`,
      format: "MP4",
      category: "Clips",
      units: `${signal.fps} fps`,
      description: "Video with landmarks, pupil fit, blink and fast-movement overlays. Rendered by the backend.",
      available: !!r.filter,
      unavailableReason: need("filtering"),
      backendRendered: true,
    },
    {
      id: "config",
      fileName: `${base}_processing_config.json`,
      format: "JSON",
      category: "Configuration",
      units: "—",
      description: "Model version, ROI, per-stage settings used at last run, corrections, exclusions and analysis history.",
      available: true,
      build: () => ({ content: JSON.stringify(processingConfig(ctx), null, 2), type: "application/json" }),
    },
  ]
}
