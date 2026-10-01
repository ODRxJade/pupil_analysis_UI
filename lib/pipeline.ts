import type { EyeSignal, Trial } from "./signal"

export interface QualitySettings {
  lowConfidenceThreshold: number
  minLowPoints: number
}
export interface CentreSettings {
  method: "ellipse_moments" | "circle_fit" | "mean_of_points"
  diameterMeasure: "major_axis" | "mean_axis" | "area_equivalent"
  minPoints: number
}
export interface FilterSettings {
  likelihoodThreshold: number
  maxGap: number
  smoothing: "savgol" | "moving_average" | "none"
  window: number
  polyorder: number
}
export interface VelocitySettings {
  timeSource: "timestamps" | "frame_rate"
  units: "px" | "mm"
  derivative: "savgol" | "finite_difference"
}
export interface EventSettings {
  thresholdMethod: "sd" | "fixed"
  sdMultiplier: number
  fixedThreshold: number
  minDurationMs: number
  saccadeValidated: boolean
}
export interface BlinkSettings {
  likelihoodThreshold: number
  apertureFraction: number
  minDurationMs: number
  mergeGapMs: number
}
export interface FlowSettings {
  algorithm: "farneback" | "lucas_kanade"
  region: "roi" | "pupil" | "eyelid"
  pyrScale: number
  levels: number
  winSize: number
  iterations: number
  maxCorners: number
}
export interface AlignSettings {
  preSec: number
  postSec: number
  toleranceMs: number
}
export interface SummarySettings {
  variability: "sd" | "sem" | "ci95"
  baselineCorrection: boolean
}

export interface QualityResult {
  meanLik: Float32Array
  minLik: Float32Array
  low: Uint8Array
  lowCount: number
  perLandmark: number[]
}

export function computeQuality(sig: EyeSignal, s: QualitySettings): QualityResult {
  const n = sig.frameCount
  const meanLik = new Float32Array(n)
  const minLik = new Float32Array(n)
  const low = new Uint8Array(n)
  let lowCount = 0
  const perLandmark = sig.pupilL.map(() => 0)
  for (let i = 0; i < n; i++) {
    let sum = 0
    let min = 1
    let lowPts = 0
    for (let p = 0; p < sig.pupilL.length; p++) {
      const l = sig.pupilL[p][i]
      sum += l
      perLandmark[p] += l
      if (l < min) min = l
      if (l < s.lowConfidenceThreshold) lowPts++
    }
    meanLik[i] = sum / sig.pupilL.length
    minLik[i] = min
    if (lowPts >= s.minLowPoints) {
      low[i] = 1
      lowCount++
    }
  }
  return { meanLik, minLik, low, lowCount, perLandmark: perLandmark.map((v) => v / n) }
}

export interface CentreResult {
  x: Float64Array
  y: Float64Array
  diam: Float64Array
  major: Float64Array
  minor: Float64Array
  angle: Float64Array
  invalidCount: number
  corrected: Uint8Array
}

export function computeCentre(
  sig: EyeSignal,
  s: CentreSettings,
  likelihoodThreshold: number,
  corrections: Record<number, { x: number; y: number }>,
): CentreResult {
  const n = sig.frameCount
  const x = new Float64Array(n).fill(NaN)
  const y = new Float64Array(n).fill(NaN)
  const diam = new Float64Array(n).fill(NaN)
  const major = new Float64Array(n).fill(NaN)
  const minor = new Float64Array(n).fill(NaN)
  const angle = new Float64Array(n).fill(0)
  const corrected = new Uint8Array(n)
  let invalidCount = 0
  const px: number[] = []
  const py: number[] = []
  for (let i = 0; i < n; i++) {
    px.length = 0
    py.length = 0
    for (let p = 0; p < sig.pupilX.length; p++) {
      if (sig.pupilL[p][i] >= likelihoodThreshold) {
        px.push(sig.pupilX[p][i])
        py.push(sig.pupilY[p][i])
      }
    }
    if (px.length < s.minPoints) {
      invalidCount++
      continue
    }
    let cx = 0
    let cy = 0
    for (let k = 0; k < px.length; k++) {
      cx += px[k]
      cy += py[k]
    }
    cx /= px.length
    cy /= px.length
    if (s.method === "circle_fit") {
      const fit = kasaCircle(px, py)
      if (fit) {
        cx = fit.cx
        cy = fit.cy
      }
    }
    let sxx = 0
    let syy = 0
    let sxy = 0
    for (let k = 0; k < px.length; k++) {
      const dx = px[k] - cx
      const dy = py[k] - cy
      sxx += dx * dx
      syy += dy * dy
      sxy += dx * dy
    }
    sxx /= px.length
    syy /= px.length
    sxy /= px.length
    const tr = sxx + syy
    const det = sxx * syy - sxy * sxy
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    const l1 = tr / 2 + disc
    const l2 = Math.max(tr / 2 - disc, 0)
    const a = Math.sqrt(2 * l1)
    const b = Math.sqrt(2 * l2)
    major[i] = 2 * a
    minor[i] = 2 * b
    angle[i] = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    diam[i] = s.diameterMeasure === "major_axis" ? 2 * a : s.diameterMeasure === "mean_axis" ? a + b : 2 * Math.sqrt(a * b)
    x[i] = cx
    y[i] = cy
  }
  for (const [frameKey, c] of Object.entries(corrections)) {
    const i = Number(frameKey)
    if (i < 0 || i >= n) continue
    x[i] = c.x
    y[i] = c.y
    if (Number.isNaN(diam[i])) {
      diam[i] = sig.trueDiam[i]
      major[i] = sig.trueDiam[i]
      minor[i] = sig.trueDiam[i]
    }
    corrected[i] = 1
  }
  return { x, y, diam, major, minor, angle, invalidCount, corrected }
}

