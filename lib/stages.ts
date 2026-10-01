import type { AnalysisState, Session, StageId } from "./types"

export type FieldDef =
  | {
      kind: "number"
      key: string
      label: string
      min: number
      max: number
      step: number
      unit?: string
      help?: string
      visibleIf?: (s: Record<string, unknown>) => boolean
    }
  | {
      kind: "select"
      key: string
      label: string
      options: { value: string; label: string; disabled?: boolean }[]
      help?: string
      visibleIf?: (s: Record<string, unknown>) => boolean
    }
  | {
      kind: "boolean"
      key: string
      label: string
      help?: string
      visibleIf?: (s: Record<string, unknown>) => boolean
    }

export interface StageDef {
  id: StageId
  letter: string
  title: string
  description: string
  deps: StageId[]
  needsMetadata?: boolean
  defaults: Record<string, unknown>
  fields: FieldDef[]
  runMs: number
}

export const STAGES: StageDef[] = [
  {
    id: "quality",
    letter: "A",
    title: "Landmark quality review",
    description: "Review DeepLabCut predictions, flag low-confidence frames and correct landmarks.",
    deps: [],
    defaults: { lowConfidenceThreshold: 0.9, minLowPoints: 3 },
    fields: [
      { kind: "number", key: "lowConfidenceThreshold", label: "Low-confidence threshold", min: 0, max: 1, step: 0.01, help: "Per-landmark likelihood below which a point is considered unreliable." },
      { kind: "number", key: "minLowPoints", label: "Low points to flag frame", min: 1, max: 8, step: 1, unit: "of 8", help: "Flag a frame when at least this many pupil landmarks fall below threshold." },
    ],
    runMs: 1200,
  },
  {
    id: "centre",
    letter: "B",
    title: "Pupil centre and diameter",
    description: "Fit the pupil boundary and derive centre position and diameter for each frame.",
    deps: ["quality"],
    defaults: { method: "ellipse_moments", diameterMeasure: "mean_axis", minPoints: 5 },
    fields: [
      {
        kind: "select",
        key: "method",
        label: "Centre method",
        options: [
          { value: "ellipse_moments", label: "Ellipse (second moments)" },
          { value: "circle_fit", label: "Circle fit (least squares)" },
          { value: "mean_of_points", label: "Mean of landmarks" },
        ],
      },
      {
        kind: "select",
        key: "diameterMeasure",
        label: "Diameter measure",
        options: [
          { value: "mean_axis", label: "Mean of major and minor axes" },
          { value: "major_axis", label: "Major axis" },
          { value: "area_equivalent", label: "Area-equivalent circle" },
        ],
      },
      { kind: "number", key: "minPoints", label: "Minimum confident landmarks", min: 3, max: 8, step: 1, unit: "points", help: "Frames with fewer confident pupil points are marked invalid." },
    ],
    runMs: 1600,
  },
  {
    id: "filter",
    letter: "C",
    title: "Filtering and smoothing",
    description: "Exclude low-likelihood samples, interpolate short gaps and smooth traces.",
    deps: ["centre"],
    defaults: { likelihoodThreshold: 0.9, maxGap: 2, smoothing: "savgol", window: 5, polyorder: 2 },
    fields: [
      { kind: "number", key: "likelihoodThreshold", label: "Likelihood filter", min: 0, max: 1, step: 0.01, help: "Samples with mean pupil likelihood below this value are excluded." },
      { kind: "number", key: "maxGap", label: "Maximum interpolated gap", min: 0, max: 20, step: 1, unit: "frames", help: "Only complete gaps of this length or shorter are linearly interpolated." },
      {
        kind: "select",
        key: "smoothing",
        label: "Smoothing method",
        options: [
          { value: "savgol", label: "Savitzky–Golay" },
          { value: "moving_average", label: "Centred moving average" },
          { value: "none", label: "None" },
        ],
      },
      { kind: "number", key: "window", label: "Window length", min: 3, max: 31, step: 2, unit: "frames", help: "Must be odd.", visibleIf: (s) => s.smoothing !== "none" },
      { kind: "number", key: "polyorder", label: "Polynomial order", min: 1, max: 5, step: 1, help: "Must be smaller than the window length.", visibleIf: (s) => s.smoothing === "savgol" },
    ],
    runMs: 1400,
  },
  {
    id: "velocity",
    letter: "D",
    title: "Displacement and velocity",
    description: "Compute X/Y displacement, velocity components and resultant speed.",
    deps: ["filter"],
    defaults: { timeSource: "timestamps", units: "px", derivative: "savgol" },
    fields: [
      {
        kind: "select",
        key: "timeSource",
        label: "Time base",
        options: [
          { value: "timestamps", label: "Recording timestamps" },
          { value: "frame_rate", label: "Configured frame rate" },
        ],
      },
      {
        kind: "select",
        key: "units",
        label: "Units",
        options: [
          { value: "px", label: "Pixels (original frame)" },
          { value: "mm", label: "Millimetres (requires calibration)" },
        ],
      },
      {
        kind: "select",
        key: "derivative",
        label: "Derivative",
        options: [
          { value: "savgol", label: "Savitzky–Golay derivative" },
          { value: "finite_difference", label: "Finite difference" },
        ],
      },
    ],
    runMs: 1100,
  },
  {
    id: "events",
    letter: "E",
    title: "Fast-movement events",
    description: "Detect samples exceeding a velocity threshold (I-VT).",
    deps: ["velocity"],
    defaults: { thresholdMethod: "sd", sdMultiplier: 5, fixedThreshold: 300, minDurationMs: 20, saccadeValidated: false },
    fields: [
      {
        kind: "select",
        key: "thresholdMethod",
        label: "Threshold",
        options: [
          { value: "sd", label: "Mean + k × SD of speed" },
          { value: "fixed", label: "Fixed value" },
        ],
      },
      { kind: "number", key: "sdMultiplier", label: "k (SD multiplier)", min: 1, max: 10, step: 0.5, visibleIf: (s) => s.thresholdMethod === "sd" },
      { kind: "number", key: "fixedThreshold", label: "Fixed threshold", min: 10, max: 2000, step: 10, unit: "px/s", visibleIf: (s) => s.thresholdMethod === "fixed" },
      { kind: "number", key: "minDurationMs", label: "Minimum event duration", min: 0, max: 200, step: 5, unit: "ms" },
      { kind: "boolean", key: "saccadeValidated", label: "Validated saccade classifier configured", help: "Leave off unless a validated classifier is in use. Detections are labelled “fast movements”." },
    ],
    runMs: 900,
  },
  {
    id: "blinks",
    letter: "F",
    title: "Blink detection",
    description: "Detect blinks from eyelid aperture and landmark confidence.",
    deps: ["quality"],
    defaults: { likelihoodThreshold: 0.5, apertureFraction: 0.4, minDurationMs: 60, mergeGapMs: 50 },
    fields: [
      { kind: "number", key: "likelihoodThreshold", label: "Confidence threshold", min: 0, max: 1, step: 0.05 },
      { kind: "number", key: "apertureFraction", label: "Eyelid aperture fraction", min: 0.05, max: 0.9, step: 0.05, help: "Fraction of open-eye aperture below which the eye is considered closed." },
      { kind: "number", key: "minDurationMs", label: "Minimum duration", min: 0, max: 500, step: 10, unit: "ms" },
      { kind: "number", key: "mergeGapMs", label: "Merge gaps shorter than", min: 0, max: 300, step: 10, unit: "ms" },
    ],
    runMs: 1000,
  },
  {
    id: "flow",
    letter: "G",
    title: "Optical flow",
    description: "Estimate image motion within the analysis region.",
    deps: ["quality"],
    defaults: { algorithm: "farneback", region: "roi", pyrScale: 0.5, levels: 3, winSize: 15, iterations: 3, maxCorners: 50 },
    fields: [
      {
        kind: "select",
        key: "algorithm",
        label: "Algorithm",
        options: [
          { value: "farneback", label: "Farnebäck (dense)" },
          { value: "lucas_kanade", label: "Lucas–Kanade (sparse)" },
        ],
      },
      {
        kind: "select",
        key: "region",
        label: "Analysis region",
        options: [
          { value: "roi", label: "Full ROI" },
          { value: "pupil", label: "Pupil neighbourhood" },
          { value: "eyelid", label: "Eyelid margin" },
        ],
      },
      { kind: "number", key: "pyrScale", label: "Pyramid scale", min: 0.1, max: 0.9, step: 0.1, visibleIf: (s) => s.algorithm === "farneback" },
      { kind: "number", key: "levels", label: "Pyramid levels", min: 1, max: 6, step: 1 },
      { kind: "number", key: "winSize", label: "Window size", min: 5, max: 41, step: 2, unit: "px" },
      { kind: "number", key: "iterations", label: "Iterations", min: 1, max: 10, step: 1, visibleIf: (s) => s.algorithm === "farneback" },
      { kind: "number", key: "maxCorners", label: "Max tracked corners", min: 10, max: 200, step: 10, visibleIf: (s) => s.algorithm === "lucas_kanade" },
    ],
    runMs: 4200,
  },
  {
    id: "align",
    letter: "H",
    title: "Stimulus and trial alignment",
    description: "Align traces to stimulus onsets and extract peri-stimulus windows.",
    deps: ["filter", "velocity"],
    needsMetadata: true,
    defaults: { preSec: 2, postSec: 6, toleranceMs: 30 },
    fields: [
      { kind: "number", key: "preSec", label: "Pre-stimulus window", min: 0.5, max: 5, step: 0.5, unit: "s" },
      { kind: "number", key: "postSec", label: "Post-stimulus window", min: 1, max: 8, step: 0.5, unit: "s" },
      { kind: "number", key: "toleranceMs", label: "Timing tolerance", min: 5, max: 200, step: 5, unit: "ms", help: "Onsets misaligned with eye timestamps by more than this are flagged." },
    ],
    runMs: 1000,
  },
  {
    id: "summary",
    letter: "I",
    title: "Trial and stimulus summaries",
    description: "Per-trial metrics and stimulus-grouped aggregate traces.",
    deps: ["align", "events", "blinks"],
    needsMetadata: true,
    defaults: { variability: "sem", baselineCorrection: true },
    fields: [
      {
        kind: "select",
        key: "variability",
        label: "Variability measure",
        options: [
          { value: "sem", label: "Standard error of the mean" },
          { value: "sd", label: "Standard deviation" },
          { value: "ci95", label: "95% confidence interval" },
        ],
      },
      { kind: "boolean", key: "baselineCorrection", label: "Baseline-correct traces", help: "Subtract the mean pre-stimulus diameter from each trial." },
    ],
    runMs: 900,
  },
]

