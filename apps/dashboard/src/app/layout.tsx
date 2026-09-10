import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OpenClaw Mission Control",
  description:
    "Live operations dashboard for OpenClaw bots — what every agent is doing, right now.",
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <header className="mb-10">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
              <Link href="/" className="group flex items-center gap-3.5">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fox-500/30 via-fox-500/10 to-indigo-500/20 ring-1 ring-fox-500/40 transition-transform duration-200 group-hover:scale-105 group-hover:rotate-3"
                  aria-hidden
                >
                  <span className="text-2xl drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]">
                    🦊
                  </span>
                </span>
                <div>
                  <h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight sm:text-xl">
                    <span className="mc-grad-text">Mission Control</span>
                    <span className="text-xs font-normal uppercase tracking-[0.2em] text-ink-500">
                      OpenClaw
                    </span>
                  </h1>
                  <p className="text-xs text-ink-400">
                    Live operations for every agent.
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-3">
                <span className="mc-pill bg-emerald-500/10 text-emerald-200 ring-emerald-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 fox-pulse" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
                <nav className="flex items-center gap-1 rounded-lg border border-ink-800 bg-ink-900/60 p-1 text-sm">
                  <Link
                    className="rounded-md px-3 py-1.5 font-medium text-ink-100 hover:bg-ink-800 transition-colors"
                    href="/"
                  >
                    Agents
                  </Link>
                  <Link
                    className="rounded-md px-3 py-1.5 font-medium text-ink-400 hover:bg-ink-800 hover:text-ink-100 transition-colors"
                    href="/keys"
                  >
                    Keys
                  </Link>
                </nav>
              </div>
            </div>
            <div
              aria-hidden
              className="h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"
            />
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-14 border-t border-ink-800/60 pt-5 text-xs text-ink-500">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                Mission Control ·{" "}
                <span className="font-mono text-ink-400">OpenClaw 2026.9.2</span>
              </p>
              <p className="font-mono text-[11px] text-ink-600">
                Sanitised lifecycle events only · No prompt content logged
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
