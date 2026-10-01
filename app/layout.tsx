import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import { AppShell } from "@/components/shell/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { WorkspaceProvider } from "@/components/workspace-provider"
import "./globals.css"

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] })
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] })

export const metadata: Metadata = {
  title: "Pupil Dynamics — Eye-tracking analysis portal",
  description:
    "Configure DeepLabCut inference on MASSIVE, review pupil landmarks, and run staged eye-movement and pupil analysis for neuroscience experiments.",
}

export const viewport: Viewport = {
  themeColor: "#1c2a44",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} bg-background`}>
      <body className="font-sans antialiased text-foreground">
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
        <Toaster theme="light" position="bottom-right" />
      </body>
    </html>
  )
}
