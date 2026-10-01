export type JobStatus =
  | "draft"
  | "validating"
  | "transferring"
  | "queued"
  | "running"
  | "inference_complete"
  | "retrieving"
  | "ready"
  | "failed"
  | "cancelled"

export type StepState = "ready" | "running" | "complete" | "failed" | "awaiting" | "blocked"

export interface Roi {
  x: number
  y: number
  width: number
  height: number
}

export interface VideoInfo {
  fileName: string
  width: number
  height: number
  durationSec: number
  frameCount: number
  fps: number
  fpsOverride: { value: number; reason: string } | null
}

export interface MetadataMapping {
  timestamps: string | null
  stimulusId: string | null
  onset: string | null
  offset: string | null
}

export interface SessionMetadata {
  fileName: string
  mapping: MetadataMapping
}

export interface Session {
  id: string
  experimentId: string
  label: string
  recordingDate: string
  footageSource: "upload" | "massive"
  footagePath: string
  video: VideoInfo
  roi: Roi | null
  metadata: SessionMetadata | null
  fullRecording: boolean
  predictionsProvided: boolean
  createdAt: number
}

export interface Experiment {
  id: string
  name: string
  researcher: string
  subjectId: string
  notes: string
  tags: string[]
  createdAt: number
  sessionIds: string[]
}

export type Engine = "pytorch" | "tensorflow"

export interface InferenceConfig {
  templateId: string
  mode: "researcher" | "advanced"
  dlcConfigPath: string
  snapshot: string
  engine: Engine
  batchSize: number
  likelihoodThreshold: number
  account: string
  partition: string
  gpuCount: number
  gpuType: string
  cpus: number
  memoryGb: number
  wallTime: string
  condaEnv: string
  workDir: string
  inputPath: string
  outputDir: string
  email: string
  customScript: string | null
  customScriptBase: string | null
  savedAt: number | null
  scriptGeneratedAt: number | null
}

export interface SlurmTemplate {
  id: string
  name: string
  description: string
  version: string
  requiredParams: (keyof InferenceConfig)[]
  labelledVideo: boolean
  builtin: boolean
  body?: string
}

export interface JobFailure {
  phase: "transferring" | "running"
  afterSec: number
  message: string
}

export interface Job {
  id: string
  sessionId: string
  experimentId: string
  submittedAt: number
  cancelledAt: number | null
  failure: JobFailure | null
  retrieveStartedAt: number | null
  labelledVideo: boolean
  resources: {
    partition: string
    gpuCount: number
    gpuType: string
    cpus: number
    memoryGb: number
    wallTime: string
    account: string
  }
  inputPath: string
  outputDir: string
  script: string
  attempts: number
}

export interface OutputFile {
  name: string
  kind: "predictions" | "log" | "video" | "config"
  sizeBytes: number
  required: boolean
  transfer: "pending" | "transferring" | "transferred" | "unavailable"
}

export interface JobView extends Job {
  status: JobStatus
  elapsedSec: number
  runSec: number
  lastUpdate: number
  phaseProgress: number | null
  logs: { stdout: string[]; stderr: string[] }
  outputs: OutputFile[]
  failedPhase: JobFailure["phase"] | null
}

export type StageId =
  | "quality"
  | "centre"
  | "filter"
  | "velocity"
  | "events"
  | "blinks"
  | "flow"
  | "align"
  | "summary"

export interface StageRun {
  at: number
  durationMs: number
  configUsed: Record<string, unknown>
  logs: string[]
}

export interface StageRecord {
  settings: Record<string, unknown>
  lastRun: StageRun | null
  failed: string | null
}

export interface AnalysisState {
  sessionId: string
  stages: Record<StageId, StageRecord>
  corrections: Record<number, { x: number; y: number }>
  excludedTrials: Record<number, string>
  history: { at: number; stageId: StageId; summary: string }[]
}

export interface AppSettings {
  backendUrl: string
  researcher: string
  calibrationPxPerMm: number | null
  defaultFps: number
}
