import {
  computeAlignment,
  computeBlinks,
  computeCentre,
  computeEvents,
  computeFilter,
  computeFlow,
  computeQuality,
  computeSummary,
  computeVelocity,
  type AlignSettings,
  type AlignedTrial,
  type Blink,
  type BlinkSettings,
  type CentreResult,
  type CentreSettings,
  type EventResult,
  type EventSettings,
  type FilterResult,
  type FilterSettings,
  type FlowResult,
  type FlowSettings,
  type QualityResult,
  type QualitySettings,
  type StimulusSummary,
  type SummarySettings,
  type TrialMetric,
  type VelocityResult,
  type VelocitySettings,
} from "./pipeline"
import type { EyeSignal } from "./signal"
import type { AnalysisState, Session } from "./types"

export interface PipelineResults {
  liveQuality: QualityResult
  quality: QualityResult | null
  centre: CentreResult | null
  filter: FilterResult | null
  velocity: VelocityResult | null
  events: EventResult | null
  blinks: Blink[] | null
  flow: FlowResult | null
  aligned: AlignedTrial[] | null
  summary: { metrics: TrialMetric[]; stimuli: StimulusSummary[] } | null
}

export function computeResults(
  sig: EyeSignal,
  state: AnalysisState,
  session: Session,
  pxPerMm: number | null,
  liveQualitySettings: QualitySettings,
): PipelineResults {
  const run = (id: keyof AnalysisState["stages"]) => state.stages[id].lastRun?.configUsed ?? null
  const liveQuality = computeQuality(sig, liveQualitySettings)
  const qCfg = run("quality") as unknown as (QualitySettings & { corrections: number }) | null
  const quality = qCfg ? computeQuality(sig, qCfg) : null

  const cCfg = run("centre") as unknown as CentreSettings | null
  const centre = quality && qCfg && cCfg ? computeCentre(sig, cCfg, qCfg.lowConfidenceThreshold, state.corrections) : null

  const fCfg = run("filter") as unknown as FilterSettings | null
  const filter = centre && quality && fCfg ? computeFilter(centre, quality, fCfg) : null

  const vCfg = run("velocity") as unknown as VelocitySettings | null
  const velocity = filter && vCfg && fCfg ? computeVelocity(sig, filter, vCfg, pxPerMm, fCfg) : null

  const eCfg = run("events") as unknown as EventSettings | null
  const events = velocity && eCfg ? computeEvents(velocity, eCfg, sig.fps) : null

  const bCfg = run("blinks") as unknown as BlinkSettings | null
  const blinks = quality && bCfg ? computeBlinks(sig, quality, bCfg) : null

  const gCfg = run("flow") as unknown as FlowSettings | null
  const flow = gCfg && velocity ? computeFlow(sig, velocity, gCfg) : null

  const aCfg = run("align") as unknown as AlignSettings | null
  const aligned = session.metadata && aCfg && filter && velocity ? computeAlignment(sig, sig.trials, filter, velocity, aCfg) : null

  const sCfg = run("summary") as unknown as SummarySettings | null
  const summary =
    aligned && sCfg && events && blinks && aCfg
      ? computeSummary(aligned, events, blinks, sCfg, state.excludedTrials, sig.fps, aCfg.preSec)
      : null

  return { liveQuality, quality, centre, filter, velocity, events, blinks, flow, aligned, summary }
}
