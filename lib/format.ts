export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}h ${m}m ${r}s` : m ? `${m}m ${r}s` : `${r}s`
}

export function formatTimecode(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`
}

export function formatRelative(ts: number, now = Date.now()) {
  const d = Math.round((now - ts) / 1000)
  if (d < 5) return "just now"
  if (d < 60) return `${d}s ago`
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function fmt(v: number | null | undefined, digits = 2) {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits)
}

export function downloadText(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
