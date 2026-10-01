"use client"

import useSWR from "swr"
import { api } from "@/lib/api"

export function useSettings() {
  return useSWR("settings", () => api.getSettings())
}

export function useExperiments() {
  return useSWR("experiments", () => api.listExperiments())
}

export function useSessions() {
  return useSWR("sessions", () => api.listSessions())
}

export function useTemplates() {
  return useSWR("templates", () => api.listTemplates())
}

export function useInferenceConfig(sessionId: string | null) {
  return useSWR(sessionId ? ["inference-config", sessionId] : null, ([, id]) => api.getInferenceConfig(id))
}

export function useJobs() {
  return useSWR("jobs", () => api.listJobs(), { refreshInterval: 1000 })
}

export function useAnalysis(sessionId: string | null) {
  return useSWR(sessionId ? ["analysis", sessionId] : null, ([, id]) => api.getAnalysis(id))
}
