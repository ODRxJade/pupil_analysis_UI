"use client"

import { useEffect, useRef, useState } from "react"
import type { PipelineResults } from "@/lib/results"
import type { EyeSignal } from "@/lib/signal"
import type { Roi } from "@/lib/types"

export interface Overlays {
  landmarks: boolean
  centre: boolean
  boundary: boolean
  roi: boolean
  flow: boolean
  events: boolean
}

export const DEFAULT_OVERLAYS: Overlays = { landmarks: true, centre: true, boundary: true, roi: true, flow: false, events: true }

interface EyeViewerProps {
  signal: EyeSignal
  frame: number
  zoom?: number
  overlays?: Partial<Overlays>
  results?: PipelineResults | null
  lowThreshold?: number
  corrections?: Record<number, { x: number; y: number }>
  roi?: Roi | null
  roiEditable?: boolean
  onRoiChange?: (roi: Roi) => void
  correcting?: boolean
  onCorrect?: (point: { x: number; y: number }) => void
  stimulusLabel?: string | null
}

type Drag =
  | { kind: "draw"; x0: number; y0: number }
  | { kind: "move"; dx: number; dy: number }
  | { kind: "handle"; corner: "nw" | "ne" | "sw" | "se" }

let grain: HTMLCanvasElement | null = null
function grainTexture() {
  if (grain) return grain
  grain = document.createElement("canvas")
  grain.width = 160
  grain.height = 120
  const g = grain.getContext("2d")!
  const img = g.createImageData(160, 120)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 22
  }
  g.putImageData(img, 0, 0)
  return grain
}

function likColor(l: number, thr: number) {
  if (l >= thr) return "#3fd0b0"
  if (l >= 0.5) return "#f2b440"
  return "#ef5a4c"
}

