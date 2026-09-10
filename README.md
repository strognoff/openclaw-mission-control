# OpenClaw Mission Control

Live operations dashboard for OpenClaw bots. A single shared screen that shows
what every agent in your fleet is doing, in real time — what task, what tool,
how long it's been running, and a chronological activity stream that updates
without a manual refresh. Built for privacy (prompts, responses, cookies,
env vars, headers are stripped before they leave the agent), resilience (a
down or slow API never disturbs OpenClaw), and the boring reliability of
SQLite + a Node process you can put behind your existing nginx.

## At a glance

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       OpenClaw Gateway (host)                          │
   │                                                                        │
   │    ┌───────────────────────────────────────────────────────┐           │
   │    │       packages/plugin   (@openclaw-mc/plugin)         │           │
   │    │   sanitises hook events, queues, retries, heartbeats  │           │
   │    └──────────┬────────────────────────────────────────────┘           │
   │               │ HTTPS POST /v1/agents/events                           │
   │               ▼                                                        │
   │   ┌────────────────────────────────────────┐                           │
   │   │          apps/api  (Fastify)            │      ┌───────────────┐    │
   │   │  bcrypt auth · SSE broker · reaper ·    │◀────▶│ SQLite (file) │    │
   │   │            in-process retention         │      └───────────────┘    │
   │   └─────────┬──────────────────────────────┘                           │
   │             │ https://api.menuboard.online/v1/agents                   │
   │             │                                                            │
   │             ▼                                                            │
   │   ┌────────────────────────────────────────┐                           │
   │   │     apps/dashboard  (Next.js 14)        │  ← browser  ←  operator  │
   │   │  https://menuboard.online/agents/        │                           │
   │   └─────────────────────────────────────────┘                           │
   └────────────────────────────────────────────────────────────────────────┘
```

## Quickstart (local dev)

Requires Node 20+ (we develop on Node 24.20) and npm 10+.

```bash
# 1. Install everything.
npm install

# 2. Generate the API admin key.
node -e "console.log('MC_ADMIN_KEY=' + require('crypto').randomBytes(32).toString('hex'))" \
  >> apps/api/.env
node -e "console.log('MC_ADMIN_KEY=' + require('crypto').randomBytes(32).toString('hex'))" \
  >> apps/dashboard/.env

# 3. Boot the API.
cd apps/api
cp .env.example .env   # if you haven't already
npx prisma generate
npx tsx prisma/seed.ts  # creates dev.db
npm run dev             # http://127.0.0.1:8787

