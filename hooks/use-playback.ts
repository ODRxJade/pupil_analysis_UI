"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function usePlayback(frameCount: number, fps: number) {
  const [frame, setFrameState] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const raf = useRef<number | null>(null)

  const setFrame = useCallback(
    (f: number) => setFrameState(Math.max(0, Math.min(frameCount - 1, Math.round(f)))),
    [frameCount],
  )

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * fps * rate
      last = now
      if (acc >= 1) {
        const steps = Math.floor(acc)
        acc -= steps
        setFrameState((f) => {
          const next = f + steps
          if (next >= frameCount - 1) {
            setPlaying(false)
            return frameCount - 1
          }
          return next
        })
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing, fps, rate, frameCount])

  return {
    frame,
    setFrame,
    playing,
    toggle: () => setPlaying((p) => !p),
    pause: () => setPlaying(false),
    step: (d: number) => {
      setPlaying(false)
      setFrameState((f) => Math.max(0, Math.min(frameCount - 1, f + d)))
    },
    rate,
    setRate,
  }
}
