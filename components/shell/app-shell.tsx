"use client"

import { useState, type ReactNode } from "react"
import { AppSidebar } from "./app-sidebar"
import { TopBar } from "./top-bar"

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
