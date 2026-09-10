# Decisions log — when the spec was ambiguous, here's what we did

A running journal of the calls I made when the spec said "design around this"
but didn't pick a number. Most are environment knobs that operators can
override. None of these are "wrong" — they're the most boring choices.

## 1. Heartbeat cadence vs. offline threshold

- Spec: "every 30 seconds" and "no heartbeat for 90 seconds → OFFLINE".
- These are independent. If a heartbeat ever takes 60s because the agent is
  slow, the dashboard would flap IDLE→OFFLINE→IDLE. We pick
  `heartbeatMs = 30_000` and `offlineAfterMs = 90_000` (≈3 missed
  heartbeats), the API enforces the offline threshold. Tunable on both
  sides via env vars.

## 2. Event batch size on the wire

- Spec: "bulk insert".
- The plugin batches up to 100 events per POST, draining the in-memory
  queue in slices. Each POST is one bulk insert. This is conservative —
  we could go higher (Fastify + Prisma easily handles 1k/req), but 100
  keeps payloads < ~80KB even with metadata.

## 3. How the API learns the `agentId`

- Option A: send `agentId` on every event (cheap, simple, but trusts the
  client).
- Option B: pre-register the agent; server binds key → agentId (more
  secure, more setup).
- **We did both.** Every event carries `_agentId` in `metadata` (defence
  in depth) AND the API verifies the bearer token maps to an Agent row.
  If the agent doesn't exist yet, the API upserts on first contact using
  the metadata hostname/platform/version. Belt + braces.

## 4. SSE auth on the dashboard

- Spec says admin auth required.
- We use `Authorization: Bearer <adminKey>` on `EventSource` init via the
  `fetch` polyfill, since `EventSource` doesn't support custom headers.
  Actually — `EventSource` does NOT support custom headers in any browser.
  We use **a query-string token**: `/v1/agents/events/stream?token=...`.
  The API accepts both header and query. The dashboard uses the query
  variant so the native `EventSource` works. The admin key still has to
  be provisioned out-of-band (admin endpoints are header-only).

## 5. Why no `waiting` hook

- OpenClaw 2026.9.2 doesn't expose an "agent is waiting on user input"
  signal cleanly. We synthesise it in the plugin by watching the heartbeat
  gap. v2 may add a real hook once the SDK stabilises.

## 6. Retention cron vs. in-process scheduler

- The spec allows either. We ship an in-process `setInterval` guarded by
  a file lock at `/tmp/menuboard-agents-api.retention.lock` so multiple
  API processes don't all run retention at once. `ops/systemd/` contains
  a timer unit for users who'd rather run retention as a separate cron
  job.

## 7. Where to write the SQLite file

- Spec: "SQLite via Prisma".
- Default path: `apps/api/prisma/dev.db`. The directory is created at
  startup if missing. The Prisma schema is committed (for `prisma
  generate` reproducibility); the actual `.db` is gitignored. A
  `prisma:migrate` script generates the SQL for prod migrations.

## 8. Why the plugin uses fetch and not undici

- Node 24 ships a global `fetch` with `AbortSignal` support. The spec
  asks for no extra HTTP deps. The API also uses fetch — same surface,
  less code.

## 9. Tool result persistence is intentionally NOT a hook we subscribe to

- `tool_result_persist` rewrites transcript messages before they're saved.
  Subscribing to it would risk inverting the side-effect (a slow handler
  blocking the agent's transcript write). We only need *observation*, so
  we use `before_tool_call` / `after_tool_call`, which are observation-safe.

## 10. Cron hooks are subscribed but ignored

- OpenClaw exposes `cron_reconciled` / `cron_changed` as observation
  hooks. The spec doesn't ask for cron visualisation in v1, so we register
  no-op handlers to confirm the plugin is alive but don't surface the
  events. They cost ~zero and we may want them in v2.