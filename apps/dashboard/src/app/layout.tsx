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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <header className="mb-8 flex items-center justify-between border-b border-ink-800 pb-4">
            <Link href="/" className="group flex items-center gap-3">
              <span
                className="text-3xl leading-none transition-transform group-hover:scale-110"
                aria-hidden
              >
                🦊
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-ink-50">
                  OpenClaw Mission Control
                </h1>
                <p className="text-xs text-ink-400">
                  Live operations for every OpenClaw agent.
                </p>
              </div>
            </Link>
            <nav className="flex items-center gap-2 text-sm text-ink-300">
              <Link className="mc-link" href="/">
                Agents
              </Link>
              <span aria-hidden className="text-ink-700">·</span>
              <Link className="mc-link" href="/keys">
                Keys
              </Link>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-12 border-t border-ink-800 pt-4 text-xs text-ink-500">
            <p>
              Mission Control · OpenClaw 2026.9.2 · Sanitised lifecycle
              events only.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}