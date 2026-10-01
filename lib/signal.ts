import type { Roi, Session } from "./types"

export const PUPIL_LANDMARKS = [
  "pupil_top",
  "pupil_topright",
  "pupil_right",
  "pupil_bottomright",
  "pupil_bottom",
  "pupil_bottomleft",
  "pupil_left",
  "pupil_topleft",
] as const

export const EYELID_LANDMARKS = ["eyelid_top", "eyelid_bottom", "eyelid_nasal", "eyelid_temporal"] as const

export const STIMULI = ["grating_0deg", "grating_90deg", "looming", "dark_flash"] as const

export interface Trial {
  index: number
  stimulusId: string
  onset: number
  offset: number
  timingMismatchMs: number | null
  missingTimestamps: boolean
}

export interface EyeSignal {
  key: string
  frameCount: number
  fps: number
  width: number
  height: number
  roi: Roi
  t: Float64Array
  eyeCx: number
  eyeCy: number
  lidHalfW: number
  lidHalfH: number
  trueCx: Float32Array
  trueCy: Float32Array
  trueDiam: Float32Array
  aperture: Float32Array
  pupilX: Float32Array[]
  pupilY: Float32Array[]
  pupilL: Float32Array[]
  lidX: Float32Array[]
  lidY: Float32Array[]
  lidL: Float32Array[]
  trials: Trial[]
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const cache = new Map<string, EyeSignal>()

export function fullFrameRoi(width: number, height: number): Roi {
  return { x: 0, y: 0, width, height }
}

export function getSignal(session: Session): EyeSignal {
  const roi = session.roi ?? fullFrameRoi(session.video.width, session.video.height)
  const fps = session.video.fpsOverride?.value ?? session.video.fps
  const key = `${session.id}:${roi.x},${roi.y},${roi.width},${roi.height}:${fps}:${session.video.frameCount}`
  const cached = cache.get(key)
  if (cached) return cached
  const signal = generateSignal(key, session.id, session.video.frameCount, fps, session.video.width, session.video.height, roi)
  cache.set(key, signal)
  return signal
}

function generateSignal(
  key: string,
  seedKey: string,
  frameCount: number,
  fps: number,
  width: number,
  height: number,
  roi: Roi,
): EyeSignal {
  const rand = mulberry32(hashString(seedKey))
  const gauss = () => {
    const u = Math.max(rand(), 1e-9)
    const v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const n = frameCount
  const duration = n / fps
  const sx = width / 640
  const sy = height / 480
  const eyeCx = 320 * sx
  const eyeCy = 236 * sy
  const lidHalfW = 150 * sx
  const lidHalfH = 96 * sy

  const t = new Float64Array(n)
  const dropFrame = Math.floor(n * 0.63)
  for (let i = 0; i < n; i++) {
    t[i] = i / fps + (i >= dropFrame ? 0.12 : 0) + gauss() * 0.0004
  }

  const trials: Trial[] = []
  for (let i = 0, onset = 5; onset + 8 < duration; i++, onset += 10) {
    const onsetFrame = onset * fps
    trials.push({
      index: i + 1,
      stimulusId: STIMULI[i % STIMULI.length],
      onset,
      offset: onset + 2,
      timingMismatchMs: i === 2 ? 46 : null,
      missingTimestamps: Math.abs(onsetFrame - dropFrame) < fps * 3,
    })
  }

  const blinkStarts: { start: number; len: number }[] = []
  for (let f = Math.floor(fps * 7); f < n - fps; ) {
    blinkStarts.push({ start: f, len: 8 + Math.floor(rand() * 7) })
    f += Math.floor(fps * (11 + rand() * 9))
  }

  const aperture = new Float32Array(n).fill(1)
  for (const b of blinkStarts) {
    for (let k = 0; k < b.len && b.start + k < n; k++) {
      const phase = k / (b.len - 1)
      aperture[b.start + k] = 0.06 + 0.94 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2))
    }
  }