function kasaCircle(xs: number[], ys: number[]) {
  const n = xs.length
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i]
    const y = ys[i]
    const z = x * x + y * y
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
    sxz += x * z
    syz += y * z
    sz += z
  }
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ]
  const rhs = [-sxz, -syz, -sz]
  const sol = solve3(m, rhs)
  if (!sol) return null
  return { cx: -sol[0] / 2, cy: -sol[1] / 2 }
}

function solve3(m: number[][], b: number[]) {
  const a = m.map((row, i) => [...row, b[i]])
  for (let c = 0; c < 3; c++) {
    let pivot = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r
    if (Math.abs(a[pivot][c]) < 1e-12) return null
    ;[a[c], a[pivot]] = [a[pivot], a[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = a[r][c] / a[c][c]
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k]
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]]
}

function invert(matrix: number[][]) {
  const size = matrix.length
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: size }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < size; c++) {
    let pivot = c
    for (let r = c + 1; r < size; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r
    ;[a[c], a[pivot]] = [a[pivot], a[c]]
    const div = a[c][c]
    for (let k = 0; k < 2 * size; k++) a[c][k] /= div
    for (let r = 0; r < size; r++) {
      if (r === c) continue
      const f = a[r][c]
      for (let k = 0; k < 2 * size; k++) a[r][k] -= f * a[c][k]
    }
  }
  return a.map((row) => row.slice(size))
}

function factorial(k: number) {
  let f = 1
  for (let i = 2; i <= k; i++) f *= i
  return f
}

/** Savitzky-Golay evaluated at offset `s` within a window of half-width h. */
function savgolWeights(h: number, poly: number, deriv: number, s: number, delta: number) {
  const m = 2 * h + 1
  const ata = Array.from({ length: poly + 1 }, () => new Array(poly + 1).fill(0))
  for (let j = -h; j <= h; j++) {
    for (let r = 0; r <= poly; r++) for (let c = 0; c <= poly; c++) ata[r][c] += j ** (r + c)
  }
  const inv = invert(ata)
  const weights = new Array(m).fill(0)
  for (let j = -h; j <= h; j++) {
    let w = 0
    for (let k = deriv; k <= poly; k++) {
      const basis = (factorial(k) / factorial(k - deriv)) * s ** (k - deriv)
      let coef = 0
      for (let q = 0; q <= poly; q++) coef += inv[k][q] * j ** q
      w += basis * coef
    }
    weights[j + h] = w / delta ** deriv
  }
  return weights
}