# 4. Boot the dashboard in a second terminal.
cd apps/dashboard
npm run dev             # http://127.0.0.1:3000/agents
```

Mint a key from the dashboard's `/agents/keys` page, drop it into your
plugin config, restart OpenClaw, and the bot appears.

## Production deployment checklist

This round ships CODE only. To go live on the VPS Jeff will need to
approve the following sequence; nothing in this list touches the box
until you say go.

1. **Provision a host.** `/opt/menuboard/mission-control` (matching the
   path the systemd units expect).
2. **Copy files.** `git clone … /opt/menuboard/mission-control` then
   `npm install --omit=dev` in each workspace that needs runtime deps.
3. **Generate an admin key.** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   into `/etc/menuboard/mission-control.env`.
4. **Build the API.** `cd apps/api && npx prisma generate && npx tsc -p tsconfig.json`.
5. **Build the dashboard.** `cd apps/dashboard && npx next build` (the
   standalone output lives at `.next/standalone/apps/dashboard/`).
6. **Install systemd units.** `cp ops/systemd/*.service ops/systemd/*.timer
   /etc/systemd/system/ && systemctl daemon-reload`.
7. **Start the API.**
   `systemctl enable --now menuboard-mission-control-api`.
8. **Start the dashboard.**
   `systemctl enable --now menuboard-mission-control-web`.
9. **Wire nginx.** Add the snippets from `ops/nginx/menuboard-mission-control.conf`
   to the existing `menuboard-marketing` and `menuboard-scraper` vhosts,
   then `nginx -t && systemctl reload nginx`.
10. **Verify.** `curl https://api.menuboard.online/v1/agents/health` (yes,
    `/health`, not `/v1/agents/health` — see apps/api README). Open
    `https://menuboard.online/agents/` and confirm the overview loads.
11. **Mint a key for the existing bot** from the dashboard, drop it into
    the bot's OpenClaw config (see "Adding a second OpenClaw" below),
    restart the gateway, watch the bot appear.

## Adding a second OpenClaw bot

The plugin reads five env vars; everything else is the dashboard's problem.

| Env var                          | Required | Example                                |
|----------------------------------|----------|----------------------------------------|
| `MISSION_CONTROL_URL`            | yes      | `https://api.menuboard.online/v1/agents` |
| `MISSION_CONTROL_AGENT_ID`       | yes      | `youtube-bot`                          |
| `MISSION_CONTROL_AGENT_NAME`     | yes      | `YouTube Bot`                          |
| `MISSION_CONTROL_API_KEY`        | yes      | `mc_<…>` (issued from `/agents/keys`)   |
| `MISSION_CONTROL_HEARTBEAT_MS`   | no       | `30000` (default)                      |

To wire it into OpenClaw 2026.9.2:

1. Install the plugin: `openclaw plugins install clawhub:strognoff/openclaw-mission-control`
   (or link a local checkout with `openclaw plugins install --link ./packages/plugin --force`).
2. Mint a key from the dashboard (or via `POST /v1/agents/admin/keys`).
3. Enable the plugin and add to `openclaw.json`:
   ```json
   {
     "plugins": {
       "entries": {
         "openclaw-mission-control": {
           "enabled": true,
           "config": {
             "url": "https://api.menuboard.online/v1/agents",
             "agentId": "youtube-bot",
             "agentName": "YouTube Bot",
             "apiKey": "mc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
           }
         }
       }
     }
   }
   ```
4. `openclaw gateway restart`.
5. The bot appears on `https://menuboard.online/agents/` within a few seconds.
6. If anything goes wrong, the plugin keeps running — it never throws into
   OpenClaw. Check `openclaw logs | grep mc` for the `[mc]` log prefix.

## Event-type mapping (spec → OpenClaw hook)

| Spec event        | OpenClaw 2026.9.2 hook                | Code                                                                |
|-------------------|---------------------------------------|---------------------------------------------------------------------|
| `agent_online`    | `gateway_start` + `session_start`     | `packages/plugin/src/index.ts` (lines ~80-100) + `bridge.ts`        |
| `agent_offline`   | `gateway_stop` + `session_end(shutdown)` | `packages/plugin/src/index.ts` (~85-100) + `bridge.ts`           |
| `run_started`     | `before_agent_run`                    | `packages/plugin/src/index.ts` (~106) + `bridge.ts mapAgentRunStart` |
| `run_completed`   | `agent_end` with `event.success=true`  | `packages/plugin/src/index.ts` (~111) + `bridge.ts mapAgentRunEnd`   |
| `run_failed`      | `agent_end` with `event.success=false` | same                                                                |
| `thinking`        | `model_call_started`                  | `packages/plugin/src/index.ts` (~121) + `bridge.ts mapModelCallStart` |
| `tool_started`    | `before_tool_call`                    | `packages/plugin/src/index.ts` (~131) + `bridge.ts mapToolStart`    |
| `tool_completed`  | `after_tool_call` (no `event.error`)  | `packages/plugin/src/index.ts` (~135) + `bridge.ts mapToolEnd`       |
| `tool_failed`     | `after_tool_call` (has `event.error`) | same                                                                |
| `heartbeat`       | in-process `setInterval`               | `packages/plugin/src/sender.ts tickHeartbeat`                       |
| `status_changed`  | synthesised on session/agent boundary changes | `packages/plugin/src/bridge.ts mapSessionEnd`              |
| `waiting`         | synthesised (idle gap > 60s)           | `packages/plugin/src/sender.ts` (deferred; v1 emits only via heartbeat) |

Why no exact `run_started`/`run_completed`? OpenClaw 2026.9.2 doesn't
expose those names. The closest equivalents (`before_agent_run`,
`agent_end`) carry the same semantics. See
[`packages/plugin/docs/hook-mapping.md`](packages/plugin/docs/hook-mapping.md)
for the full reasoning and the rationale for skipping `llm_input` /
`llm_output` (they contain prompts/responses — sanitising them would
defeat their purpose).

## Sanitisation policy

Before the plugin sends anything to the API, it walks every value
through `sanitise()`. The rules, exhaustively tested in
[`packages/shared/src/sanitise.test.ts`](packages/shared/src/sanitise.test.ts):

- **Whitelisted string fields** (kept; truncated to 200 chars):
  `activity`, `task`, `tool`, `runId`, `sessionId`, `type`, `status`,
  `timestamp`, `agentId`, `agentName`, `host`, `hostname`, `platform`,
  `openclawVersion`, `progressLabel`.
- **Whitelisted numeric fields** (kept if finite): `progressCurrent`,
  `progressTotal`, `progressPercent`.
- **Keys matching sensitive patterns are nuked** (replaced with
  `"[redacted]"`): `prompt`, `response`, `authorization`, `auth_token`,
  `cookie`, `token`, `password`, `secret`, `key`, `api_key`, `output`,
  `stdout`, `stderr`, `env`, `body`, `headers`, `request_headers`,
  `response_headers`.
- **String content matching token-shaped patterns** is redacted even when
  the key is innocent: `sk-…`, `gh[pousr]_…`, `xox[abprs]-…`, JWTs,
  PEM private keys, `Bearer …`, `Authorization: …`, `password: …`,
  `cookie: …`.
- **Cyclic objects** are handled without crashing.
- **Bigint, symbol, function** values become `"[redacted]"`.

The plugin never sends a prompt or response to the API — even if the
OpenClaw hook context happens to carry one. We deliberately do NOT
subscribe to `llm_input` / `llm_output` so those payloads never leave
the host.

## Retention

- Default: events older than **30 days** are deleted; runs are kept
  indefinitely.
- Runs **inside** the API process as a `setInterval` (default 1h).
- Guarded by a file lock at `/tmp/menuboard-agents-api.retention.lock` so
  multiple API processes on the same box don't all hammer the DB.
- Tunable: `MC_RETENTION_DAYS`, `MC_RETENTION_INTERVAL_MS`,
  `MC_RETENTION_LOCKFILE`.
- Alternative path: run a dedicated `systemd` timer once a night —
  templates live in `ops/systemd/menuboard-mission-control-retention.{service,timer}`.

## Heartbeats

- Plugin sends a heartbeat every `MC_HEARTBEAT_INTERVAL_MS` (default 30s)
  — but ONLY if no other event has been emitted recently. This keeps the
  DB quiet while still keeping `lastHeartbeat` fresh.
- API marks an agent **OFFLINE** if no heartbeat has arrived in
  `MC_OFFLINE_AFTER_MS` (default 90s, ≈3 missed beats).
- A 10s in-process scheduler does the reaping. Tunable via
  `MC_REAPER_INTERVAL_MS`.

## Limitations discovered in OpenClaw 2026.9.2

These were surprises; full notes live in
[`packages/plugin/docs/decisions.md`](packages/plugin/docs/decisions.md).

1. **No native `run_started`/`run_completed` hooks.** We map
   `before_agent_run` and `agent_end` to the spec events. The mapping is
   unambiguous for the embedded runner but is **not** emitted by the
   Codex app-server harness and the Copilot harness — those rely on
   their own native compaction and lifecycle. If you bind a Codex-only
   agent, only `tool_started`/`tool_completed`/`after_compaction` will
   appear.
2. **No `thinking` event type.** Closest is `model_call_started`, which
   carries the model id and timing but no content. We map that to
   `thinking`. The agent's actual reasoning is **never** sent.
3. **No `waiting` hook.** Synthesised from idle gaps. v2 may add a real
   hook once the SDK exposes one.
4. **No native heartbeat hook.** The plugin owns the timer. Easy to
   swap if OpenClaw adds one.
5. **EventSource can't send auth headers in browsers.** Our dashboard
   uses `?token=` for the SSE endpoint instead of `Authorization: Bearer`.
   The token is the same admin key. Browsers cache the connection; we
   re-establish with exponential backoff (1s → 30s).
6. **Capability registration vs hooks.** Native plugins are expected to
   register capabilities; we register hooks only. `openclaw doctor`
   shows the `hook-only` info notice — that is fine.
7. **`api.registerAgentEventSubscription` is deprecated** in favour of
   `api.agent.events.registerAgentEventSubscription`. We don't subscribe
   via the agent-event bus at all — we use `api.on(...)` which is the
   documented stable path.
8. **`api.on(...)` with no `eligibleTriggers`** means the handler runs
   for **all** triggers. We don't gate by trigger on purpose.
9. **Hook types are open-ended.** The TypeScript types in the host SDK
   are exhaustive (`PluginHookHandlerMap`) but `api.on` accepts string
   keys for forward-compat. We use the string names from the catalog.

## Roadmap (v2)

These would each be a small follow-up PR — none are required for v1.

- **Commands back to bots.** `POST /v1/agents/:id/commands` (pause,
  resume, send task). The plugin would subscribe to `cron_reconciled` to
  surface the agent's existing cron table and to a new
  `command_received` hook for inbound.
- **Workflow visualisations.** Render the `tool_started`/`tool_completed`
  pairs as a horizontal gantt on the detail page.
- **Multi-process SSE.** Swap the in-process broker for Redis pub/sub
  once there's a real reason to run >1 API instance.
- **Per-agent retention overrides.** Some bots produce noise; some
  produce compliance-grade history. The schema is ready; just needs the
  config knob.
- **Webhook dispatcher.** `cron_reconciled` already gives us the cron
  table — we could optionally turn that into the dashboard's "scheduled
  jobs" view.
- **Plugin-side rate limiting.** Right now we cap the queue at 500; a
  smarter plugin could coalesce adjacent `tool_started`/`tool_completed`
  pairs into a single `tool` event with duration metadata.

## License

MIT. See [LICENSE](./LICENSE).

## Contributing

- `npm install` once at the root.
- Tests: `npm test` (Vitest in each workspace).
- Lint: `npm run lint`.
- Build: `npm run build` (compiles API, dashboard, plugin).
- Type-check only: `npx tsc --noEmit -p <workspace>/tsconfig.json`.
- Conventional commits. PRs land via squash.

## Repo layout

```
openclaw-mission-control/
├── apps/
│   ├── api/                # Fastify + Prisma + SSE
│   └── dashboard/          # Next.js 14 App Router + Tailwind
├── packages/
│   ├── plugin/             # OpenClaw native plugin
│   ├── shared/             # Types + sanitiser (the privacy spine)
│   └── eslint-config/      # Shared ESLint config
├── ops/
│   ├── nginx/              # Suggested vhost snippets
│   └── systemd/            # Optional service unit templates
├── .github/workflows/ci.yml
├── package.json            # npm workspaces root
├── tsconfig.base.json
├── SPEC.md                 # The original spec (kept for reference)
├── README.md               # ← you are here
└── LICENSE                 # MIT
```