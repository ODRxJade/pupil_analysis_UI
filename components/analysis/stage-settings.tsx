"use client"

import { PlayIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel } from "@/components/page-header"
import { STAGE_STATUS } from "@/components/analysis/stage-rail"
import { StatusBadge } from "@/components/status-badge"
import { formatRelative } from "@/lib/format"
import type { StageDef, StageStatusInfo } from "@/lib/stages"
import type { StageRecord } from "@/lib/types"

export function StageSettings({
  def,
  record,
  status,
  runnable,
  running,
  onChange,
  onReset,
  onRun,
}: {
  def: StageDef
  record: StageRecord
  status: StageStatusInfo
  runnable: boolean
  running: boolean
  onChange: (settings: Record<string, unknown>) => void
  onReset: () => void
  onRun: () => void
}) {
  const s = record.settings
  const set = (key: string, value: unknown) => onChange({ ...s, [key]: value })

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground">{def.letter}</span>
          {def.title}
        </span>
      }
      description={def.description}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge tone={STAGE_STATUS[status.status].tone}>{STAGE_STATUS[status.status].label}</StatusBadge>
          {status.reason && <span>{status.reason}</span>}
          {record.lastRun && <span>Last run {formatRelative(record.lastRun.at)}</span>}
        </div>
        {def.fields
          .filter((f) => !f.visibleIf || f.visibleIf(s))
          .map((f) => {
            const id = `stage-${def.id}-${f.key}`
            if (f.kind === "boolean")
              return (
                <div key={f.key} className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor={id} className="text-xs font-medium">
                      {f.label}
                    </Label>
                    {f.help && <p className="text-xs leading-relaxed text-muted-foreground">{f.help}</p>}
                  </div>
                  <Switch id={id} checked={Boolean(s[f.key])} onCheckedChange={(v) => set(f.key, v)} />
                </div>
              )
            if (f.kind === "select")
              return (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium">{f.label}</Label>
                  <Select value={String(s[f.key])} onValueChange={(v) => v && set(f.key, v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{f.options.find((o) => o.value === s[f.key])?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {f.help && <p className="text-xs leading-relaxed text-muted-foreground">{f.help}</p>}
                </div>
              )
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={id} className="text-xs font-medium">
                  {f.label}
                  {f.unit && <span className="font-normal text-muted-foreground"> ({f.unit})</span>}
                </Label>
                <Input
                  id={id}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={String(s[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))}
                  className="font-mono text-xs"
                />
                {f.help && <p className="text-xs leading-relaxed text-muted-foreground">{f.help}</p>}
              </div>
            )
          })}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={!runnable || running} onClick={onRun}>
            <PlayIcon data-icon="inline-start" />
            {running ? "Running…" : record.lastRun ? "Re-run stage" : "Run stage"}
          </Button>
          <Button variant="outline" onClick={onReset} disabled={running} aria-label="Reset to defaults">
            <RotateCcwIcon />
          </Button>
        </div>
        {record.lastRun && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Run log</summary>
            <pre className="mt-2 rounded-md bg-muted p-2 font-mono whitespace-pre-wrap">
              {record.lastRun.logs.join("\n")}
              {`\nDuration ${record.lastRun.durationMs} ms`}
            </pre>
          </details>
        )}
      </div>
    </Panel>
  )
}
