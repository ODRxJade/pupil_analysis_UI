/**
 * Mock service layer. Every function mirrors a future REST endpoint on the
 * Pupil Dynamics backend; swap the bodies for fetch() calls against
 * settings.backendUrl when the real service exists.
 */
import { deriveJob } from "./jobs"
import { BUILTIN_TEMPLATES, generateScript } from "./slurm"
import { STAGES, STAGE_MAP, stageConfig } from "./stages"
import type {
  AnalysisState,
  AppSettings,
  Experiment,
  InferenceConfig,
  Job,
  Session,
  SlurmTemplate,
  StageId,
} from "./types"

export const DEMO_MODE = true

const BOOT = Date.now()
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))
const clone = <T,>(v: T): T => structuredClone(v)

const video = (fileName: string, durationSec = 90, fps = 41.8) => ({
  fileName,
  width: 640,
  height: 480,
  durationSec,
  frameCount: Math.round(durationSec * fps),
  fps,
  fpsOverride: null,
})

const mapping = {
  timestamps: "eyeTimestamps",
  stimulusId: "stimID",
  onset: "stimOnset",
  offset: "stimOffset",
}

const defaultRoi = { x: 150, y: 116, width: 340, height: 240 }

const db = {
  settings: {
    backendUrl: "",
    researcher: "Dr. Jade Okafor",
    calibrationPxPerMm: null,
    defaultFps: 41.8,
  } as AppSettings,
  experiments: [
    {
      id: "exp-v1",
      name: "V1 grating adaptation",
      researcher: "Dr. Jade Okafor",
      subjectId: "M-0412",
      notes: "Head-fixed, IR illumination 850 nm. Drifting gratings at 0° and 90°.",
      tags: ["visual", "adaptation"],
      createdAt: BOOT - 86400_000 * 6,
      sessionIds: ["ses-v1-s01", "ses-v1-s02"],
    },
    {
      id: "exp-loom",
      name: "Looming response — cohort B",
      researcher: "Dr. Jade Okafor",
      subjectId: "M-0388",
      notes: "Overhead looming disc, 5 repetitions per block.",
      tags: ["defensive", "looming"],
      createdAt: BOOT - 86400_000 * 3,
      sessionIds: ["ses-loom-s01"],
    },
    {
      id: "exp-flash",
      name: "Dark flash pupillometry",
      researcher: "Dr. Jade Okafor",
      subjectId: "M-0421",
      notes: "Full-field dark flashes, 2 s duration.",
      tags: ["luminance"],
      createdAt: BOOT - 86400_000 * 12,
      sessionIds: ["ses-flash-s01", "ses-flash-s02"],
    },
  ] as Experiment[],
  sessions: [
    {
      id: "ses-v1-s01",
      experimentId: "exp-v1",
      label: "S01",
      recordingDate: "2026-09-22",
      footageSource: "massive",
      footagePath: "/projects/pd-lab/raw/M0412/2026-09-22/eye_cam_S01.avi",
      video: video("eye_cam_S01.avi"),
      roi: defaultRoi,
      metadata: { fileName: "M0412_S01_stim.mat", mapping },
      fullRecording: false,
      predictionsProvided: false,
      createdAt: BOOT - 86400_000 * 6,
    },
    {
      id: "ses-v1-s02",
      experimentId: "exp-v1",
      label: "S02",
      recordingDate: "2026-09-24",
      footageSource: "massive",
      footagePath: "/projects/pd-lab/raw/M0412/2026-09-24/eye_cam_S02.avi",
      video: video("eye_cam_S02.avi"),
      roi: defaultRoi,
      metadata: { fileName: "M0412_S02_stim.mat", mapping },
      fullRecording: false,
      predictionsProvided: false,
      createdAt: BOOT - 86400_000 * 4,
    },
    {
      id: "ses-loom-s01",
      experimentId: "exp-loom",
      label: "S01",
      recordingDate: "2026-09-29",
      footageSource: "upload",
      footagePath: "uploads/M0388/loom_S01.mp4",
      video: video("loom_S01.mp4", 75, 30),
      roi: { x: 160, y: 120, width: 320, height: 230 },
      metadata: null,
      fullRecording: true,
      predictionsProvided: false,
      createdAt: BOOT - 86400_000 * 3,
    },
    {
      id: "ses-flash-s01",
      experimentId: "exp-flash",
      label: "S01",
      recordingDate: "2026-09-14",
      footageSource: "massive",
      footagePath: "/projects/pd-lab/raw/M0421/2026-09-14/flash_S01.avi",
      video: video("flash_S01.avi"),
      roi: defaultRoi,
      metadata: { fileName: "M0421_S01_stim.mat", mapping },
      fullRecording: false,
      predictionsProvided: false,
      createdAt: BOOT - 86400_000 * 12,
    },
    {
      id: "ses-flash-s02",
      experimentId: "exp-flash",
      label: "S02",
      recordingDate: "2026-09-16",
      footageSource: "massive",
      footagePath: "/projects/pd-lab/raw/M0421/2026-09-16/flash_S02.avi",
      video: video("flash_S02.avi"),
      roi: defaultRoi,
      metadata: { fileName: "M0421_S02_stim.mat", mapping },
      fullRecording: false,
      predictionsProvided: false,
      createdAt: BOOT - 86400_000 * 10,
    },
  ] as Session[],
  templates: clone(BUILTIN_TEMPLATES) as SlurmTemplate[],
  configs: {} as Record<string, InferenceConfig>,
  jobs: [] as Job[],
  analysis: {} as Record<string, AnalysisState>,
}

