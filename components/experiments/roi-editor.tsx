"use client"

import { useMemo, useState } from "react"
import { CropIcon, MaximizeIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EyeViewer } from "@/components/viewer/eye-viewer"
import { Transport } from "@/components/viewer/transport"
import { usePlayback } from "@/hooks/use-playback"
import { fullFrameRoi, getSignal } from "@/lib/signal"
import type { Roi, Session } from "@/lib/types"

const DEFAULT_ROI: Roi = { x: 150, y: 116, width: 340, height: 240 }

export function RoiEditor({
  session,
  roi,
  onChange,
}: {
  session: Session
  roi: Roi | null
  onChange: (roi: Roi | null) => void
}) {
  const signal = useMemo(() => getSignal({ ...session, roi: DEFAULT_ROI }), [session])
  const fps = session.video.fpsOverride?.value ?? session.video.fps
  const playback = usePlayback(signal.frameCount, fps)
  const [zoom, setZoom] = useState(1)
  const { width: W, height: H } = session.video
  const effective = roi ?? fullFrameRoi(W, H)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex flex-col gap-3">
        <EyeViewer
          signal={signal}
          frame={playback.frame}
          zoom={zoom}
          overlays={{ landmarks: false, centre: false, boundary: false, events: false, roi: true }}
          roi={effective}
          roiEditable
          onRoiChange={onChange}
        />
        <Transport playback={playback} frameCount={signal.frameCount} fps={fps} zoom={zoom} onZoom={setZoom} />
      </div>
      <aside className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 font-medium">
            <CropIcon className="size-4" aria-hidden /> Region of interest
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Drag on the frame to draw. Drag inside to move, or drag a corner handle to resize. Inference crops to this rectangle.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs tabular">
          <dt className="text-muted-foreground">x</dt>
          <dd>{effective.x} px</dd>
          <dt className="text-muted-foreground">y</dt>
          <dd>{effective.y} px</dd>
          <dt className="text-muted-foreground">width</dt>
          <dd>{effective.width} px</dd>
          <dt className="text-muted-foreground">height</dt>
          <dd>{effective.height} px</dd>
        </dl>
        <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-xs leading-relaxed">
          <span className="font-medium">Coordinate frames</span>
          <span className="text-muted-foreground">
            Original frame: {W} × {H} px, origin top-left.
          </span>
          <span className="text-muted-foreground">
            Cropped frame: {effective.width} × {effective.height} px. Predictions are reported in cropped coordinates;
            original = cropped + ({effective.x}, {effective.y}).
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onChange(DEFAULT_ROI)}>
            <RotateCcwIcon data-icon="inline-start" />
            Reset ROI
          </Button>
          <Button variant="outline" size="sm" onClick={() => onChange(null)} disabled={!roi}>
            <MaximizeIcon data-icon="inline-start" />
            Use full frame
          </Button>
        </div>
      </aside>
    </div>
  )
}
