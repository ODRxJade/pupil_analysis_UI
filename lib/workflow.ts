import { isActive } from "./jobs"
import { computeStatuses, STAGES } from "./stages"
import type { AnalysisState, JobView, Session, StepState } from "./types"

export interface WorkflowStep {
  key: "dataset" | "inference" | "quality" | "analysis" | "results"
  label: string
  state: StepState
  detail: string
  href: string
}

export function sessionWorkflow(session: Session, job: JobView | undefined, analysis: AnalysisState | undefined): WorkflowStep[] {
  const datasetOk = !!session.video && (!!session.metadata || session.fullRecording)
  const inferenceDone = session.predictionsProvided || job?.status === "ready"
  let inference: StepState = "awaiting"
  let inferenceDetail = "No job submitted"
  if (session.predictionsProvided) {
    inference = "complete"
    inferenceDetail = "Predictions provided"
  } else if (job) {
    if (job.status === "ready") {
      inference = "complete"
      inferenceDetail = `${job.id} retrieved`
    } else if (job.status === "failed") {
      inference = "failed"
      inferenceDetail = `${job.id} failed`
    } else if (job.status === "cancelled") {
      inference = "ready"
      inferenceDetail = "Cancelled — resubmit"
    } else if (job.status === "inference_complete") {
      inference = "running"
      inferenceDetail = "Outputs awaiting retrieval"
    } else if (isActive(job.status)) {
      inference = "running"
      inferenceDetail = `${job.id} · ${job.status.replace("_", " ")}`
    }
  }

  const statuses = analysis ? computeStatuses(analysis, session) : null
  const qualityState: StepState = !inferenceDone
    ? "blocked"
    : statuses?.quality.status === "complete"
      ? "complete"
      : "ready"
  const runnable = STAGES.filter((s) => statuses && !(s.needsMetadata && !session.metadata))
  const completeCount = statuses ? runnable.filter((s) => statuses[s.id].status === "complete").length : 0
  const analysisState: StepState =
    qualityState !== "complete" ? "blocked" : completeCount === runnable.length ? "complete" : "ready"

  return [
    {
      key: "dataset",
      label: "Dataset",
      state: datasetOk ? "complete" : "ready",
      detail: session.metadata ? "Video + metadata" : "Video only",
      href: "/experiments",
    },
    { key: "inference", label: "Inference", state: inference, detail: inferenceDetail, href: "/jobs" },
    {
      key: "quality",
      label: "Quality review",
      state: qualityState,
      detail: qualityState === "complete" ? "Landmarks reviewed" : qualityState === "ready" ? "Ready to review" : "Waiting for predictions",
      href: "/analysis",
    },
    {
      key: "analysis",
      label: "Analysis",
      state: analysisState,
      detail: `${completeCount}/${runnable.length} stages complete`,
      href: "/analysis",
    },
    {
      key: "results",
      label: "Results",
      state: analysisState === "complete" ? "complete" : completeCount > 0 ? "ready" : "blocked",
      detail: analysisState === "complete" ? "Exports available" : completeCount > 0 ? "Partial results" : "No results yet",
      href: "/results",
    },
  ]
}
