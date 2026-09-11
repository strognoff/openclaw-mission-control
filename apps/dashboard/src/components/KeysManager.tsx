"use client";

/**
 * Client component for the Keys page — handles mint/revoke with the
 * plaintext returned only at mint time.
 *
 * Revoked keys are collapsed behind a `<details>` element by default so
 * the table stays focused on what's actually deployed. The collapse state
 * is persisted to localStorage, matching the offline-collapsed pattern in
 * the Agents section on the overview page.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mintKey, revokeKey } from "@/lib/api.client";

interface KeyRow {
  id: string;
  agentId: string;
  keyPrefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function KeysManager({ initialKeys }: { initialKeys: KeyRow[] }) {
  const router = useRouter();
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justMinted, setJustMinted] = useState<{
    agentId: string;
    apiKey: string;
    label: string | null;
  } | null>(null);

  // Collapse state for the revoked-keys section — persisted to localStorage.
  // SSR-safe: defaults to collapsed, then updates on mount (brief flash only).
  const [showRevoked, setShowRevoked] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mc:show-revoked");
      if (stored === "true") setShowRevoked(true);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Split keys into active + revoked. Active keys keep their existing order
  // (server returns newest-first); revoked keys are also newest-first by
  // revokedAt so the most recently revoked shows at the top of the panel.
  const { activeKeys, revokedKeys } = useMemo(() => {
    const active: KeyRow[] = [];
    const revoked: KeyRow[] = [];
    for (const k of initialKeys) {
      if (k.revokedAt) revoked.push(k);
      else active.push(k);
    }
    revoked.sort((a, b) =>
      (b.revokedAt ?? "").localeCompare(a.revokedAt ?? ""),
    );
    return { activeKeys: active, revokedKeys: revoked };
  }, [initialKeys]);

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await mintKey(agentId.trim(), label.trim() || undefined);
      setJustMinted({
        agentId: result.agentId,
        apiKey: result.apiKey,
        label: result.label,
      });
      setAgentId("");
      setLabel("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this key? Any bot using it will lose access.")) {
      return;
    }
    try {
      await revokeKey(id);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function copyToClipboard(value: string) {
    try {
      navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      {justMinted ? (
        <div className="mc-card border-emerald-700/50 bg-emerald-900/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-200">
                Key created for {justMinted.agentId}
                {justMinted.label ? ` (${justMinted.label})` : ""}
              </h3>
              <p className="mt-1 text-xs text-emerald-300/80">
                This is the only time the plaintext key will be shown. Copy
                it now and hand it to your bot.
              </p>
            </div>
            <button
              onClick={() => setJustMinted(null)}
              className="mc-button"
              type="button"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3 flex items-stretch gap-2">
            <code className="flex-1 break-all rounded-md border border-emerald-700/40 bg-ink-950/60 px-3 py-2 font-mono text-xs text-emerald-100">
              {justMinted.apiKey}
            </code>
            <button
              onClick={() => copyToClipboard(justMinted.apiKey)}
              className="mc-button-primary"
              type="button"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleMint} className="mc-card p-5">
        <h3 className="text-sm font-semibold text-ink-100">Mint a new key</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr,1fr,auto]">
          <input
            type="text"
            placeholder="agentId (e.g. youtube-bot)"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="mc-input"
            required
            minLength={1}
            maxLength={128}
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mc-input"
            maxLength={128}
          />
          <button
            type="submit"
            disabled={busy || !agentId.trim()}
            className="mc-button-primary"
          >
            {busy ? "Minting…" : "Mint key"}
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-rose-300">{error}</p>
        ) : null}
      </form>

      {/* Mobile cards (below sm) */}
      <div className="space-y-3 sm:hidden">
        {activeKeys.length === 0 && revokedKeys.length === 0 ? (
          <div className="mc-card px-4 py-8 text-center text-sm text-ink-500">
            No keys minted yet.
          </div>
        ) : (
          activeKeys.map((k) => (
            <div key={k.id} className="mc-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-ink-200">
                    {k.agentId}
                  </div>
                  {k.label ? (
                    <div className="mt-0.5 truncate text-xs text-ink-500">
                      {k.label}
                    </div>
                  ) : null}
                </div>
                <div>
                  <span className="mc-pill bg-emerald-500/10 text-emerald-200 ring-emerald-500/30">
                    active
                  </span>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-ink-500">Prefix</dt>
                  <dd className="font-mono text-ink-300">{k.keyPrefix}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Created</dt>
                  <dd className="text-ink-300">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink-500">Last used</dt>
                  <dd className="text-ink-300">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => handleRevoke(k.id)}
                className="mc-button w-full text-rose-200 hover:bg-rose-500/10"
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>

      {/* Mobile — revoked keys (collapsed by default) */}
      {revokedKeys.length > 0 ? (
        <details
          className="group overflow-hidden rounded-xl border border-ink-800/80 bg-ink-950/40 sm:hidden"
          open={showRevoked}
          onToggle={(e) => {
            const isOpen = (e.target as HTMLDetailsElement).open;
            setShowRevoked(isOpen);
            try {
              localStorage.setItem("mc:show-revoked", String(isOpen));
            } catch {
              /* localStorage unavailable */
            }
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 transition-colors hover:bg-ink-800/40 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <span className="mc-pill bg-rose-500/10 text-rose-200 ring-rose-500/30">
                revoked
              </span>
              <span className="text-sm font-medium text-ink-200">
                {revokedKeys.length} revoked key
                {revokedKeys.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-xs text-ink-500 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="space-y-3 border-t border-ink-800 p-3">
            {revokedKeys.map((k) => (
              <div key={k.id} className="mc-card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-ink-200">
                      {k.agentId}
                    </div>
                    {k.label ? (
                      <div className="mt-0.5 truncate text-xs text-ink-500">
                        {k.label}
                      </div>
                    ) : null}
                  </div>
                  <span className="mc-pill bg-rose-500/10 text-rose-200 ring-rose-500/30">
                    revoked
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-ink-500">Prefix</dt>
                    <dd className="font-mono text-ink-300">{k.keyPrefix}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Revoked</dt>
                    <dd className="text-ink-300">
                      {new Date(k.revokedAt!).toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* Desktop table (sm and up) */}
      <div className="mc-card hidden overflow-hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-ink-950/60 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3 text-left">Agent</th>
              <th className="px-4 py-3 text-left">Label</th>
              <th className="px-4 py-3 text-left">Prefix</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Last used</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {activeKeys.length === 0 && revokedKeys.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-ink-500"
                >
                  No keys minted yet.
                </td>
              </tr>
            ) : activeKeys.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-ink-500"
                >
                  No active keys.{" "}
                  {revokedKeys.length > 0
                    ? `${revokedKeys.length} revoked key${revokedKeys.length === 1 ? "" : "s"} below.`
                    : ""}
                </td>
              </tr>
            ) : (
              activeKeys.map((k) => (
                <tr key={k.id} className="text-ink-200">
                  <td className="px-4 py-3 font-mono text-xs">{k.agentId}</td>
                  <td className="px-4 py-3 text-xs">{k.label ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{k.keyPrefix}</td>
                  <td className="px-4 py-3 text-xs text-ink-400">
                    {new Date(k.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-400">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevoke(k.id)}
                      className="mc-button text-rose-200 hover:bg-rose-500/10"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Desktop — revoked keys (collapsed by default) */}
      {revokedKeys.length > 0 ? (
        <details
          className="group overflow-hidden rounded-xl border border-ink-800/80 bg-ink-950/40 hidden sm:block"
          open={showRevoked}
          onToggle={(e) => {
            const isOpen = (e.target as HTMLDetailsElement).open;
            setShowRevoked(isOpen);
            try {
              localStorage.setItem("mc:show-revoked", String(isOpen));
            } catch {
              /* localStorage unavailable */
            }
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 transition-colors hover:bg-ink-800/40 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <span className="mc-pill bg-rose-500/10 text-rose-200 ring-rose-500/30">
                revoked
              </span>
              <span className="text-sm font-medium text-ink-200">
                {revokedKeys.length} revoked key
                {revokedKeys.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-xs text-ink-500 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="border-t border-ink-800">
            <table className="w-full text-sm">
              <thead className="bg-ink-950/60 text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left">Agent</th>
                  <th className="px-4 py-3 text-left">Label</th>
                  <th className="px-4 py-3 text-left">Prefix</th>
                  <th className="px-4 py-3 text-left">Revoked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {revokedKeys.map((k) => (
                  <tr key={k.id} className="text-ink-300">
                    <td className="px-4 py-3 font-mono text-xs">{k.agentId}</td>
                    <td className="px-4 py-3 text-xs">{k.label ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{k.keyPrefix}</td>
                    <td className="px-4 py-3 text-xs text-ink-400">
                      {new Date(k.revokedAt!).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}