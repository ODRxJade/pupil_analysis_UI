"use client"

import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { ArrowRightIcon, DownloadCloudIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Panel } from "@/components/page-header"
import { StatusBadge, type Tone } from "@/components/status-badge"
import { useWorkspace } from "@/components/workspace-provider"
import { api } from "@/lib/api"
import { formatBytes } from "@/lib/format"
import { JOB_STATUS_LABEL } from "@/lib/jobs"
import type { JobView, OutputFile } from "@/lib/types"

const TRANSFER: Record<OutputFile["transfer"], { tone: Tone; label: string }> = {
  pending: { tone: "neutral", label: "On MASSIVE" },
  transferring: { tone: "info", label: "Transferring" },
  transferred: { tone: "success", label: "Retrieved" },
  unavailable: { tone: "neutral", label: "Not produced" },
}

const KIND: Record<OutputFile["kind"], string> = {
  predictions: "Predictions",
  log: "Log",
  video: "Labelled video",
  config: "Config",
}

export function OutputsPanel({ job }: { job: JobView | undefined }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { setSessionId } = useWorkspace()

  if (!job) return <EmptyState title="No job for this session" description="Submit inference from the SLURM script tab." />

  const canRetrieve = job.status === "inference_complete"
  const ready = job.status === "ready"

  return (
    <Panel
      title={`Output manifest · ${job.id}`}
      description={`Remote: ${job.outputDir}`}
      actions={
        <>
          <StatusBadge tone={ready ? "success" : canRetrieve ? "primary" : "neutral"}>{JOB_STATUS_LABEL[job.status]}</StatusBadge>
          {(canRetrieve || job.status === "retrieving") && (
            <Button
              size="sm"
              disabled={job.status === "retrieving"}
              onClick={async () => {
                await api.retrieveOutputs(job.id)
                await mutate("jobs")
                toast.success("Retrieval started", { description: "Backend copies outputs from MASSIVE (simulated)." })
              }}
            >
              <DownloadCloudIcon data-icon="inline-start" />
              {job.status === "retrieving" ? "Retrieving…" : "Retrieve outputs"}
            </Button>
          )}
          {ready && (
            <Button
              size="sm"
              onClick={() => {
                setSessionId(job.sessionId)
                router.push("/analysis")
              }}
            >
              Open analysis workspace
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
        </>
      }
      bodyClassName=""
    >
      {!["inference_complete", "retrieving", "ready"].includes(job.status) && (
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Outputs become retrievable once inference completes. Inference completion and retrieval are separate steps.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Required</TableHead>
            <TableHead>Transfer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {job.outputs.map((f) => (
            <TableRow key={f.name}>
              <TableCell className="font-mono text-xs">{f.name}</TableCell>
              <TableCell className="text-xs">{KIND[f.kind]}</TableCell>
              <TableCell className="font-mono text-xs tabular">{f.transfer === "unavailable" ? "—" : formatBytes(f.sizeBytes)}</TableCell>
              <TableCell className="text-xs">{f.required ? "Yes" : "Optional"}</TableCell>
              <TableCell>
                <StatusBadge tone={TRANSFER[f.transfer].tone} pulse={f.transfer === "transferring"}>
                  {TRANSFER[f.transfer].label}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  )
}