export function EyeViewer({
  signal,
  frame,
  zoom = 1,
  overlays: overlayProp,
  results,
  lowThreshold = 0.9,
  corrections = {},
  roi = null,
  roiEditable = false,
  onRoiChange,
  correcting = false,
  onCorrect,
  stimulusLabel,
}: EyeViewerProps) {
  const overlays = { ...DEFAULT_OVERLAYS, ...overlayProp }
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [baseW, setBaseW] = useState(640)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draft, setDraft] = useState<Roi | null>(null)
  const W = signal.width
  const H = signal.height
  const viewW = Math.round(baseW * zoom)
  const viewH = Math.round((viewW * H) / W)
  const activeRoi = draft ?? roi
  const ox = signal.roi.x
  const oy = signal.roi.y

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBaseW(Math.max(240, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = viewW * dpr
    c.height = viewH * dpr
    const ctx = c.getContext("2d")!
    const s = (viewW / W) * dpr
    ctx.setTransform(s, 0, 0, s, 0, 0)
    const i = Math.min(frame, signal.frameCount - 1)

    const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7)
    bg.addColorStop(0, "#5a5a58")
    bg.addColorStop(1, "#1d1d1c")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const ap = signal.aperture[i]
    const lidH = Math.max(2, signal.lidHalfH * ap)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(signal.eyeCx, signal.eyeCy, signal.lidHalfW, lidH, 0, 0, Math.PI * 2)
    ctx.fillStyle = "#8a8a86"
    ctx.fill()
    ctx.clip()
    const cx = signal.trueCx[i]
    const cy = signal.trueCy[i]
    const iris = ctx.createRadialGradient(cx, cy, 10, cx, cy, signal.lidHalfH * 1.05)
    iris.addColorStop(0, "#6e6e6a")
    iris.addColorStop(1, "#3f3f3c")
    ctx.fillStyle = iris
    ctx.beginPath()
    ctx.arc(cx, cy, signal.lidHalfH * 1.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#0b0b0b"
    ctx.beginPath()
    ctx.ellipse(cx, cy, signal.trueDiam[i] / 2, (signal.trueDiam[i] / 2) * 0.94, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.beginPath()
    ctx.arc(cx + signal.trueDiam[i] * 0.18, cy - signal.trueDiam[i] * 0.2, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = "rgba(20,20,20,0.6)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(signal.eyeCx, signal.eyeCy, signal.lidHalfW, lidH, 0, 0, Math.PI * 2)
    ctx.stroke()
    const tex = grainTexture()
    ctx.drawImage(tex, (i * 37) % 40, (i * 23) % 30, 120, 90, 0, 0, W, H)

    if (overlays.roi && activeRoi) {
      ctx.fillStyle = "rgba(0,0,0,0.35)"
      ctx.fillRect(0, 0, W, activeRoi.y)
      ctx.fillRect(0, activeRoi.y + activeRoi.height, W, H - activeRoi.y - activeRoi.height)
      ctx.fillRect(0, activeRoi.y, activeRoi.x, activeRoi.height)
      ctx.fillRect(activeRoi.x + activeRoi.width, activeRoi.y, W - activeRoi.x - activeRoi.width, activeRoi.height)
      ctx.strokeStyle = "#5ee0d0"
      ctx.lineWidth = 1.5
      ctx.setLineDash(roiEditable ? [6, 4] : [])
      ctx.strokeRect(activeRoi.x, activeRoi.y, activeRoi.width, activeRoi.height)
      ctx.setLineDash([])
      if (roiEditable) {
        ctx.fillStyle = "#5ee0d0"
        for (const [hx, hy] of corners(activeRoi)) ctx.fillRect(hx - 4, hy - 4, 8, 8)
      }
    }

    if (overlays.flow && results?.flow) {
      const m = results.flow.magnitude[i]
      const vx = results.velocity?.vx[i] ?? 0
      const vy = results.velocity?.vy[i] ?? 0
      const norm = Math.hypot(vx, vy) || 1
      ctx.strokeStyle = "rgba(242,180,64,0.85)"
      ctx.lineWidth = 1.2
      const r = signal.roi
      for (let gx = r.x + 20; gx < r.x + r.width; gx += 28) {
        for (let gy = r.y + 20; gy < r.y + r.height; gy += 28) {
          const near = Math.hypot(gx - cx, gy - cy) < signal.lidHalfH * 1.1 ? 1 : 0.35
          const len = Math.min(18, m * 6 * near)
          if (len < 0.8) continue
          const ex = gx + (vx / norm) * len
          const ey = gy + (vy / norm) * len
          ctx.beginPath()
          ctx.moveTo(gx, gy)
          ctx.lineTo(ex, ey)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(ex, ey, 1.3, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(242,180,64,0.9)"
          ctx.fill()
        }
      }
    }

    if (overlays.boundary && results?.centre && Number.isFinite(results.centre.x[i])) {
      ctx.strokeStyle = "#5ee0d0"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(
        results.centre.x[i] + ox,
        results.centre.y[i] + oy,
        results.centre.major[i] / 2,
        results.centre.minor[i] / 2,
        results.centre.angle[i],
        0,
        Math.PI * 2,
      )
      ctx.stroke()
    }

    if (overlays.landmarks) {
      const drawPt = (x: number, y: number, l: number, r: number) => {
        ctx.beginPath()
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2)
        ctx.fillStyle = likColor(l, lowThreshold)
        ctx.fill()
        ctx.strokeStyle = "rgba(0,0,0,0.6)"
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
      for (let p = 0; p < signal.pupilX.length; p++) drawPt(signal.pupilX[p][i], signal.pupilY[p][i], signal.pupilL[p][i], 3.2)
      for (let p = 0; p < signal.lidX.length; p++) {
        ctx.save()
        ctx.translate(signal.lidX[p][i] + ox, signal.lidY[p][i] + oy)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = likColor(signal.lidL[p][i], lowThreshold)
        ctx.fillRect(-3, -3, 6, 6)
        ctx.restore()
      }
    }

    const corr = corrections[i]
    const centreX = corr ? corr.x : results?.centre?.x[i]
    const centreY = corr ? corr.y : results?.centre?.y[i]
    if ((overlays.centre || corr) && centreX !== undefined && centreY !== undefined && Number.isFinite(centreX)) {
      const x = centreX + ox
      const y = centreY! + oy
      ctx.strokeStyle = corr ? "#f2b440" : "#ffffff"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x - 8, y)
      ctx.lineTo(x + 8, y)
      ctx.moveTo(x, y - 8)
      ctx.lineTo(x, y + 8)
      ctx.stroke()
    }

    ctx.font = "600 11px var(--font-plex-mono), monospace"
    const tags: { text: string; color: string }[] = []
    if (corr) tags.push({ text: "EDITED FRAME", color: "#f2b440" })
    if (overlays.events && results?.events?.events.some((e) => i >= e.startFrame && i <= e.endFrame))
      tags.push({ text: "FAST MOVEMENT", color: "#f2b440" })
    if (overlays.events && results?.blinks?.some((b) => i >= b.startFrame && i <= b.endFrame)) tags.push({ text: "BLINK", color: "#ef5a4c" })
    if (stimulusLabel) tags.push({ text: `STIM ${stimulusLabel}`, color: "#4fd17a" })
    let tx = 10
    for (const tag of tags) {
      const w = ctx.measureText(tag.text).width + 12
      ctx.fillStyle = "rgba(0,0,0,0.65)"
      ctx.fillRect(tx, 10, w, 18)
      ctx.fillStyle = tag.color
      ctx.fillText(tag.text, tx + 6, 23)
      tx += w + 6
    }
  }, [signal, frame, viewW, viewH, W, H, overlays.landmarks, overlays.centre, overlays.boundary, overlays.roi, overlays.flow, overlays.events, results, lowThreshold, corrections, activeRoi, roiEditable, ox, oy, stimulusLabel])

  const toFrame = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(W, ((e.clientX - rect.left) / rect.width) * W)),
      y: Math.max(0, Math.min(H, ((e.clientY - rect.top) / rect.height) * H)),
    }
  }

  const onDown = (e: React.PointerEvent) => {
    const p = toFrame(e)
    if (correcting && onCorrect) {
      onCorrect({ x: p.x - ox, y: p.y - oy })
      return
    }
    if (!roiEditable) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const r = activeRoi
    if (r) {
      const hit = corners(r).findIndex(([hx, hy]) => Math.abs(hx - p.x) < 10 && Math.abs(hy - p.y) < 10)
      if (hit >= 0) {
        setDrag({ kind: "handle", corner: (["nw", "ne", "sw", "se"] as const)[hit] })
        setDraft(r)
        return
      }
      if (p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height) {
        setDrag({ kind: "move", dx: p.x - r.x, dy: p.y - r.y })
        setDraft(r)
        return
      }
    }
    setDrag({ kind: "draw", x0: p.x, y0: p.y })
    setDraft({ x: Math.round(p.x), y: Math.round(p.y), width: 0, height: 0 })
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !draft) return
    const p = toFrame(e)
    if (drag.kind === "draw") setDraft(normalise(drag.x0, drag.y0, p.x, p.y))
    else if (drag.kind === "move") {
      const x = Math.max(0, Math.min(W - draft.width, p.x - drag.dx))
      const y = Math.max(0, Math.min(H - draft.height, p.y - drag.dy))
      setDraft({ ...draft, x: Math.round(x), y: Math.round(y) })
    } else {
      const r = draft
      const left = drag.corner.includes("w") ? p.x : r.x
      const right = drag.corner.includes("e") ? p.x : r.x + r.width
      const top = drag.corner.includes("n") ? p.y : r.y
      const bottom = drag.corner.includes("s") ? p.y : r.y + r.height
      setDraft(normalise(left, top, right, bottom))
    }
  }

  const onUp = () => {
    if (drag && draft && draft.width >= 16 && draft.height >= 16) onRoiChange?.(draft)
    setDrag(null)
    setDraft(null)
  }

  return (
    <div ref={wrap} className="w-full">
      <div className="max-h-[60vh] overflow-auto rounded-md bg-navy">
        <canvas
          ref={canvas}
          style={{ width: viewW, height: viewH, touchAction: "none" }}
          className={roiEditable || correcting ? "cursor-crosshair" : ""}
          role="img"
          aria-label={`Eye camera frame ${frame + 1} of ${signal.frameCount}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      </div>
    </div>
  )
}

function corners(r: Roi): [number, number][] {
  return [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ]
}

function normalise(x0: number, y0: number, x1: number, y1: number): Roi {
  return {
    x: Math.round(Math.min(x0, x1)),
    y: Math.round(Math.min(y0, y1)),
    width: Math.round(Math.abs(x1 - x0)),
    height: Math.round(Math.abs(y1 - y0)),
  }
}
