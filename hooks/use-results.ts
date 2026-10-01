"use client"

import { useMemo } from "react"
import { useSWRConfig } from "swr"
import { useWorkspace } from "@/components/workspace-provider"
import { useSettings } from "@/hooks/use-data"
import { api } from "@/lib/api"
import type { QualitySettings } from "@/lib/pipeline"
import { computeResults } from "@/lib/results"
import { getSignal } from "@/lib/signal"
import { computeStatuses } from "@/lib/stages"
import type { AnalysisState } from "@/lib/types"

export function useSessionResults() {
  const { session, analysis } = useWorkspace()
  const { data: settings } = useSettings()
  const pxPerMm = settings?.calibrationPxPerMm ?? null

  const signal = useMemo(() => (session ? getSignal(session) : null), [session])
  const statuses = useMemo(() => (analysis && session ? computeStatuses(analysis, session) : null), [analysis, session])
  const results = useMemo(() => {
    if (!signal || !analysis || !session) return null
    return computeResults(signal, analysis, session, pxPerMm, analysis.stages.quality.settings as unknown as QualitySettings)
  }, [signal, analysis, session, pxPerMm])

  return { signal, results, statuses, pxPerMm }
}

export function useAnalysisMutate() {
  const { sessionId } = useWorkspace()
  const { mutate } = useSWRConfig()
  return (run: (id: string) => Promise<AnalysisState>) =>
    mutate(["analysis", sessionId], run(sessionId), { revalidate: false })
}