export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>

export type StageStatus = "blocked" | "ready" | "complete" | "outdated" | "modified" | "failed"

export interface StageStatusInfo {
  status: StageStatus
  reason: string | null
}

function sameConfig(a: Record<string, unknown>, b: Record<string, unknown>) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function stageConfig(state: AnalysisState, id: StageId): Record<string, unknown> {
  const settings = state.stages[id].settings
  if (id === "quality") return { ...settings, corrections: Object.keys(state.corrections).length, correctionsHash: hashCorrections(state.corrections) }
  return settings
}

function hashCorrections(c: Record<number, { x: number; y: number }>) {
  return Object.entries(c)
    .map(([k, v]) => `${k}:${v.x.toFixed(1)},${v.y.toFixed(1)}`)
    .join("|")
}

export function computeStatuses(state: AnalysisState, session: Session): Record<StageId, StageStatusInfo> {
  const out = {} as Record<StageId, StageStatusInfo>
  for (const def of STAGES) {
    const rec = state.stages[def.id]
    if (def.needsMetadata && !session.metadata) {
      out[def.id] = { status: "blocked", reason: "No stimulus metadata — full-recording analysis only" }
      continue
    }
    const unmet = def.deps.filter((d) => !["complete"].includes(out[d]?.status ?? ""))
    if (rec.failed) {
      out[def.id] = { status: "failed", reason: rec.failed }
      continue
    }
    if (!rec.lastRun) {
      out[def.id] = unmet.length
        ? { status: "blocked", reason: `Requires ${unmet.map((d) => STAGE_MAP[d].letter).join(", ")}` }
        : { status: "ready", reason: null }
      continue
    }
    const staleDep = def.deps.find((d) => {
      const depRun = state.stages[d].lastRun
      return !depRun || depRun.at > rec.lastRun!.at || out[d].status === "outdated" || out[d].status === "modified"
    })
    if (staleDep) {
      out[def.id] = { status: "outdated", reason: `Upstream stage ${STAGE_MAP[staleDep].letter} changed` }
      continue
    }
    if (!sameConfig(stageConfig(state, def.id), rec.lastRun.configUsed)) {
      out[def.id] = { status: "modified", reason: "Settings changed since last run" }
      continue
    }
    out[def.id] = { status: "complete", reason: null }
  }
  return out
}

export function canRun(statuses: Record<StageId, StageStatusInfo>, id: StageId) {
  const def = STAGE_MAP[id]
  if (statuses[id].status === "blocked" && def.needsMetadata) return false
  return def.deps.every((d) => statuses[d].status === "complete")
}