function segments(values: Float64Array) {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= values.length; i++) {
    const ok = i < values.length && Number.isFinite(values[i])
    if (ok && start < 0) start = i
    if (!ok && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  return out
}

export function segmentedSavgol(values: Float64Array, window: number, poly: number, deriv: number, delta: number) {
  const out = new Float64Array(values.length).fill(NaN)
  const h = Math.floor(window / 2)
  const centre = savgolWeights(h, poly, deriv, 0, delta)
  const edgeCache = new Map<number, number[]>()
  const edge = (s: number) => {
    let w = edgeCache.get(s)
    if (!w) {
      w = savgolWeights(h, poly, deriv, s, delta)
      edgeCache.set(s, w)
    }
    return w
  }
  for (const [start, end] of segments(values)) {
    if (end - start < window) continue
    for (let i = start; i < end; i++) {
      let anchor = i
      if (i - h < start) anchor = start + h
      if (i + h >= end) anchor = end - 1 - h
      const w = anchor === i ? centre : edge(i - anchor)
      let acc = 0
      for (let j = -h; j <= h; j++) acc += w[j + h] * values[anchor + j]
      out[i] = acc
    }
  }
  return out
}

function movingAverage(values: Float64Array, window: number) {
  const out = new Float64Array(values.length).fill(NaN)
  const h = Math.floor(window / 2)
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue
    let sum = 0
    let count = 0
    for (let j = i - h; j <= i + h; j++) {
      if (j >= 0 && j < values.length && Number.isFinite(values[j])) {
        sum += values[j]
        count++
      }
    }
    out[i] = sum / count
  }
  return out
}

function interpolateShortGaps(values: Float64Array, maxGap: number, flags: Uint8Array) {
  const out = Float64Array.from(values)
  let i = 0
  while (i < out.length) {
    if (Number.isFinite(out[i])) {
      i++
      continue
    }
    const start = i
    while (i < out.length && !Number.isFinite(out[i])) i++
    const end = i
    const len = end - start
    if (start > 0 && end < out.length && len <= maxGap) {
      const a = out[start - 1]
      const b = out[end]
      for (let k = start; k < end; k++) {
        out[k] = a + ((b - a) * (k - start + 1)) / (len + 1)
        flags[k] = 1
      }
    }
  }
  return out
}

export interface FilterResult {
  rawX: Float64Array
  rawY: Float64Array
  rawD: Float64Array
  x: Float64Array
  y: Float64Array
  d: Float64Array
  excluded: Uint8Array
  interpolated: Uint8Array
  excludedCount: number
  interpolatedCount: number
}

export function computeFilter(centre: CentreResult, quality: QualityResult, s: FilterSettings): FilterResult {
  const n = centre.x.length
  const excluded = new Uint8Array(n)
  const interpolated = new Uint8Array(n)
  const mx = new Float64Array(n)
  const my = new Float64Array(n)
  const md = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const bad = (quality.meanLik[i] < s.likelihoodThreshold && !centre.corrected[i]) || !Number.isFinite(centre.x[i])
    mx[i] = bad ? NaN : centre.x[i]
    my[i] = bad ? NaN : centre.y[i]
    md[i] = bad ? NaN : centre.diam[i]
  }
  const fx = interpolateShortGaps(mx, s.maxGap, interpolated)
  const fy = interpolateShortGaps(my, s.maxGap, interpolated)
  const fd = interpolateShortGaps(md, s.maxGap, interpolated)
  let excludedCount = 0
  let interpolatedCount = 0
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(fx[i])) {
      excluded[i] = 1
      excludedCount++
    }
    if (interpolated[i]) interpolatedCount++
  }
  const smooth = (v: Float64Array) =>
    s.smoothing === "savgol"
      ? segmentedSavgol(v, s.window, s.polyorder, 0, 1)
      : s.smoothing === "moving_average"
        ? movingAverage(v, s.window)
        : Float64Array.from(v)
  return {
    rawX: centre.x,
    rawY: centre.y,
    rawD: centre.diam,
    x: smooth(fx),
    y: smooth(fy),
    d: smooth(fd),
    excluded,
    interpolated,
    excludedCount,
    interpolatedCount,
  }
}

export interface VelocityResult {
  t: Float64Array
  dx: Float64Array
  dy: Float64Array
  vx: Float64Array
  vy: Float64Array
  speed: Float64Array
  unit: string
  speedUnit: string
  scale: number
}

function median(values: Float64Array) {
  const finite = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b)
  return finite.length ? finite[Math.floor(finite.length / 2)] : 0
}

