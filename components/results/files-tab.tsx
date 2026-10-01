"use client"

import { useState } from "react"
import { DownloadIcon, FileJsonIcon, FileSpreadsheetIcon, FileVideoIcon, ImageIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { downloadText, formatDateTime } from "@/lib/format"
import type { ExportCategory, ExportItem } from "@/lib/exports"
import { STAGES } from "@/lib/stages"
import type { AnalysisState, InferenceConfig } from "@/lib/types"

const ICONS: Record<ExportItem["format"], typeof DownloadIcon> = {
  CSV: FileSpreadsheetIcon,
  SVG: ImageIcon,
  JSON: FileJsonIcon,
  MP4: FileVideoIcon,
}

const CATEGORIES: ExportCategory[] = ["Tables", "Figures", "Clips", "Configuration"]

export function FilesTab({ items, analysis, config }: { items: ExportItem[]; analysis: AnalysisState; config: InferenceConfig | undefined }) {
  const [rendering, setRendering] = useState<string | null>(null)

  const download = (item: ExportItem) => {
    if (item.backendRendered) {
      setRendering(item.id)
      setTimeout(() => {
        setRendering(null)
        toast.info("Annotated clip rendering is handled by the backend", {
          description: "In demo mode no video is produced. Connect a backend in Settings to render clips.",
        })
      }, 900)
      return
    }
    if (!item.build) return
    const { content, type } = item.build()
    downloadText(item.fileName, content, type)
    toast.success(`Downloaded ${item.fileName}`)
  }

  const downloadAllTables = () => {
    const tables = items.filter((i) => i.category === "Tables" && i.available && i.build)
    tables.forEach((t, k) => setTimeout(() => download(t), k * 200))
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Exports"
        description="Each file states its units. Outputs reflect the settings used at each stage's last run."
        actions={
          <Button size="sm" variant="outline" onClick={downloadAllTables}>
            <DownloadIcon data-icon="inline-start" />
            All tables
          </Button>
        }
        bodyClassName="flex flex-col"
      >
        {CATEGORIES.map((cat) => {
          const group = items.filter((i) => i.category === cat)
          if (!group.length) return null
          return (
            <div key={cat} className="flex flex-col border-b border-border last:border-b-0">
              <h3 className="bg-muted/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat}</h3>
              <ul className="flex flex-col divide-y divide-border">
                {group.map((item) => {
                  const Icon = ICONS[item.format]
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-mono text-xs">{item.fileName}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{item.format}</span>
                          {item.backendRendered && <StatusBadge tone="neutral">Backend render</StatusBadge>}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {item.available ? item.description : item.unavailableReason}{" "}
                          {item.available && <span className="font-mono">Units: {item.units}</span>}
                        </p>
                      </div>
                      <Button size="sm" variant={item.available ? "secondary" : "ghost"} disabled={!item.available || rendering === item.id} onClick={() => download(item)}>
                        {rendering === item.id ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
                        {item.backendRendered ? "Render" : "Download"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </Panel>

      <Panel title="Processing provenance" description="Recorded alongside every export in the processing configuration file.">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">DLC project</dt>
          <dd className="break-all font-mono text-xs">{config?.dlcConfigPath ?? "—"}</dd>
          <dt className="text-muted-foreground">Model snapshot</dt>
          <dd className="font-mono text-xs">{config?.snapshot ?? "—"}</dd>
          <dt className="text-muted-foreground">Inference engine</dt>
          <dd className="font-mono text-xs">{config?.engine ?? "—"}</dd>
        </dl>
        <ul className="mt-4 flex flex-col divide-y divide-border rounded-md border border-border">
          {STAGES.map((s) => {
            const run = analysis.stages[s.id].lastRun
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-2">
                <span className="w-44 shrink-0 text-sm font-medium">{s.title}</span>
                {run ? (
                  <>
                    <span className="font-mono text-xs text-muted-foreground tabular">{formatDateTime(run.at)}</span>
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-muted-foreground">
                      {Object.entries(run.configUsed)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join("  ")}
                    </code>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Not run</span>
                )}
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
