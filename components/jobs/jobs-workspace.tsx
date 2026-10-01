"use client"

import { useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { AlertTriangleIcon, CheckCircle2Icon, DownloadIcon, FilePlus2Icon, RotateCcwIcon, SaveIcon, SendIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Panel } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { ConfigForm } from "@/components/jobs/config-form"
import { ScriptEditor } from "@/components/jobs/script-editor"
import { api } from "@/lib/api"
import { downloadText, formatRelative } from "@/lib/format"
import { JOB_STATUS_LABEL } from "@/lib/jobs"
import { generateScript, slug, validateConfig } from "@/lib/slurm"
import type { Experiment, InferenceConfig, JobView, Session, SlurmTemplate } from "@/lib/types"
import { cn } from "@/lib/utils"

const strip = (c: InferenceConfig) => JSON.stringify({ ...c, savedAt: null, scriptGeneratedAt: null })

function effectiveScript(cfg: InferenceConfig, generated: string) {
  return cfg.mode === "advanced" && cfg.customScript !== null ? cfg.customScript : generated
}

export function JobsWorkspace({
  tab,
  initial,
  templates,
  session,
  experiment,
  job,
  onSubmitted,
}: {
  tab: "configuration" | "script"
  initial: InferenceConfig
  templates: SlurmTemplate[]
  session: Session
  experiment: Experiment | undefined
  job: JobView | undefined
  onSubmitted: (id: string) => void
}) {
  const { mutate } = useSWRConfig()
  const [saved, setSaved] = useState(initial)
  const [cfg, setCfg] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [simulateFailure, setSimulateFailure] = useState(false)

  const template = templates.find((t) => t.id === cfg.templateId) ?? templates[0]
  const generated = useMemo(() => generateScript(cfg, template, experiment, session), [cfg, template, experiment, session])
  const script = effectiveScript(cfg, generated)
  const issues = useMemo(() => validateConfig(cfg, template, script), [cfg, template, script])
  const errors = issues.filter((i) => i.severity === "error")
  const warnings = issues.filter((i) => i.severity === "warning")

  const savedScript = useMemo(() => {
    const t = templates.find((x) => x.id === saved.templateId) ?? templates[0]
    return effectiveScript(saved, generateScript(saved, t, experiment, session))
  }, [saved, templates, experiment, session])

  const configDirty = strip(cfg) !== strip(saved)
  const hasManualEdits = cfg.customScript !== null && cfg.customScript !== cfg.customScriptBase
  const generatedDrift = cfg.mode === "advanced" && cfg.customScript !== null && cfg.customScriptBase !== generated
  const submittedHere = job && job.status !== "draft"

  const patch = (p: Partial<InferenceConfig>) => setCfg((c) => ({ ...c, ...p }))

  const save = async () => {
    setBusy(true)
    const next = await api.saveInferenceConfig(session.id, { ...cfg, scriptGeneratedAt: Date.now() })
    await mutate(["inference-config", session.id], next, false)
    setSaved(next)
    setCfg(next)
    setBusy(false)
    toast.success("Configuration saved", { description: "SLURM script regenerated from saved settings." })
  }

  const submit = async () => {
    setBusy(true)
    const j = await api.submitJob(session.id, savedScript, { simulateFailure })
    await mutate("jobs")
    setBusy(false)
    toast.success(`Simulated job ${j.id} submitted`, { description: "No job was sent to MASSIVE (demo mode)." })
    onSubmitted(j.id)
  }

  const canSubmit = !configDirty && !!saved.savedAt && errors.length === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 md:grid-cols-3">
        <StatusTile
          label="Configuration"
          ok={!configDirty && !!saved.savedAt}
          value={configDirty ? "Unsaved changes" : saved.savedAt ? `Saved ${formatRelative(saved.savedAt)}` : "Not saved"}
        />
        <StatusTile
          label="SLURM script"
          ok={!configDirty && !!saved.scriptGeneratedAt}
          value={configDirty ? "Out of date — save to regenerate" : saved.scriptGeneratedAt ? `Generated ${formatRelative(saved.scriptGeneratedAt)}${hasManualEdits ? " · manual edits" : ""}` : "Not generated"}
        />
        <StatusTile
          label="Job"
          ok={!!submittedHere}
          value={submittedHere ? `${job.id} · ${JOB_STATUS_LABEL[job.status]}` : "Not submitted"}
        />
      </div>

      {tab === "configuration" ? (
        <ConfigForm cfg={cfg} onChange={patch} templates={templates} issues={issues} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel
            title="SLURM script"
            description={cfg.mode === "researcher" ? "Generated from configuration — read only in researcher mode." : "Advanced mode — edits are preserved separately from generated output."}
            actions={
              <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Editing mode">
                {(["researcher", "advanced"] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={cfg.mode === m}
                    onClick={() => patch({ mode: m })}
                    className={cn("rounded px-2.5 py-1 text-xs font-medium capitalize", cfg.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {m}
                  </button>
                ))}
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              {generatedDrift && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <AlertTriangleIcon className="size-4 text-warning-foreground" aria-hidden />
                    Configuration changed since you edited the script.
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => patch({ customScriptBase: generated })}>
                      Preserve my edits
                    </Button>
                    <Button size="sm" onClick={() => patch({ customScript: null, customScriptBase: null })}>
                      Regenerate
                    </Button>
                  </span>
                </div>
              )}
              {cfg.mode === "researcher" && cfg.customScript !== null && (
                <p className="text-xs text-muted-foreground">Manual edits are retained in advanced mode; researcher mode submits the generated script.</p>
              )}
              <ScriptEditor
                label="SLURM script"
                value={script}
                readOnly={cfg.mode === "researcher"}
                onChange={(v) => patch({ customScript: v, customScriptBase: cfg.customScript === null ? generated : cfg.customScriptBase })}
              />
            </div>
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="Validation">
              {issues.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2Icon className="size-4" aria-hidden /> No issues found
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-xs">
                  {[...errors, ...warnings].map((i, k) => (
                    <li key={k} className={cn("rounded-md px-2.5 py-1.5 leading-relaxed", i.severity === "error" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground")}>
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => downloadText(`pd-${slug(experiment?.name ?? "job")}-${session.label.toLowerCase()}.slurm`, script, "text/x-shellscript")}>
                <DownloadIcon data-icon="inline-start" />
                Download script
              </Button>
              <SaveTemplateDialog template={template} script={script} />
              {hasManualEdits && cfg.mode === "advanced" && (
                <Button variant="ghost" onClick={() => patch({ customScript: null, customScriptBase: null })}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Discard manual edits
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {errors.length ? `${errors.length} error${errors.length > 1 ? "s" : ""} must be resolved before submission.` : configDirty ? "Save to regenerate the script before submitting." : "Ready to submit."}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={!configDirty || busy}>
            <SaveIcon data-icon="inline-start" />
            Save configuration
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button disabled={!canSubmit || busy} />}>
              <SendIcon data-icon="inline-start" />
              Submit to MASSIVE
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Submit simulated job?</AlertDialogTitle>
                <AlertDialogDescription>
                  Demo mode: the backend job service is simulated. No SSH connection is made and nothing runs on MASSIVE. The job will move through validating, transferring, queued and running states.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={simulateFailure} onCheckedChange={setSimulateFailure} />
                Simulate a runtime failure
              </label>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={submit}>Submit</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}

function StatusTile({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-medium">{value}</span>
      </div>
      <StatusBadge tone={ok ? "success" : "neutral"}>{ok ? "Done" : "Pending"}</StatusBadge>
    </div>
  )
}

function SaveTemplateDialog({ template, script }: { template: SlurmTemplate; script: string }) {
  const { mutate } = useSWRConfig()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <FilePlus2Icon data-icon="inline-start" />
        Save as reusable template
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save template</DialogTitle>
          <DialogDescription>Stores the current script body with the required parameters of “{template.name}”.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              await api.saveTemplate({ name: name.trim(), description, version: "1.0.0", requiredParams: template.requiredParams, labelledVideo: template.labelledVideo, body: script })
              await mutate("templates")
              setOpen(false)
              toast.success("Template saved", { description: name })
            }}
          >
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