export function computeVelocity(
  sig: EyeSignal,
  filtered: FilterResult,
  s: VelocitySettings,
  pxPerMm: number | null,
  filterSettings: FilterSettings,
): VelocityResult {
  const n = filtered.x.length
  const t = s.timeSource === "timestamps" ? sig.t : Float64Array.from({ length: n }, (_, i) => i / sig.fps)
  const useMm = s.units === "mm" && pxPerMm
  const scale = useMm ? 1 / pxPerMm : 1
  const unit = useMm ? "mm" : "px"
  const mxv = median(filtered.x)
  const myv = median(filtered.y)
  const dx = filtered.x.map((v) => (v - mxv) * scale)
  const dy = filtered.y.map((v) => (v - myv) * scale)
  const dt = 1 / sig.fps
  let vx: Float64Array
  let vy: Float64Array
  if (s.derivative === "savgol") {
    const minWin = filterSettings.polyorder + 1 + ((filterSettings.polyorder + 1) % 2 === 0 ? 1 : 0)
    const win = Math.max(filterSettings.window, minWin)
    vx = segmentedSavgol(dx, win, filterSettings.polyorder, 1, dt)
    vy = segmentedSavgol(dy, win, filterSettings.polyorder, 1, dt)
  } else {
    vx = new Float64Array(n).fill(NaN)
    vy = new Float64Array(n).fill(NaN)
    for (let i = 1; i < n; i++) {
      const step = t[i] - t[i - 1] || dt
      vx[i] = (dx[i] - dx[i - 1]) / step
      vy[i] = (dy[i] - dy[i - 1]) / step
    }
  }
  if (s.timeSource === "timestamps" && s.derivative === "savgol") {
    for (let i = 1; i < n; i++) {
      const ratio = dt / Math.max(t[i] - t[i - 1], 1e-4)
      vx[i] *= ratio
      vy[i] *= ratio
    }
  }
  const speed = new Float64Array(n)
  for (let i = 0; i < n; i++) speed[i] = Math.hypot(vx[i], vy[i])
  return { t, dx, dy, vx, vy, speed, unit, speedUnit: `${unit}/s`, scale }
}

export interface MovementEvent {
  id: number
  startFrame: number
  endFrame: number
  startTime: number
  durationMs: number
  peakSpeed: number
  amplitude: number
}

export interface EventResult {
  threshold: number
  mean: number
  sd: number
  events: MovementEvent[]
  histogram: { bin: number; count: number }[]
  label: string
}

export function computeEvents(vel: VelocityResult, s: EventSettings, fps: number): EventResult {
  const finite = Array.from(vel.speed).filter(Number.isFinite)
  const mean = finite.reduce((a, b) => a + b, 0) / Math.max(finite.length, 1)
  const sd = Math.sqrt(finite.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(finite.length, 1))
  const threshold = s.thresholdMethod === "sd" ? mean + s.sdMultiplier * sd : s.fixedThreshold * vel.scale
  const minFrames = Math.max(1, Math.round((s.minDurationMs / 1000) * fps))
  const events: MovementEvent[] = []
  let start = -1
  for (let i = 0; i <= vel.speed.length; i++) {
    const above = i < vel.speed.length && vel.speed[i] > threshold
    if (above && start < 0) start = i
    if (!above && start >= 0) {
      if (i - start >= minFrames) {
        let peak = 0
        for (let k = start; k < i; k++) peak = Math.max(peak, vel.speed[k])
        const s0 = Math.max(start - 1, 0)
        const amp = Math.hypot(vel.dx[i] - vel.dx[s0], vel.dy[i] - vel.dy[s0])
        events.push({
          id: events.length + 1,
          startFrame: start,
          endFrame: i - 1,
          startTime: vel.t[start],
          durationMs: ((i - start) / fps) * 1000,
          peakSpeed: peak,
          amplitude: Number.isFinite(amp) ? amp : NaN,
        })
      }
      start = -1
    }
  }
  const sorted = [...finite].sort((a, b) => a - b)
  const p995 = sorted[Math.floor(sorted.length * 0.995)] ?? threshold
  const top = Math.max(threshold * 1.4, p995 * 1.1, 1e-6)
  const bins = 48
  const width = top / bins
  const histogram = Array.from({ length: bins }, (_, b) => ({ bin: (b + 0.5) * width, count: 0 }))
  for (const v of finite) {
    const b = Math.min(bins - 1, Math.floor(v / width))
    histogram[b].count++
  }
  return {
    threshold,
    mean,
    sd,
    events,
    histogram,
    label: s.saccadeValidated ? "Saccade" : "Fast movement",
  }
}

export interface Blink {
  id: number
  startFrame: number
  endFrame: number
  startTime: number
  durationMs: number
  flags: string[]
}