export function defaultConfig(session: Session): InferenceConfig {
  return {
    templateId: "dlc-gpu",
    mode: "researcher",
    dlcConfigPath: "",
    snapshot: "",
    engine: "pytorch",
    batchSize: 8,
    likelihoodThreshold: 0.9,
    account: "",
    partition: "",
    gpuCount: 1,
    gpuType: "",
    cpus: 4,
    memoryGb: 32,
    wallTime: "02:00:00",
    condaEnv: "",
    workDir: "",
    inputPath: session.footageSource === "massive" ? session.footagePath : "",
    outputDir: "",
    email: "",
    customScript: null,
    customScriptBase: null,
    savedAt: null,
    scriptGeneratedAt: null,
  }
}

const demoFilled = (session: Session): InferenceConfig => ({
  ...defaultConfig(session),
  dlcConfigPath: "/projects/pd-lab/models/pupil-dlc/config.yaml",
  snapshot: "snapshot-200",
  account: "pd-lab",
  partition: "demo-gpu",
  gpuType: "demo-gpu-type",
  condaEnv: "dlc3",
  workDir: "/projects/pd-lab/work",
  outputDir: `/projects/pd-lab/dlc-output/${session.id}`,
  savedAt: BOOT - 3600_000,
  scriptGeneratedAt: BOOT - 3600_000,
})

function makeJob(id: string, session: Session, submittedAt: number, extra: Partial<Job> = {}): Job {
  const cfg = db.configs[session.id] ?? demoFilled(session)
  const tpl = db.templates.find((t) => t.id === cfg.templateId) ?? db.templates[0]
  const exp = db.experiments.find((e) => e.id === session.experimentId)
  return {
    id,
    sessionId: session.id,
    experimentId: session.experimentId,
    submittedAt,
    cancelledAt: null,
    failure: null,
    retrieveStartedAt: null,
    labelledVideo: tpl.labelledVideo,
    resources: {
      partition: cfg.partition,
      gpuCount: cfg.gpuCount,
      gpuType: cfg.gpuType,
      cpus: cfg.cpus,
      memoryGb: cfg.memoryGb,
      wallTime: cfg.wallTime,
      account: cfg.account,
    },
    inputPath: cfg.inputPath || session.footagePath,
    outputDir: cfg.outputDir,
    script: generateScript(cfg, tpl, exp, session),
    attempts: 1,
    ...extra,
  }
}

function emptyAnalysis(sessionId: string): AnalysisState {
  return {
    sessionId,
    stages: Object.fromEntries(
      STAGES.map((s) => [s.id, { settings: clone(s.defaults), lastRun: null, failed: null }]),
    ) as AnalysisState["stages"],
    corrections: {},
    excludedTrials: {},
    history: [],
  }
}

