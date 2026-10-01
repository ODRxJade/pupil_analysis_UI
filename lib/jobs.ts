import type { Job, JobStatus, JobView, OutputFile, Session } from "./types"

export const PHASES = {
  validating: [0, 3],
  transferring: [3, 9],
  queued: [9, 16],
  running: [16, 46],
} as const

export const RETRIEVE_SEC = 7

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  validating: "Validating",
  transferring: "Transferring input",
  queued: "Queued",
  running: "Running",
  inference_complete: "Inference complete",
  retrieving: "Retrieving outputs",
  ready: "Ready for analysis",
  failed: "Failed",
  cancelled: "Cancelled",
}

export const JOB_PIPELINE: JobStatus[] = [
  "validating",
  "transferring",
  "queued",
  "running",
  "inference_complete",
  "retrieving",
  "ready",
]

function stamp(base: number, offsetSec: number) {
  return new Date(base + offsetSec * 1000).toISOString().replace("T", " ").slice(0, 19)
}

function baseName(path: string) {
  const file = path.split("/").pop() ?? "video.avi"
  return file.replace(/\.[^.]+$/, "")
}

export function outputManifest(job: Job, session: Session | undefined): Omit<OutputFile, "transfer">[] {
  const base = baseName(session?.video.fileName ?? job.inputPath)
  const scorer = "DLC_Resnet50_pupilJun12shuffle1_snapshot_200"
  const files: Omit<OutputFile, "transfer">[] = [
    { name: `${base}${scorer}.h5`, kind: "predictions", sizeBytes: 4_812_544, required: true },
    { name: `${base}${scorer}.csv`, kind: "predictions", sizeBytes: 6_201_331, required: true },
    { name: `${base}${scorer}_meta.pickle`, kind: "config", sizeBytes: 12_480, required: true },
    { name: `slurm-${job.id.replace("SIM-", "")}.out`, kind: "log", sizeBytes: 18_240, required: false },
    { name: `slurm-${job.id.replace("SIM-", "")}.err`, kind: "log", sizeBytes: 2_112, required: false },
  ]
  if (job.labelledVideo)
    files.push({ name: `${base}${scorer}_labeled.mp4`, kind: "video", sizeBytes: 182_400_000, required: false })
  return files
}

export function deriveJob(job: Job, session: Session | undefined, now: number): JobView {
  const elapsed = Math.max(0, (now - job.submittedAt) / 1000)
  let status: JobStatus = "validating"
  let phaseProgress: number | null = null
  let failedPhase: JobView["failedPhase"] = null
  let effectiveElapsed = elapsed

  const failAt = job.failure ? PHASES[job.failure.phase][0] + job.failure.afterSec : Infinity
  const cancelAt = job.cancelledAt ? (job.cancelledAt - job.submittedAt) / 1000 : Infinity

  if (elapsed >= failAt && failAt <= cancelAt) {
    status = "failed"
    failedPhase = job.failure!.phase
    effectiveElapsed = failAt
  } else if (elapsed >= cancelAt) {
    status = "cancelled"
    effectiveElapsed = cancelAt
  } else if (elapsed < PHASES.validating[1]) {
    status = "validating"
    phaseProgress = elapsed / PHASES.validating[1]
  } else if (elapsed < PHASES.transferring[1]) {
    status = "transferring"
    phaseProgress = (elapsed - PHASES.transferring[0]) / (PHASES.transferring[1] - PHASES.transferring[0])
  } else if (elapsed < PHASES.queued[1]) {
    status = "queued"
  } else if (elapsed < PHASES.running[1]) {
    status = "running"
  } else if (job.retrieveStartedAt) {
    const r = (now - job.retrieveStartedAt) / 1000
    if (r < RETRIEVE_SEC) {
      status = "retrieving"
      phaseProgress = r / RETRIEVE_SEC
    } else status = "ready"
  } else status = "inference_complete"

  const runSec = Math.max(0, Math.min(effectiveElapsed, PHASES.running[1]) - PHASES.running[0])
  const lastUpdate = job.submittedAt + Math.min(effectiveElapsed, PHASES.running[1]) * 1000

  const stdout: string[] = []
  const stderr: string[] = []
  const at = (s: number) => stamp(job.submittedAt, s)
  const reached = (s: number) => effectiveElapsed >= s
  if (reached(0)) stdout.push(`${at(0)}  [portal] Simulated submission accepted (attempt ${job.attempts}). No job sent to MASSIVE.`)
  if (reached(1)) stdout.push(`${at(1)}  [portal] Validating script directives and required parameters`)
  if (reached(3)) stdout.push(`${at(3)}  [transfer] Staging ${job.inputPath}`)
  if (reached(6)) stdout.push(`${at(6)}  [transfer] 48% of input staged`)
  if (reached(9)) stdout.push(`${at(9)}  [slurm] Submitted batch job ${job.id} to partition ${job.resources.partition || "<PARTITION>"}`)
  if (reached(12)) stdout.push(`${at(12)}  [slurm] Pending (Priority)`)
  if (reached(16)) stdout.push(`${at(16)}  [pd] Starting DeepLabCut inference (${job.id})`)
  if (reached(18)) stdout.push(`${at(18)}  Loading DLC model from snapshot`)
  if (reached(21)) stdout.push(`${at(21)}  Using ${job.resources.gpuCount} × ${job.resources.gpuType || "<GPU_TYPE>"}; batch size from config`)
  if (reached(24)) stdout.push(`${at(24)}  Analysing video ${baseName(job.inputPath)} …`)
  if (reached(34)) stdout.push(`${at(34)}  Frames processed — progress counter not reported by this template`)
  if (reached(44)) stdout.push(`${at(44)}  Saving results in ${job.outputDir}`)
  if (reached(46)) stdout.push(`${at(46)}  [pd] Inference complete`)
  if (reached(26)) stderr.push(`${at(26)}  UserWarning: torch.cuda.amp autocast is deprecated (harmless)`)
  if (status === "failed" && job.failure) stderr.push(`${at(failAt)}  ${job.failure.message}`)
  if (status === "cancelled") stdout.push(`${at(cancelAt)}  [slurm] Job ${job.id} cancelled by user`)

  const manifest = outputManifest(job, session)
  let outputs: OutputFile[] = manifest.map((f) => ({ ...f, transfer: "pending" as const }))
  if (status === "failed" || status === "cancelled") {
    outputs = manifest.map((f) => ({ ...f, transfer: f.kind === "log" ? "transferred" : "unavailable" }))
  } else if (status === "retrieving") {
    const done = Math.floor((phaseProgress ?? 0) * manifest.length)
    outputs = manifest.map((f, i) => ({ ...f, transfer: i < done ? "transferred" : i === done ? "transferring" : "pending" }))
  } else if (status === "ready") {
    outputs = manifest.map((f) => ({ ...f, transfer: "transferred" }))
  }

  return {
    ...job,
    status,
    elapsedSec: effectiveElapsed,
    runSec,
    lastUpdate,
    phaseProgress,
    logs: { stdout, stderr },
    outputs,
    failedPhase,
  }
}

export function isActive(status: JobStatus) {
  return ["validating", "transferring", "queued", "running", "retrieving"].includes(status)
}