export function computeBlinks(sig: EyeSignal, quality: QualityResult, s: BlinkSettings): Blink[] {
  const n = sig.frameCount
  const fps = sig.fps
  const openAp = sig.lidHalfH * 2
  const flagged = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const ap = (sig.lidY[1][i] - sig.lidY[0][i]) / openAp
    if (quality.meanLik[i] < s.likelihoodThreshold || ap < s.apertureFraction) flagged[i] = 1
  }
  const mergeFrames = Math.round((s.mergeGapMs / 1000) * fps)
  const raw: [number, number][] = []
  let start = -1
  for (let i = 0; i <= n; i++) {
    const on = i < n && flagged[i] === 1
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      const last = raw[raw.length - 1]
      if (last && start - last[1] <= mergeFrames) last[1] = i
      else raw.push([start, i])
      start = -1
    }
  }
  const minFrames = Math.round((s.minDurationMs / 1000) * fps)
  return raw
    .filter(([a, b]) => b - a >= minFrames)
    .map(([a, b], idx) => {
      const flags: string[] = []
      const durationMs = ((b - a) / fps) * 1000
      if (durationMs > 450) flags.push("Long — check for occlusion")
      let minAp = 1
      for (let i = a; i < b; i++) minAp = Math.min(minAp, (sig.lidY[1][i] - sig.lidY[0][i]) / openAp)
      if (minAp > s.apertureFraction) flags.push("Confidence-only (eyelid open)")
      if (a === 0 || b >= n) flags.push("Touches recording edge")
      return { id: idx + 1, startFrame: a, endFrame: b - 1, startTime: sig.t[a], durationMs, flags }
    })
}

export interface FlowResult {
  magnitude: Float64Array
  meanMagnitude: number
  peakMagnitude: number
  activeFraction: number
}

export function computeFlow(sig: EyeSignal, vel: VelocityResult, s: FlowSettings): FlowResult {
  const n = sig.frameCount
  const magnitude = new Float64Array(n)
  const noiseScale = s.algorithm === "farneback" ? 0.08 : 0.14
  const regionGain = s.region === "pupil" ? 1.1 : s.region === "eyelid" ? 0.6 : 0.85
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  let sum = 0
  let peak = 0
  let active = 0
  for (let i = 0; i < n; i++) {
    const spd = Number.isFinite(vel.speed[i]) ? vel.speed[i] / sig.fps / vel.scale : 0
    const lid = i > 0 ? Math.abs(sig.aperture[i] - sig.aperture[i - 1]) * sig.lidHalfH : 0
    const smoothing = 1 - 0.04 * Math.min(s.winSize, 25) / 25
    const m = (spd * regionGain + lid * (s.region === "pupil" ? 0.3 : 1.2)) * smoothing + rand() * noiseScale
    magnitude[i] = m
    sum += m
    peak = Math.max(peak, m)
    if (m > 1) active++
  }
  return { magnitude, meanMagnitude: sum / n, peakMagnitude: peak, activeFraction: active / n }
}

export interface AlignedTrial extends Trial {
  onsetFrame: number
  offsetFrame: number
  flags: string[]
  relT: number[]
  diam: number[]
  speed: number[]
}

export function computeAlignment(
  sig: EyeSignal,
  trials: Trial[],
  filtered: FilterResult,
  vel: VelocityResult,
  s: AlignSettings,
): AlignedTrial[] {
  const fps = sig.fps
  const pre = Math.round(s.preSec * fps)
  const post = Math.round(s.postSec * fps)
  const nearestFrame = (time: number) => {
    let lo = 0
    let hi = sig.t.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sig.t[mid] < time) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  return trials.map((trial) => {
    const onsetFrame = nearestFrame(trial.onset)
    const offsetFrame = nearestFrame(trial.offset)
    const flags: string[] = []
    if (trial.timingMismatchMs !== null && trial.timingMismatchMs > s.toleranceMs)
      flags.push(`Onset mismatch ${trial.timingMismatchMs} ms`)
    if (trial.missingTimestamps) flags.push("Dropped eye timestamps in window")
    if (onsetFrame - pre < 0 || onsetFrame + post >= sig.frameCount) flags.push("Window exceeds recording")
    const relT: number[] = []
    const diam: number[] = []
    const speed: number[] = []
    for (let k = -pre; k <= post; k++) {
      const i = onsetFrame + k
      relT.push(k / fps)
      diam.push(i >= 0 && i < sig.frameCount ? filtered.d[i] : NaN)
      speed.push(i >= 0 && i < sig.frameCount ? vel.speed[i] : NaN)
    }
    return { ...trial, onsetFrame, offsetFrame, flags, relT, diam, speed }
  })
}

export interface TrialMetric {
  index: number
  stimulusId: string
  baseline: number
  peakChange: number
  latencyMs: number
  meanSpeed: number
  fastMovements: number
  blinks: number
  validFraction: number
  flags: string[]
}