function seed() {
  const byId = (id: string) => db.sessions.find((s) => s.id === id)!
  for (const id of ["ses-v1-s01", "ses-v1-s02", "ses-flash-s01", "ses-flash-s02"]) db.configs[id] = demoFilled(byId(id))
  db.configs["ses-loom-s01"] = defaultConfig(byId("ses-loom-s01"))

  db.jobs.push(
    makeJob("SIM-4821937", byId("ses-v1-s01"), BOOT - 3600_000, { retrieveStartedAt: BOOT - 3500_000 }),
    makeJob("SIM-4822410", byId("ses-v1-s02"), BOOT - 14_000),
    makeJob("SIM-4809118", byId("ses-flash-s01"), BOOT - 86400_000 * 9, { retrieveStartedAt: BOOT - 86400_000 * 9 + 120_000 }),
    makeJob("SIM-4810552", byId("ses-flash-s02"), BOOT - 7200_000, {
      failure: {
        phase: "running",
        afterSec: 11,
        message:
          "RuntimeError: CUDA out of memory. Tried to allocate 2.00 GiB (GPU 0; demo device). Reduce batch size and retry.",
      },
    }),
  )

  for (const s of db.sessions) db.analysis[s.id] = emptyAnalysis(s.id)
  const done = db.analysis["ses-flash-s01"]
  let at = BOOT - 86400_000 * 8
  for (const def of STAGES) {
    at += 60_000
    done.stages[def.id].lastRun = {
      at,
      durationMs: def.runMs,
      configUsed: clone(stageConfig(done, def.id)),
      logs: [`Completed ${def.title.toLowerCase()} with default settings.`],
    }
    done.history.push({ at, stageId: def.id, summary: `${def.letter} · ${def.title} run` })
  }
}
seed()

