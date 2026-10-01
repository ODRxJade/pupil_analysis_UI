"use client"

import { useEffect, useRef, useState } from "react"

export interface Series {
  label: string
  values: ArrayLike<number>
  color: string
  width?: number
  dashed?: boolean
  opacity?: number
}

export interface Interval {
  start: number
  end: number
  color: string
  label?: string
}

export interface Marker {
  frame: number
  color: string
}

interface TracePlotProps {
  title: string
  unit: string
  series: Series[]
  frameCount: number
  fps: number
  frame: number
  onSeek?: (frame: number) => void
  intervals?: Interval[]
  markers?: Marker[]
  hline?: { value: number; color: string; label: string }
  height?: number
  yDomain?: [number, number]
}

function cssVar(name: string) {
  if (typeof window === "undefined") return "#888"
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888"
}

export function resolveColor(c: string) {
  return c.startsWith("--") ? cssVar(c) : c
}

export function TracePlot({
  title,
  unit,
  series,
  frameCount,
  fps,
  frame,
  onSeek,
  intervals = [],
  markers = [],
  hline,
  height = 120,
  yDomain,
}: TracePlotProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const padL = 44
  const padR = 8
  const padT = 6
  const padB = 18
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  let lo = Infinity
  let hi = -Infinity
  if (yDomain) [lo, hi] = yDomain
  else {
    for (const s of series) {
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i]
        if (Number.isFinite(v)) {
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
    }
    if (hline) {
      lo = Math.min(lo, hline.value)
      hi = Math.max(hi, hline.value)
    }
    if (!Number.isFinite(lo)) {
      lo = 0
      hi = 1
    }
    const pad = (hi - lo) * 0.08 || 1
    lo -= pad
    hi += pad
  }

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = width * dpr
    c.height = height * dpr
    const ctx = c.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const xOf = (f: number) => padL + (f / Math.max(1, frameCount - 1)) * plotW
    const yOf = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH

    const grid = cssVar("--border")
    const muted = cssVar("--muted-foreground")
    ctx.font = "10px var(--font-plex-mono), monospace"
    ctx.fillStyle = muted
    ctx.strokeStyle = grid
    ctx.lineWidth = 1
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3
      const y = Math.round(yOf(v)) + 0.5
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(width - padR, y)
      ctx.stroke()
      ctx.textAlign = "right"
      ctx.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), padL - 4, y + 3)
    }
    const dur = frameCount / fps
    const stepSec = dur > 60 ? 10 : dur > 20 ? 5 : 1
    ctx.textAlign = "center"
    for (let s = 0; s <= dur; s += stepSec) {
      ctx.fillText(`${s}s`, xOf(s * fps), height - 4)
    }

    for (const iv of intervals) {
      ctx.fillStyle = resolveColor(iv.color)
      const x0 = xOf(iv.start)
      ctx.fillRect(x0, padT, Math.max(1, xOf(iv.end) - x0), plotH)
    }
    for (const m of markers) {
      ctx.strokeStyle = resolveColor(m.color)
      ctx.lineWidth = 1.25
      const x = Math.round(xOf(m.frame)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, padT)
      ctx.lineTo(x, padT + plotH)
      ctx.stroke()
    }
    if (hline) {
      ctx.strokeStyle = resolveColor(hline.color)
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1
      const y = yOf(hline.value)
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(width - padR, y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    for (const s of series) {
      ctx.strokeStyle = resolveColor(s.color)
      ctx.globalAlpha = s.opacity ?? 1
      ctx.lineWidth = s.width ?? 1.25
      ctx.setLineDash(s.dashed ? [3, 2] : [])
      const n = s.values.length
      const perPx = n / plotW
      ctx.beginPath()
      let pen = false
      if (perPx > 2) {
        for (let px = 0; px < plotW; px++) {
          const a = Math.floor(px * perPx)
          const b = Math.min(n, Math.floor((px + 1) * perPx))
          let mn = Infinity
          let mx = -Infinity
          for (let i = a; i < b; i++) {
            const v = s.values[i]
            if (Number.isFinite(v)) {
              if (v < mn) mn = v
              if (v > mx) mx = v
            }
          }
          if (mn === Infinity) {
            pen = false
            continue
          }
          const x = padL + px
          if (!pen) ctx.moveTo(x, yOf(mx))
          else ctx.lineTo(x, yOf(mx))
          ctx.lineTo(x, yOf(mn))
          pen = true
        }
      } else {
        for (let i = 0; i < n; i++) {
          const v = s.values[i]
          if (!Number.isFinite(v)) {
            pen = false
            continue
          }
          if (!pen) ctx.moveTo(xOf(i), yOf(v))
          else ctx.lineTo(xOf(i), yOf(v))
          pen = true
        }
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.setLineDash([])
    }

    const cx = Math.round(xOf(frame)) + 0.5
    ctx.strokeStyle = cssVar("--foreground")
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, padT)
    ctx.lineTo(cx, padT + plotH)
    ctx.stroke()
    if (hover !== null) {
      ctx.strokeStyle = muted
      ctx.setLineDash([2, 2])
      const hx = Math.round(xOf(hover)) + 0.5
      ctx.beginPath()
      ctx.moveTo(hx, padT)
      ctx.lineTo(hx, padT + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [series, intervals, markers, hline, frame, hover, width, height, lo, hi, frameCount, fps, plotW, plotH])

  const frameAt = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect()
    const x = clientX - rect.left - padL
    return Math.max(0, Math.min(frameCount - 1, Math.round((x / plotW) * (frameCount - 1))))
  }

  const value = (s: Series) => {
    const v = s.values[frame]
    return Number.isFinite(v) ? v.toFixed(2) : "—"
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
        <span className="font-medium">
          {title} <span className="font-mono text-[11px] text-muted-foreground">[{unit}]</span>
        </span>
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-3 rounded-full" style={{ background: resolveColor(s.color), opacity: s.opacity ?? 1 }} aria-hidden />
            {s.label}
            <span className="font-mono tabular text-foreground">{value(s)}</span>
          </span>
        ))}
        {hline && <span className="text-muted-foreground">{hline.label}</span>}
      </div>
      <div ref={wrap} className="w-full">
        <canvas
          ref={canvas}
          style={{ width, height }}
          className={onSeek ? "cursor-crosshair" : ""}
          role="img"
          aria-label={`${title} plot over time in ${unit}. Click to seek video.`}
          onClick={(e) => onSeek?.(frameAt(e.clientX))}
          onMouseMove={(e) => setHover(frameAt(e.clientX))}
          onMouseLeave={() => setHover(null)}
        />
      </div>
    </div>
  )
}
