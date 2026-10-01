"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ActivityIcon,
  BarChart3Icon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ServerCogIcon,
  SettingsIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/experiments", label: "Experiments", icon: FlaskConicalIcon },
  { href: "/jobs", label: "MASSIVE Jobs", icon: ServerCogIcon },
  { href: "/analysis", label: "Analysis", icon: ActivityIcon },
  { href: "/results", label: "Results", icon: BarChart3Icon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
]

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width]",
        collapsed ? "w-14" : "w-52",
      )}
      aria-label="Primary"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3.5">
        <PupilMark />
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">Pupil Dynamics</span>
            <span className="truncate text-[11px] text-sidebar-foreground/70">Eye-tracking portal</span>
          </div>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active && "text-sidebar-primary")} aria-hidden />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

function PupilMark() {
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 ring-1 ring-sidebar-primary/40" aria-hidden>
      <span className="size-3 rounded-full bg-sidebar-primary" />
      <span className="absolute top-1.5 right-2 size-1 rounded-full bg-sidebar-accent-foreground" />
    </span>
  )
}