export const api = {
  async getSettings() {
    await delay(120)
    return clone(db.settings)
  },
  async saveSettings(patch: Partial<AppSettings>) {
    await delay(300)
    db.settings = { ...db.settings, ...patch }
    return clone(db.settings)
  },

  async listExperiments() {
    await delay(200)
    return clone(db.experiments).sort((a, b) => b.createdAt - a.createdAt)
  },
  async listSessions() {
    await delay(150)
    return clone(db.sessions)
  },
  async getSession(id: string) {
    await delay(120)
    const s = db.sessions.find((x) => x.id === id)
    if (!s) throw new Error(`Session ${id} not found`)
    return clone(s)
  },
  async updateSession(id: string, patch: Partial<Session>) {
    await delay(250)
    const idx = db.sessions.findIndex((x) => x.id === id)
    db.sessions[idx] = { ...db.sessions[idx], ...patch }
    return clone(db.sessions[idx])
  },
  async createExperiment(input: { experiment: Omit<Experiment, "id" | "createdAt" | "sessionIds">; session: Omit<Session, "id" | "experimentId" | "createdAt"> }) {
    await delay(700)
    const now = Date.now()
    const expId = `exp-${now.toString(36)}`
    const sesId = `ses-${now.toString(36)}`
    const experiment: Experiment = { ...input.experiment, id: expId, createdAt: now, sessionIds: [sesId] }
    const session: Session = { ...input.session, id: sesId, experimentId: expId, createdAt: now }
    db.experiments.push(experiment)
    db.sessions.push(session)
    db.configs[sesId] = defaultConfig(session)
    db.analysis[sesId] = emptyAnalysis(sesId)
    return { experiment: clone(experiment), session: clone(session) }
  },

  async listTemplates() {
    await delay(120)
    return clone(db.templates)
  },
  async saveTemplate(t: Omit<SlurmTemplate, "id" | "builtin">) {
    await delay(300)
    const tpl: SlurmTemplate = { ...t, id: `tpl-${Date.now().toString(36)}`, builtin: false }
    db.templates.push(tpl)
    return clone(tpl)
  },

  async getInferenceConfig(sessionId: string) {
    await delay(150)
    const session = db.sessions.find((s) => s.id === sessionId)!
    db.configs[sessionId] ??= defaultConfig(session)
    return clone(db.configs[sessionId])
  },
  async saveInferenceConfig(sessionId: string, cfg: InferenceConfig) {
    await delay(350)
    db.configs[sessionId] = { ...clone(cfg), savedAt: Date.now() }
    return clone(db.configs[sessionId])
  },

  async listJobs() {
    await delay(120)
    const now = Date.now()
    return db.jobs
      .map((j) => deriveJob(j, db.sessions.find((s) => s.id === j.sessionId), now))
      .sort((a, b) => b.submittedAt - a.submittedAt)
  },
  async submitJob(sessionId: string, script: string, opts: { simulateFailure: boolean }) {
    await delay(600)
    const session = db.sessions.find((s) => s.id === sessionId)!
    const id = `SIM-${4830000 + Math.floor(Math.random() * 9999)}`
    const job = makeJob(id, session, Date.now(), {
      script,
      failure: opts.simulateFailure
        ? { phase: "running", afterSec: 9, message: "FileNotFoundError: snapshot not found at configured path (simulated failure)." }
        : null,
    })
    db.jobs.push(job)
    return deriveJob(job, session, Date.now())
  },
  async cancelJob(id: string) {
    await delay(300)
    const job = db.jobs.find((j) => j.id === id)!
    job.cancelledAt = Date.now()
  },
  async retryJob(id: string) {
    await delay(400)
    const job = db.jobs.find((j) => j.id === id)!
    const phaseStart = job.failure?.phase === "transferring" ? 3 : 16
    job.submittedAt = Date.now() - phaseStart * 1000
    job.failure = null
    job.cancelledAt = null
    job.attempts += 1
  },
  async retrieveOutputs(id: string) {
    await delay(300)
    const job = db.jobs.find((j) => j.id === id)!
    job.retrieveStartedAt = Date.now()
  },

  async getAnalysis(sessionId: string) {
    await delay(100)
    db.analysis[sessionId] ??= emptyAnalysis(sessionId)
    return clone(db.analysis[sessionId])
  },
  async updateStageSettings(sessionId: string, stageId: StageId, settings: Record<string, unknown>) {
    const state = db.analysis[sessionId]
    state.stages[stageId].settings = clone(settings)
    state.stages[stageId].failed = null
    return clone(state)
  },
  async resetStageSettings(sessionId: string, stageId: StageId) {
    const state = db.analysis[sessionId]
    state.stages[stageId].settings = clone(STAGE_MAP[stageId].defaults)
    return clone(state)
  },
  async setCorrection(sessionId: string, frame: number, point: { x: number; y: number } | null) {
    const state = db.analysis[sessionId]
    if (point) state.corrections[frame] = point
    else delete state.corrections[frame]
    return clone(state)
  },
  async setTrialExclusion(sessionId: string, index: number, reason: string | null) {
    const state = db.analysis[sessionId]
    if (reason === null) delete state.excludedTrials[index]
    else state.excludedTrials[index] = reason
    return clone(state)
  },
  async runStage(sessionId: string, stageId: StageId) {
    const def = STAGE_MAP[stageId]
    const started = Date.now()
    await delay(def.runMs)
    const state = db.analysis[sessionId]
    const s = state.stages[stageId].settings
    if (stageId === "filter" && s.smoothing === "savgol" && Number(s.polyorder) >= Number(s.window)) {
      state.stages[stageId].failed = "Polynomial order must be smaller than the window length."
      return clone(state)
    }
    if (stageId === "filter" && Number(s.window) % 2 === 0) {
      state.stages[stageId].failed = "Window length must be odd."
      return clone(state)
    }
    if (stageId === "velocity" && s.units === "mm" && !db.settings.calibrationPxPerMm) {
      state.stages[stageId].failed = "Millimetre units need a px/mm calibration (Settings → Calibration)."
      return clone(state)
    }
    state.stages[stageId].failed = null
    state.stages[stageId].lastRun = {
      at: Date.now(),
      durationMs: Date.now() - started,
      configUsed: clone(stageConfig(state, stageId)),
      logs: [`Ran ${def.title.toLowerCase()} on ${sessionId}.`],
    }
    state.history.unshift({ at: Date.now(), stageId, summary: `${def.letter} · ${def.title} run` })
    return clone(state)
  },
}