export interface StimulusSummary {
  stimulusId: string
  n: number
  meanPeakChange: number
  variability: number
  relT: number[]
  mean: number[]
  lo: number[]
  hi: number[]
}

export function computeSummary(
  aligned: AlignedTrial[],
  events: EventResult,
  blinks: Blink[],
  s: SummarySettings,
  excluded: Record<number, string>,
  fps: number,
  preSec: number,
): { metrics: TrialMetric[]; stimuli: StimulusSummary[] } {
  const preFrames = Math.round(preSec * fps)
  const metrics = aligned.map((trial) => {
    const baseVals = trial.diam.slice(0, preFrames).filter(Number.isFinite)
    const baseline = baseVals.length ? baseVals.reduce((a, b) => a + b, 0) / baseVals.length : NaN
    let peak = 0
    let peakIdx = preFrames
    for (let k = preFrames; k < trial.diam.length; k++) {
      const d = trial.diam[k] - baseline
      if (Number.isFinite(d) && Math.abs(d) > Math.abs(peak)) {
        peak = d
        peakIdx = k
      }
    }
    const speeds = trial.speed.filter(Number.isFinite)
    const valid = trial.diam.filter(Number.isFinite).length / trial.diam.length
    const startFrame = trial.onsetFrame - preFrames
    const endFrame = trial.onsetFrame + (trial.diam.length - preFrames)
    const flags = [...trial.flags]
    if (valid < 0.8) flags.push(`Valid samples ${(valid * 100).toFixed(0)}%`)
    const blinkCount = blinks.filter((b) => b.startFrame >= startFrame && b.startFrame <= endFrame).length
    if (blinks.some((b) => b.startFrame <= trial.onsetFrame && b.endFrame >= trial.onsetFrame)) flags.push("Blink at onset")
    return {
      index: trial.index,
      stimulusId: trial.stimulusId,
      baseline,
      peakChange: peak,
      latencyMs: ((peakIdx - preFrames) / fps) * 1000,
      meanSpeed: speeds.reduce((a, b) => a + b, 0) / Math.max(speeds.length, 1),
      fastMovements: events.events.filter((e) => e.startFrame >= startFrame && e.startFrame <= endFrame).length,
      blinks: blinkCount,
      validFraction: valid,
      flags,
    }
  })

  const byStim = new Map<string, AlignedTrial[]>()
  for (const trial of aligned) {
    if (excluded[trial.index] !== undefined) continue
    const list = byStim.get(trial.stimulusId) ?? []
    list.push(trial)
    byStim.set(trial.stimulusId, list)
  }
  const stimuli: StimulusSummary[] = []
  for (const [stimulusId, list] of byStim) {
    const len = list[0].diam.length
    const mean: number[] = []
    const lo: number[] = []
    const hi: number[] = []
    const series = list.map((trial) => {
      const base = trial.diam.slice(0, preFrames).filter(Number.isFinite)
      const b = s.baselineCorrection && base.length ? base.reduce((a, c) => a + c, 0) / base.length : 0
      return trial.diam.map((v) => v - b)
    })
    for (let k = 0; k < len; k++) {
      const vals = series.map((sr) => sr[k]).filter(Number.isFinite)
      const m = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1)
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(vals.length - 1, 1))
      const spread = s.variability === "sd" ? sd : s.variability === "sem" ? sd / Math.sqrt(Math.max(vals.length, 1)) : (1.96 * sd) / Math.sqrt(Math.max(vals.length, 1))
      mean.push(vals.length ? m : NaN)
      lo.push(vals.length ? m - spread : NaN)
      hi.push(vals.length ? m + spread : NaN)
    }
    const peaks = metrics.filter((m) => m.stimulusId === stimulusId && excluded[m.index] === undefined).map((m) => m.peakChange)
    const pm = peaks.reduce((a, b) => a + b, 0) / Math.max(peaks.length, 1)
    const psd = Math.sqrt(peaks.reduce((a, b) => a + (b - pm) ** 2, 0) / Math.max(peaks.length - 1, 1))
    const pvar = s.variability === "sd" ? psd : s.variability === "sem" ? psd / Math.sqrt(Math.max(peaks.length, 1)) : (1.96 * psd) / Math.sqrt(Math.max(peaks.length, 1))
    stimuli.push({ stimulusId, n: list.length, meanPeakChange: pm, variability: pvar, relT: list[0].relT, mean, lo, hi })
  }
  return { metrics, stimuli }
}
