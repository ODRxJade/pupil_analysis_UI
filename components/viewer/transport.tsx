"use client"

import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimecode } from "@/lib/format"
import type { usePlayback } from "@/hooks/use-playback"

type Playback = ReturnType<typeof usePlayback>

export function Transport({
  playback,
  frameCount,
  fps,
  timestamps,
  zoom,
  onZoom,
  markers = [],
}: {
  playback: Playback
  frameCount: number
  fps: number
  timestamps?: Float64Array
  zoom?: number
  onZoom?: (z: number) => void
  markers?: { frame: number; color: string }[]
}) {
  const { frame, setFrame, playing, toggle, step } = playback
  const ts = timestamps ? timestamps[frame] : frame / fps
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          type="range"
          min={0}
          max={frameCount - 1}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-primary"
          aria-label="Timeline"
        />
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-1.5">
          {markers.map((m, k) => (
            <span
              key={k}
              className="absolute top-0 h-1.5 w-0.5 rounded-full"
              style={{ left: `${(m.frame / Math.max(1, frameCount - 1)) * 100}%`, background: m.color }}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => step(-10)} aria-label="Back 10 frames">
            <ChevronsLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous frame">
            <ChevronLeftIcon />
          </Button>
          <Button size="icon-sm" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label="Next frame">
            <ChevronRightIcon />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(10)} aria-label="Forward 10 frames">
            <ChevronsRightIcon />
          </Button>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs tabular">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Frame</span>
            <input
              type="number"
              value={frame + 1}
              min={1}
              max={frameCount}
              onChange={(e) => setFrame(Number(e.target.value) - 1)}
              className="h-7 w-20 rounded-md border border-input bg-card px-2 text-xs"
            />
            <span className="text-muted-foreground">/ {frameCount}</span>
          </label>
          <span>
            <span className="text-muted-foreground">t </span>
            {formatTimecode(ts)}
          </span>
          <span className="text-muted-foreground">{fps.toFixed(1)} fps</span>
        </div>
        {onZoom && zoom !== undefined && (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => onZoom(Math.max(1, zoom - 0.5))} aria-label="Zoom out" disabled={zoom <= 1}>
              <MinusIcon />
            </Button>
            <span className="w-12 text-center font-mono text-xs tabular">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon-sm" onClick={() => onZoom(Math.min(4, zoom + 0.5))} aria-label="Zoom in" disabled={zoom >= 4}>
              <PlusIcon />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