  const trueCx = new Float32Array(n)
  const trueCy = new Float32Array(n)
  const trueDiam = new Float32Array(n)
  let targetX = 0
  let targetY = 0
  let posX = 0
  let posY = 0
  let nextJump = Math.floor(fps * (2 + rand() * 3))
  let jumpFrom = { x: 0, y: 0 }
  let jumpStart = -100
  let walk = 0
  for (let i = 0; i < n; i++) {
    if (i === nextJump) {
      jumpFrom = { x: posX, y: posY }
      targetX = (rand() - 0.5) * 44 * sx
      targetY = (rand() - 0.5) * 14 * sy
      jumpStart = i
      nextJump = i + Math.floor(fps * (2.5 + rand() * 4.5))
    }
    const k = i - jumpStart
    if (k >= 0 && k <= 4) {
      const s = k / 4
      const ease = s * s * (3 - 2 * s)
      posX = jumpFrom.x + (targetX - jumpFrom.x) * ease
      posY = jumpFrom.y + (targetY - jumpFrom.y) * ease
    } else {
      targetX *= 0.9993
      targetY *= 0.9993
      posX += (targetX - posX) * 0.08 + gauss() * 0.12
      posY += (targetY - posY) * 0.08 + gauss() * 0.1
    }
    trueCx[i] = eyeCx - 2 * sx + posX
    trueCy[i] = eyeCy + 3 * sy + posY

    walk = walk * 0.995 + gauss() * 0.08
    const time = i / fps
    let response = 0
    for (const trial of trials) {
      const dt = time - trial.onset
      if (dt < 0 || dt > 8) continue
      const rise = 1 - Math.exp(-dt / 0.45)
      const decay = Math.exp(-dt / 2.6)
      const amp =
        trial.stimulusId === "dark_flash" ? 15 : trial.stimulusId === "looming" ? 9 : trial.stimulusId === "grating_0deg" ? -6 : -4
      response += amp * rise * decay
    }
    trueDiam[i] = (52 + 4 * Math.sin((2 * Math.PI * time) / 41) + walk + response) * sx
  }

  const occlusionStart = Math.floor(n * 0.42)
  const occlusionLen = 18
  const pupilX: Float32Array[] = []
  const pupilY: Float32Array[] = []
  const pupilL: Float32Array[] = []
  for (let p = 0; p < PUPIL_LANDMARKS.length; p++) {
    const xs = new Float32Array(n)
    const ys = new Float32Array(n)
    const ls = new Float32Array(n)
    const angle = -Math.PI / 2 + (p * Math.PI) / 4
    for (let i = 0; i < n; i++) {
      const r = trueDiam[i] / 2
      const ap = aperture[i]
      let lik = 0.965 + rand() * 0.034
      let noise = 0.55
      if (ap < 0.55) {
        lik = 0.02 + rand() * 0.25 * ap
        noise = 9
      } else if (i >= occlusionStart && i < occlusionStart + occlusionLen && p < 4) {
        lik = 0.2 + rand() * 0.35
        noise = 6
      } else if (rand() < 0.012) {
        lik = 0.35 + rand() * 0.5
        noise = 4
      }
      xs[i] = trueCx[i] + Math.cos(angle) * r + gauss() * noise - roi.x
      ys[i] = trueCy[i] + Math.sin(angle) * r * 0.94 * Math.min(1, ap + 0.2) + gauss() * noise - roi.y
      ls[i] = lik
    }
    pupilX.push(xs)
    pupilY.push(ys)
    pupilL.push(ls)
  }

  const lidX: Float32Array[] = []
  const lidY: Float32Array[] = []
  const lidL: Float32Array[] = []
  const lidBase = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ]
  for (let p = 0; p < EYELID_LANDMARKS.length; p++) {
    const xs = new Float32Array(n)
    const ys = new Float32Array(n)
    const ls = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const ap = aperture[i]
      const base = lidBase[p]
      xs[i] = eyeCx + base.x * lidHalfW + gauss() * 0.8 - roi.x
      ys[i] = eyeCy + base.y * lidHalfH * (p < 2 ? ap : 1) + gauss() * 0.8 - roi.y
      ls[i] = p < 2 && ap < 0.3 ? 0.6 + rand() * 0.3 : 0.97 + rand() * 0.029
    }
    lidX.push(xs)
    lidY.push(ys)
    lidL.push(ls)
  }

  return {
    key,
    frameCount: n,
    fps,
    width,
    height,
    roi,
    t,
    eyeCx,
    eyeCy,
    lidHalfW,
    lidHalfH,
    trueCx,
    trueCy,
    trueDiam,
    aperture,
    pupilX,
    pupilY,
    pupilL,
    lidX,
    lidY,
    lidL,
    trials,
  }
}
