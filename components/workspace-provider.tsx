"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { useAnalysis, useExperiments, useJobs, useSessions } from "@/hooks/use-data"
import type { AnalysisState, Experiment, JobView, Session } from "@/lib/types"

interface WorkspaceValue {
  sessionId: string
  setSessionId: (id: string) => void
  session: Session | undefined
  experiment: Experiment | undefined
  experiments: Experiment[]
  sessions: Session[]
  job: JobView | undefined
  jobs: JobView[]
  analysis: AnalysisState | undefined
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState("ses-v1-s01")
  const { data: experiments = [], isLoading: le } = useExperiments()
  const { data: sessions = [], isLoading: ls } = useSessions()
  const { data: jobs = [] } = useJobs()
  const { data: analysis } = useAnalysis(sessionId)

  const value = useMemo<WorkspaceValue>(() => {
    const session = sessions.find((s) => s.id === sessionId)
    return {
      sessionId,
      setSessionId,
      session,
      experiment: experiments.find((e) => e.id === session?.experimentId),
      experiments,
      sessions,
      job: jobs.find((j) => j.sessionId === sessionId),
      jobs,
      analysis: analysis?.sessionId === sessionId ? analysis : undefined,
      loading: le || ls,
    }
  }, [sessionId, sessions, experiments, jobs, analysis, le, ls])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider")
  return ctx
}
