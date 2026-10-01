"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel } from "@/components/page-header"
import type { ValidationIssue } from "@/lib/slurm"
import type { InferenceConfig, SlurmTemplate } from "@/lib/types"
import { cn } from "@/lib/utils"

type Key = keyof InferenceConfig

interface FieldSpec {
  key: Key
  label: string
  type?: "text" | "number"
  placeholder?: string
  hint?: string
  step?: number
  mono?: boolean
}

const MODEL: FieldSpec[] = [
  { key: "dlcConfigPath", label: "DeepLabCut config path", placeholder: "/<project>/models/<model>/config.yaml", mono: true },
  { key: "snapshot", label: "Model snapshot", placeholder: "e.g. snapshot-<iteration>", mono: true },
  { key: "batchSize", label: "Batch size", type: "number", step: 1 },
  { key: "likelihoodThreshold", label: "Likelihood threshold", type: "number", step: 0.01, hint: "Used for downstream filtering, not by DeepLabCut itself." },
]

const RESOURCES: FieldSpec[] = [
  { key: "account", label: "Project / account allocation", placeholder: "<your MASSIVE project code>", mono: true },
  { key: "partition", label: "Partition", placeholder: "<partition name>", mono: true },
  { key: "gpuCount", label: "GPU count", type: "number", step: 1 },
  { key: "gpuType", label: "GPU type", placeholder: "<gres GPU type>", mono: true },
  { key: "cpus", label: "CPUs per task", type: "number", step: 1 },
  { key: "memoryGb", label: "Memory (GB)", type: "number", step: 1 },
  { key: "wallTime", label: "Wall time", placeholder: "HH:MM:SS", mono: true },
]

const ENV: FieldSpec[] = [
  { key: "condaEnv", label: "Conda environment", placeholder: "<env name or path>", mono: true },
  { key: "workDir", label: "Working directory", placeholder: "/<project>/work", mono: true },
  { key: "inputPath", label: "Input footage path", placeholder: "/<project>/raw/<session>/eye.mp4", mono: true, hint: "Uploads are staged here by the backend before the job starts." },
  { key: "outputDir", label: "Output directory", placeholder: "/<project>/dlc-output/<session>", mono: true },
  { key: "email", label: "Notification email (optional)", placeholder: "name@institution.edu" },
]

export function ConfigForm({
  cfg,
  onChange,
  templates,
  issues,
}: {
  cfg: InferenceConfig
  onChange: (patch: Partial<InferenceConfig>) => void
  templates: SlurmTemplate[]
  issues: ValidationIssue[]
}) {
  const template = templates.find((t) => t.id === cfg.templateId)
  const required = new Set(template?.requiredParams ?? [])
  const issueFor = (k: Key) => issues.find((i) => i.field === k)

  const render = (f: FieldSpec) => {
    const issue = issueFor(f.key)
    const id = `cfg-${f.key}`
    return (
      <div key={f.key} className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-xs font-medium">
          {f.label}
          {required.has(f.key) && <span className="text-destructive" aria-hidden>*</span>}
        </Label>
        <Input
          id={id}
          type={f.type ?? "text"}
          step={f.step}
          value={String(cfg[f.key] ?? "")}
          placeholder={f.placeholder}
          aria-invalid={issue?.severity === "error" || undefined}
          onChange={(e) => onChange({ [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value } as Partial<InferenceConfig>)}
          className={cn(f.mono && "font-mono text-xs")}
        />
        {issue ? (
          <p className={cn("text-xs", issue.severity === "error" ? "text-destructive" : "text-warning-foreground")}>{issue.message}</p>
        ) : (
          f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Model" description="Approved templates define required parameters.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs font-medium">Model / template</Label>
            <Select value={cfg.templateId} onValueChange={(v) => v && onChange({ templateId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue>{template ? `${template.name} · v${template.version}` : "Select template"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · v{t.version}
                    {!t.builtin && " (custom)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {template && <p className="text-xs text-muted-foreground">{template.description}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Engine</Label>
            <Select value={cfg.engine} onValueChange={(v) => v && onChange({ engine: v as InferenceConfig["engine"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pytorch">PyTorch (DLC 3.x)</SelectItem>
                <SelectItem value="tensorflow">TensorFlow (DLC 2.x)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {MODEL.map(render)}
        </div>
      </Panel>
      <Panel title="MASSIVE resources" description="Placeholders shown — confirm values for your allocation with your HPC team.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{RESOURCES.map(render)}</div>
      </Panel>
      <Panel title="Environment and paths">
        <div className="grid gap-4 md:grid-cols-2">{ENV.map(render)}</div>
      </Panel>
    </div>
  )
}
