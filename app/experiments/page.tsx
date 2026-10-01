"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { ArrowRightIcon, PlusIcon, SaveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel } from "@/components/page-header"
import { StatusBadge, stepTone } from "@/components/status-badge"
import { RoiEditor } from "@/components/experiments/roi-editor"
import { useWorkspace } from "@/components/workspace-provider"
import { api } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { sessionWorkflow } from "@/lib/workflow"
import type { Roi } from "@/lib/types"
import { cn } from "@/lib/utils"

export default function ExperimentsPage() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { experiments, sessions, jobs, session, sessionId, setSessionId, analysis } = useWorkspace()
  const [roi, setRoi] = useState<Roi | null>(session?.roi ?? null)
  const [saving, setSaving] = useState(false)

  const sessionRoiKey = session ? `${session.id}:${JSON.stringify(session.roi)}` : ""
  useEffect(() => {
    setRoi(session?.roi ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRoiKey])

  const dirty = JSON.stringify(roi) !== JSON.stringify(session?.roi ?? null)

  const saveRoi = async () => {
    if (!session) return
    setSaving(true)
    await api.updateSession(session.id, { roi })
    await mutate("sessions")
    setSaving(false)
    toast.success("ROI saved to session configuration", {
      description: roi ? `${roi.width}×${roi.height} at (${roi.x}, ${roi.y})` : "Full frame",
    })
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Experiments"
        description="Recordings, metadata and per-session ROI configuration. Select a session to preview footage and set the crop used for inference."
        actions={
          <Button render={<Link href="/experiments/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New experiment
          </Button>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <Panel bodyClassName="">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Experiment</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Recorded</TableHead>
                <TableHead>Footage</TableHead>
                <TableHead>Video</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>ROI</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => {
                const exp = experiments.find((e) => e.id === s.experimentId)
                const job = jobs.find((j) => j.sessionId === s.id)
                const steps = sessionWorkflow(s, job, s.id === sessionId ? analysis : undefined)
                const step = steps.find((x) => x.state !== "complete") ?? steps[steps.length - 1]
                return (
                  <TableRow
                    key={s.id}
                    onClick={() => setSessionId(s.id)}
                    className={cn("cursor-pointer", s.id === sessionId && "bg-primary/5")}
                    aria-selected={s.id === sessionId}
                  >
                    <TableCell className="font-medium">
                      {exp?.name}
                      <span className="block text-xs font-normal text-muted-foreground">{exp?.subjectId}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.label}</TableCell>
                    <TableCell className="text-xs">{s.recordingDate}</TableCell>
                    <TableCell className="max-w-56 truncate font-mono text-xs" title={s.footagePath}>
                      {s.footageSource === "massive" ? "MASSIVE · " : "Upload · "}
                      {s.video.fileName}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular">
                      {s.video.width}×{s.video.height} · {formatDuration(s.video.durationSec)} · {(s.video.fpsOverride?.value ?? s.video.fps).toFixed(1)} fps
                    </TableCell>
                    <TableCell className="text-xs">{s.metadata ? s.metadata.fileName : <span className="text-muted-foreground">Full recording</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{s.roi ? `${s.roi.width}×${s.roi.height}` : "Full frame"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={stepTone(step.state)}>{step.label}</StatusBadge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>

        {session && (
          <Panel
            title={`Video preview and ROI · ${session.label}`}
            description={`${session.video.fileName} · ${session.footagePath}`}
            actions={
              <>
                {dirty && <StatusBadge tone="warning">Unsaved ROI</StatusBadge>}
                <Button size="sm" onClick={saveRoi} disabled={!dirty || saving}>
                  <SaveIcon data-icon="inline-start" />
                  {saving ? "Saving…" : "Save ROI"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => router.push("/jobs")}>
                  Configure inference
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </>
            }
          >
            <RoiEditor session={session} roi={roi} onChange={setRoi} />
          </Panel>
        )}
      </div>
    </div>
  )
}
