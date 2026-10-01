import { cn } from "@/lib/utils"

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary"

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info/10 text-info ring-info/25",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/15 text-warning-foreground ring-warning/40",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  primary: "bg-primary/10 text-primary ring-primary/25",
}

const DOTS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  primary: "bg-primary",
}

export function StatusBadge({
  tone,
  children,
  pulse,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOTS[tone], pulse && "animate-pulse")} aria-hidden />
      {children}
    </span>
  )
}

export function jobTone(status: string): Tone {
  switch (status) {
    case "ready":
      return "success"
    case "failed":
      return "danger"
    case "cancelled":
      return "neutral"
    case "inference_complete":
      return "primary"
    case "draft":
      return "neutral"
    default:
      return "info"
  }
}

export function stepTone(state: string): Tone {
  switch (state) {
    case "complete":
      return "success"
    case "running":
      return "info"
    case "failed":
      return "danger"
    case "awaiting":
    case "outdated":
    case "modified":
      return "warning"
    case "ready":
      return "primary"
    default:
      return "neutral"
  }
}

export function ProgressBar({ value, className, label }: { value: number | null; className?: string; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {value === null ? (
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-info" style={{ animation: "indeterminate 1.4s ease-in-out infinite" }} />
      ) : (
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, value * 100)}%` }} />
      )}
    </div>
  )
}
