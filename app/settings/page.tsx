"use client"

import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, Panel } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useSettings } from "@/hooks/use-data"
import { api } from "@/lib/api"
import type { AppSettings } from "@/lib/types"

const ENDPOINTS: [string, string][] = [
  ["Experiments & sessions", "listExperiments · listSessions · createExperiment · updateSession"],
  ["SLURM templates", "listTemplates · saveTemplate"],
  ["Inference config", "getInferenceConfig · saveInferenceConfig"],
  ["Jobs", "listJobs · submitJob · cancelJob · retryJob · retrieveOutputs"],
  ["Analysis", "getAnalysis · updateStageSettings · resetStageSettings · setCorrection · setTrialExclusion · runStage"],
]

function SettingsForm({ initial }: { initial: AppSettings }) {
  const { mutate } = useSWRConfig()
  const [draft, setDraft] = useState({
    researcher: initial.researcher,
    backendUrl: initial.backendUrl,
    calibration: initial.calibrationPxPerMm?.toString() ?? "",
    defaultFps: initial.defaultFps.toString(),
  })
  const [saving, setSaving] = useState(false)

  const calibration = draft.calibration.trim() === "" ? null : Number(draft.calibration)
  const fps = Number(draft.defaultFps)
  const calibrationError = calibration !== null && (!Number.isFinite(calibration) || calibration <= 0) ? "Enter a positive number, or leave blank to report in pixels." : null
  const fpsError = !Number.isFinite(fps) || fps <= 0 ? "Frame rate must be a positive number." : null
  const urlError = draft.backendUrl && !/^https?:\/\/.+/.test(draft.backendUrl) ? "Use a full http(s) URL." : null
  const dirty =
    draft.researcher !== initial.researcher ||
    draft.backendUrl !== initial.backendUrl ||
    calibration !== initial.calibrationPxPerMm ||
    fps !== initial.defaultFps

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (calibrationError || fpsError || urlError) return
    setSaving(true)
    const next = await api.saveSettings({ researcher: draft.researcher.trim(), backendUrl: draft.backendUrl.trim(), calibrationPxPerMm: calibration, defaultFps: fps })
    await mutate("settings", next, { revalidate: false })
    setSaving(false)
    toast.success("Settings saved", { description: calibration ? "Velocity and amplitude will be reported in mm on the next run." : undefined })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Panel title="Researcher">
        <div className="flex max-w-md flex-col gap-1.5">
          <Label htmlFor="researcher">Name</Label>
          <Input id="researcher" value={draft.researcher} onChange={(e) => setDraft({ ...draft, researcher: e.target.value })} />
          <p className="text-xs text-muted-foreground">Recorded in exported processing configuration files.</p>
        </div>
      </Panel>

      <Panel title="Measurement defaults" description="Applied to new sessions and to velocity calculations.">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calibration">Spatial calibration (px per mm)</Label>
            <Input id="calibration" inputMode="decimal" placeholder="Not calibrated" value={draft.calibration} aria-invalid={!!calibrationError} onChange={(e) => setDraft({ ...draft, calibration: e.target.value })} />
            <p className={`text-xs ${calibrationError ? "text-destructive" : "text-muted-foreground"}`}>
              {calibrationError ?? "Leave blank to keep outputs in pixels. Re-run velocity to apply."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fps">Default frame rate (fps)</Label>
            <Input id="fps" inputMode="decimal" value={draft.defaultFps} aria-invalid={!!fpsError} onChange={(e) => setDraft({ ...draft, defaultFps: e.target.value })} />
            <p className={`text-xs ${fpsError ? "text-destructive" : "text-muted-foreground"}`}>{fpsError ?? "Used when a video has no reliable frame rate."}</p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Backend connection"
        description="All data access goes through a single API module. Point it at your service to replace the in-browser demo data."
        actions={draft.backendUrl ? <StatusBadge tone="info">Configured</StatusBadge> : <StatusBadge tone="warning">Demo mode</StatusBadge>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex max-w-xl flex-col gap-1.5">
            <Label htmlFor="backend">Backend URL</Label>
            <Input id="backend" type="url" placeholder="https://pupil-api.example.org" value={draft.backendUrl} aria-invalid={!!urlError} onChange={(e) => setDraft({ ...draft, backendUrl: e.target.value })} />
            <p className={`text-xs ${urlError ? "text-destructive" : "text-muted-foreground"}`}>
              {urlError ?? "While empty, experiments, SLURM jobs and analysis run against simulated data in this browser session. Refreshing the page resets it."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Integration points in lib/api.ts</h3>
            <dl className="grid gap-x-6 gap-y-1.5 rounded-md border border-border p-3 text-sm sm:grid-cols-[auto_1fr]">
              {ENDPOINTS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium">{k}</dt>
                  <dd className="font-mono text-xs leading-relaxed text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Panel>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={!dirty || saving || !!calibrationError || !!fpsError || !!urlError}>
          {saving && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
          Save settings
        </Button>
      </div>
    </form>
  )
}

export default function SettingsPage() {
  const { data } = useSettings()
  return (
    <div className="flex flex-col">
      <PageHeader title="Settings" description="Researcher details, measurement defaults and backend connection." />
      <div className="max-w-4xl p-6">{data ? <SettingsForm initial={data} /> : <Skeleton className="h-96 w-full" />}</div>
    </div>
  )
}
