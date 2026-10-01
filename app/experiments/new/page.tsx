"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FileIcon, ServerIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel } from "@/components/page-header"
import { ProgressBar, StatusBadge } from "@/components/status-badge"
import { FileDrop } from "@/components/experiments/file-drop"
import { RoiEditor } from "@/components/experiments/roi-editor"
import { useWorkspace } from "@/components/workspace-provider"
import { useSettings } from "@/hooks/use-data"
import { api } from "@/lib/api"
import { formatBytes, formatDuration, formatTimecode } from "@/lib/format"
import { getSignal } from "@/lib/signal"
import type { MetadataMapping, Roi, Session, VideoInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

const STEPS = ["Experiment details", "Footage", "Metadata", "ROI", "Review"] as const

interface UploadItem {
  id: string
  name: string
  size: number
  progress: number
  status: "uploading" | "validating" | "valid" | "invalid"
  message?: string
  info?: Omit<VideoInfo, "fileName" | "fpsOverride">
}

const MAT_VARIABLES = ["eye_ts", "frame_times", "stim_id", "stim_onset", "stim_offset", "trial_id", "photodiode"]
const VIDEO_EXT = /\.(mp4|avi|mov|mkv)$/i

function probeVideo(name: string, size: number) {
  const seed = name.length + (size % 97)
  const fps = [30, 60, 90][seed % 3]
  const durationSec = 300 + (seed % 7) * 30
  return { width: 640, height: 480, fps, durationSec, frameCount: Math.round(fps * durationSec) }
}

export default function NewExperimentPage() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { setSessionId } = useWorkspace()
  const { data: settings } = useSettings()
  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)

  const [details, setDetails] = useState({
    name: "",
    researcher: "",
    subjectId: "",
    recordingDate: new Date().toISOString().slice(0, 10),
    sessionLabel: "S01",
    notes: "",
    tags: "",
  })
  const [source, setSource] = useState<"upload" | "massive">("upload")
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [remotePath, setRemotePath] = useState("")
  const [remoteInfo, setRemoteInfo] = useState<UploadItem["info"] | null>(null)
  const [checkingRemote, setCheckingRemote] = useState(false)
  const [fpsOverride, setFpsOverride] = useState({ enabled: false, value: "", reason: "" })
  const [predictions, setPredictions] = useState<{ name: string; size: number } | null>(null)
  const [mat, setMat] = useState<{ name: string; size: number } | null>(null)
  const [mapping, setMapping] = useState<MetadataMapping>({ timestamps: null, stimulusId: null, onset: null, offset: null })
  const [roi, setRoi] = useState<Roi | null>({ x: 150, y: 116, width: 340, height: 240 })
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const researcher = details.researcher || settings?.researcher || ""
  const primary = source === "upload" ? uploads.find((u) => u.status === "valid") : remoteInfo ? { name: remotePath.split("/").pop() ?? "remote.mp4", info: remoteInfo } : undefined
  const primaryInfo = primary?.info

  const addFiles = (files: { name: string; size: number }[]) => {
    for (const f of files) {
      const id = `${f.name}-${Math.random().toString(36).slice(2, 7)}`
      const invalid = !VIDEO_EXT.test(f.name)
      setUploads((u) => [...u, { id, name: f.name, size: f.size, progress: 0, status: "uploading" }])
      timers.current[id] = setInterval(() => {
        setUploads((list) =>
          list.map((u) => {
            if (u.id !== id || u.status !== "uploading") return u
            const progress = Math.min(1, u.progress + 0.18 + Math.random() * 0.12)
            if (progress < 1) return { ...u, progress }
            clearInterval(timers.current[id])
            setTimeout(() => {
              setUploads((l) =>
                l.map((x) =>
                  x.id === id
                    ? invalid
                      ? { ...x, status: "invalid", message: "Unsupported container — expected .mp4, .avi, .mov or .mkv" }
                      : { ...x, status: "valid", info: probeVideo(f.name, f.size) }
                    : x,
                ),
              )
            }, 700)
            return { ...u, progress: 1, status: "validating" }
          }),
        )
      }, 260)
    }
  }

  const removeUpload = (id: string) => {
    clearInterval(timers.current[id])
    setUploads((u) => u.filter((x) => x.id !== id))
  }

  const checkRemote = async () => {
    setCheckingRemote(true)
    setRemoteInfo(null)
    await new Promise((r) => setTimeout(r, 900))
    setCheckingRemote(false)
    if (!/^\/.+\.(mp4|avi|mov|mkv)$/i.test(remotePath)) {
      toast.error("Remote path not found", { description: "Enter an absolute path to a video file on MASSIVE, e.g. /fs04/<project>/raw/eye.mp4" })
      return
    }
    setRemoteInfo(probeVideo(remotePath, remotePath.length * 1013))
  }

  const draftSession: Session | null = useMemo(() => {
    if (!primary || !primaryInfo) return null
    const fpsVal = Number(fpsOverride.value)
    return {
      id: `draft-${primary.name}`,
      experimentId: "draft",
      label: details.sessionLabel || "S01",
      recordingDate: details.recordingDate,
      footageSource: source,
      footagePath: source === "massive" ? remotePath : `uploads/${primary.name}`,
      video: {
        fileName: primary.name,
        ...primaryInfo,
        fpsOverride: fpsOverride.enabled && fpsVal > 0 ? { value: fpsVal, reason: fpsOverride.reason } : null,
      },
      roi,
      metadata: mat ? { fileName: mat.name, mapping } : null,
      fullRecording: !mat,
      predictionsProvided: !!predictions,
      createdAt: 0,
    }
  }, [primary, primaryInfo, details.sessionLabel, details.recordingDate, source, remotePath, fpsOverride, roi, mat, mapping, predictions])

  const mappingComplete = !mat || Object.values(mapping).every(Boolean)
  const trials = useMemo(() => (draftSession && mat && mappingComplete ? getSignal(draftSession).trials.slice(0, 8) : []), [draftSession, mat, mappingComplete])

  const stepValid = [
    !!details.name.trim() && !!researcher.trim() && !!details.subjectId.trim() && !!details.sessionLabel.trim(),
    !!primaryInfo && (!fpsOverride.enabled || (Number(fpsOverride.value) > 0 && fpsOverride.reason.trim().length >= 5)) && !uploads.some((u) => u.status === "uploading" || u.status === "validating"),
    mappingComplete,
    true,
    true,
  ]

  const create = async () => {
    if (!draftSession) return
    setCreating(true)
    try {
      const { session } = await api.createExperiment({
        experiment: {
          name: details.name.trim(),
          researcher: researcher.trim(),
          subjectId: details.subjectId.trim(),
          notes: details.notes,
          tags: details.tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
        session: { ...draftSession, roi },
      })
      await Promise.all([mutate("experiments"), mutate("sessions")])
      setSessionId(session.id)
      toast.success("Experiment created", { description: `${details.name} · ${session.label} saved (demo data store).` })
      router.push(predictions ? "/analysis" : "/jobs")
    } catch (e) {
      toast.error("Could not create experiment", { description: (e as Error).message })
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="New experiment" description="Register an experiment and session, attach footage and metadata, and choose the ROI used for inference." />
      <div className="flex flex-col gap-6 p-6">
        <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
          {STEPS.map((label, k) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => k <= step || stepValid.slice(0, k).every(Boolean) ? setStep(k) : undefined}
                aria-current={k === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                  k === step ? "border-primary bg-primary text-primary-foreground" : k < step ? "border-primary/30 bg-primary/5 text-primary" : "border-border text-muted-foreground",
                )}
              >
                <span className="flex size-4 items-center justify-center text-xs">{k < step ? <CheckIcon className="size-3.5" aria-hidden /> : k + 1}</span>
                {label}
              </button>
              {k < STEPS.length - 1 && <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Panel title="Experiment details">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Experiment name" required>
                <Input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} placeholder="e.g. V1 orientation tuning cohort B" />
              </Field>
              <Field label="Researcher" required>
                <Input value={researcher} onChange={(e) => setDetails({ ...details, researcher: e.target.value })} />
              </Field>
              <Field label="Subject identifier" required>
                <Input value={details.subjectId} onChange={(e) => setDetails({ ...details, subjectId: e.target.value })} placeholder="e.g. M-2291" className="font-mono" />
              </Field>
              <Field label="Recording date" required>
                <Input type="date" value={details.recordingDate} onChange={(e) => setDetails({ ...details, recordingDate: e.target.value })} />
              </Field>
              <Field label="Session identifier" required>
                <Input value={details.sessionLabel} onChange={(e) => setDetails({ ...details, sessionLabel: e.target.value })} className="font-mono" />
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input value={details.tags} onChange={(e) => setDetails({ ...details, tags: e.target.value })} placeholder="awake, head-fixed" />
              </Field>
              <Field label="Notes" className="md:col-span-2 xl:col-span-3">
                <Textarea value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} rows={3} placeholder="Lighting, anaesthesia, camera setup…" />
              </Field>
            </div>
          </Panel>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <Panel
              title="Eye footage"
              actions={
                <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Footage source">
                  {(["upload", "massive"] as const).map((m) => (
                    <button
                      key={m}
                      role="radio"
                      aria-checked={source === m}
                      onClick={() => setSource(m)}
                      className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", source === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {m === "upload" ? <UploadIcon className="size-3.5" aria-hidden /> : <ServerIcon className="size-3.5" aria-hidden />}
                      {m === "upload" ? "Upload from computer" : "Path on MASSIVE"}
                    </button>
                  ))}
                </div>
              }
            >
              {source === "upload" ? (
                <div className="flex flex-col gap-4">
                  <FileDrop accept="video/*,.avi,.mkv" multiple label="Drop eye recordings here" hint="Multiple recordings supported · .mp4 .avi .mov .mkv" onFiles={addFiles} />
                  {uploads.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead className="w-48">Upload</TableHead>
                          <TableHead>Validation</TableHead>
                          <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {uploads.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-mono text-xs">{u.name}</TableCell>
                            <TableCell className="font-mono text-xs tabular">{formatBytes(u.size)}</TableCell>
                            <TableCell>
                              <ProgressBar value={u.progress} label={`Upload ${u.name}`} />
                            </TableCell>
                            <TableCell>
                              {u.status === "uploading" && <StatusBadge tone="info" pulse>Uploading {Math.round(u.progress * 100)}%</StatusBadge>}
                              {u.status === "validating" && <StatusBadge tone="info" pulse>Validating</StatusBadge>}
                              {u.status === "valid" && <StatusBadge tone="success">Valid</StatusBadge>}
                              {u.status === "invalid" && (
                                <span className="flex flex-col gap-1">
                                  <StatusBadge tone="danger">Invalid</StatusBadge>
                                  <span className="text-xs text-destructive">{u.message}</span>
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button size="icon-sm" variant="ghost" onClick={() => removeUpload(u.id)} aria-label={`Remove ${u.name}`}>
                                <Trash2Icon />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {uploads.filter((u) => u.status === "valid").length > 1 && (
                    <p className="text-xs text-muted-foreground">The first valid recording is used for this session. Additional recordings can be registered as further sessions.</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Field label="Remote footage path" hint="Absolute path on MASSIVE. The backend checks the file exists; the browser never connects to the cluster.">
                    <div className="flex gap-2">
                      <Input value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="/fs04/<project>/raw/<subject>/eye.mp4" className="font-mono" />
                      <Button variant="outline" onClick={checkRemote} disabled={!remotePath || checkingRemote}>
                        {checkingRemote ? "Checking…" : "Validate path"}
                      </Button>
                    </div>
                  </Field>
                  {remoteInfo && <StatusBadge tone="success" className="w-fit">Remote file found (simulated)</StatusBadge>}
                </div>
              )}
            </Panel>

            {primaryInfo && (
              <Panel title="Detected video properties" description={primary?.name}>
                <div className="flex flex-col gap-4">
                  <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Stat label="Dimensions" value={`${primaryInfo.width} × ${primaryInfo.height} px`} />
                    <Stat label="Duration" value={formatDuration(primaryInfo.durationSec)} />
                    <Stat label="Frame count" value={primaryInfo.frameCount.toLocaleString()} />
                    <Stat label="Frame rate" value={`${primaryInfo.fps.toFixed(2)} fps`} />
                  </dl>
                  <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                    <label className="flex items-center gap-3 text-sm">
                      <Switch checked={fpsOverride.enabled} onCheckedChange={(v) => setFpsOverride({ ...fpsOverride, enabled: v })} />
                      Override detected frame rate
                    </label>
                    {fpsOverride.enabled && (
                      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                        <Field label="Frame rate (fps)" required>
                          <Input type="number" min={1} step={0.01} value={fpsOverride.value} onChange={(e) => setFpsOverride({ ...fpsOverride, value: e.target.value })} className="font-mono" />
                        </Field>
                        <Field label="Reason (recorded with session)" required>
                          <Input value={fpsOverride.reason} onChange={(e) => setFpsOverride({ ...fpsOverride, reason: e.target.value })} placeholder="e.g. container header reports 30 fps; camera triggered at 59.94 Hz" />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            )}

            <Panel title="Existing DeepLabCut predictions" description="Optional. Supplying a CSV or H5 prediction file bypasses MASSIVE inference.">
              {predictions ? (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="flex items-center gap-2 font-mono text-xs">
                    <FileIcon className="size-4" aria-hidden />
                    {predictions.name} · {formatBytes(predictions.size)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setPredictions(null)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <FileDrop accept=".csv,.h5" label="Drop DeepLabCut predictions" hint=".csv or .h5" onFiles={(f) => setPredictions(f[0])} />
              )}
            </Panel>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <Panel title="MATLAB metadata" description="Upload the .mat file with eye timestamps and stimulus timing. Without it the session is analysed as a full recording.">
              {mat ? (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="flex items-center gap-2 font-mono text-xs">
                    <FileIcon className="size-4" aria-hidden />
                    {mat.name} · {formatBytes(mat.size)} · {MAT_VARIABLES.length} variables
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setMat(null)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <FileDrop
                    accept=".mat"
                    label="Drop .mat metadata"
                    hint="MATLAB v7 / v7.3"
                    onFiles={(f) => {
                      setMat(f[0])
                      setMapping({ timestamps: "eye_ts", stimulusId: "stim_id", onset: "stim_onset", offset: "stim_offset" })
                    }}
                  />
                  <StatusBadge tone="neutral" className="w-fit">No metadata · full-recording analysis</StatusBadge>
                </div>
              )}
            </Panel>
            {mat && (
              <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
                <Panel title="Variable mapping">
                  <div className="flex flex-col gap-3">
                    {(
                      [
                        ["timestamps", "Eye timestamps"],
                        ["stimulusId", "Stimulus identifiers"],
                        ["onset", "Stimulus onset"],
                        ["offset", "Stimulus offset"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label} required>
                        <Select value={mapping[key] ?? ""} onValueChange={(v) => setMapping({ ...mapping, [key]: v || null })}>
                          <SelectTrigger className="w-full font-mono">
                            <SelectValue placeholder="Select variable" />
                          </SelectTrigger>
                          <SelectContent>
                            {MAT_VARIABLES.map((v) => (
                              <SelectItem key={v} value={v} className="font-mono">
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ))}
                  </div>
                </Panel>
                <Panel title="Parsed trial preview" description={mappingComplete ? `First ${trials.length} trials` : "Complete the mapping to preview trials."} bodyClassName="">
                  {mappingComplete && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trial</TableHead>
                          <TableHead>Stimulus</TableHead>
                          <TableHead>Onset</TableHead>
                          <TableHead>Offset</TableHead>
                          <TableHead>Checks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trials.map((t) => (
                          <TableRow key={t.index}>
                            <TableCell className="font-mono text-xs">{t.index + 1}</TableCell>
                            <TableCell className="font-mono text-xs">{t.stimulusId}</TableCell>
                            <TableCell className="font-mono text-xs tabular">{formatTimecode(t.onset)}</TableCell>
                            <TableCell className="font-mono text-xs tabular">{formatTimecode(t.offset)}</TableCell>
                            <TableCell>
                              {t.missingTimestamps ? (
                                <StatusBadge tone="danger">Missing timestamps</StatusBadge>
                              ) : t.timingMismatchMs ? (
                                <StatusBadge tone="warning">Timing Δ {t.timingMismatchMs} ms</StatusBadge>
                              ) : (
                                <StatusBadge tone="success">OK</StatusBadge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Panel>
              </div>
            )}
          </div>
        )}

        {step === 3 && draftSession && (
          <Panel title="Region of interest" description="Saved with the session configuration and applied as the inference crop.">
            <RoiEditor session={draftSession} roi={roi} onChange={setRoi} />
          </Panel>
        )}

        {step === 4 && draftSession && (
          <Panel title="Review">
            <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
              <Review label="Experiment" value={details.name} />
              <Review label="Researcher" value={researcher} />
              <Review label="Subject / session" value={`${details.subjectId} · ${draftSession.label} · ${details.recordingDate}`} />
              <Review label="Footage" value={`${source === "massive" ? "MASSIVE" : "Upload"} · ${draftSession.footagePath}`} mono />
              <Review
                label="Video"
                value={`${draftSession.video.width}×${draftSession.video.height} · ${draftSession.video.frameCount.toLocaleString()} frames · ${(draftSession.video.fpsOverride?.value ?? draftSession.video.fps).toFixed(2)} fps${draftSession.video.fpsOverride ? ` (override: ${draftSession.video.fpsOverride.reason})` : ""}`}
              />
              <Review label="Metadata" value={mat ? `${mat.name} → ${Object.values(mapping).join(", ")}` : "None · full-recording analysis"} />
              <Review label="ROI (original-frame px)" value={roi ? `x ${roi.x}, y ${roi.y}, ${roi.width}×${roi.height}` : "Full frame"} mono />
              <Review label="Predictions" value={predictions ? `${predictions.name} · inference bypassed` : "Run DeepLabCut on MASSIVE"} />
            </dl>
          </Panel>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="outline" onClick={() => (step === 0 ? router.push("/experiments") : setStep(step - 1))}>
            <ChevronLeftIcon data-icon="inline-start" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!stepValid[step]}>
              Continue
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button onClick={create} disabled={creating}>
              {creating ? "Creating…" : predictions ? "Create and open analysis" : "Create and configure inference"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive" aria-hidden>*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular">{value}</dd>
    </div>
  )
}

function Review({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("break-all", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  )
}
