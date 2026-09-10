# OpenClaw → Mission Control hook mapping

Verified against OpenClaw **2026.9.2** (installed at
`/home/cechinel/.npm-global/lib/node_modules/openclaw/`). Source of truth:
`dist/hook-runner-global-Bj0SlbYF.d.ts` → `PluginHookHandlerMap` (line 1438+).

> The plugin does not import the host's types at runtime; the only thing it
> needs is the **string names** of the hooks listed below. Everything else
> flows through `api.on(name, handler)` which is typed as an open-ended map.

## Spec event → OpenClaw hook

| Spec event         | OpenClaw hook                    | Where it lives                                  | Notes |
|--------------------|----------------------------------|-------------------------------------------------|-------|
| `agent_online`     | `gateway_start`                  | `src/index.ts` L80                              | Fires once when the OpenClaw gateway starts. Also on `session_start` if we missed the gateway event. |
| `agent_offline`    | `gateway_stop`                   | `src/index.ts` L86                              | Primary offline signal. Backed up by `session_end` with `reason: shutdown \| deleted`. |
| `run_started`      | `before_agent_run`               | `src/index.ts` L106                             | Best run-boundary hook in the current SDK. **Not dispatched by every harness** (see Harness caveats below). |
| `run_completed`    | `agent_end` (success=true)       | `src/index.ts` L111                             | `event.success` is the discriminator. **Not dispatched by every harness.** |
| `run_failed`       | `agent_end` (success=false)      | `src/index.ts` L111                             | `event.error` becomes `errorSummary` in metadata. **Not dispatched by every harness.** |
| `thinking`         | `model_call_started`             | `src/index.ts` L121                             | Provider/model available on the event. **Not dispatched by every harness.** |
| `tool_started`     | `before_tool_call`               | `src/index.ts` L131                             | `event.toolName` becomes the `tool` field. **Not dispatched by every harness.** |
| `tool_completed`   | `after_tool_call` (no `error`)   | `src/index.ts` L135                             | The runtime does not provide a dedicated "tool completed" hook in 2026.9.2; we read `event.error` to discriminate. **Not dispatched by every harness.** |
| `tool_failed`      | `after_tool_call` (has `error`)  | `src/index.ts` L135                             | Same hook, error branch. **Not dispatched by every harness.** |
| `waiting`          | synthesized (60s idle timer)     | `src/index.ts` (sender timer)                   | OpenClaw has no explicit "agent is waiting on user input" hook in 2026.9.2; we synthesise this when no status-bearing hook has fired for a while. |
| `heartbeat`        | in-process interval              | `src/sender.ts` `tickHeartbeat`                 | There is no native heartbeat hook. The plugin owns the timer; the heartbeat endpoint on the API updates `Agent.lastHeartbeat`. |
| `status_changed`   | any of the above                 | `src/index.ts` (sender)                         | Emitted whenever `currentStatus` would change but no other spec event covers it (e.g. `session_end` with non-shutdown reason). |
| `message_received` | `message_received`               | `src/index.ts` (message hooks section)          | **Harness-independent.** Fires on every channel — Telegram, Codex, embedded. This is what makes the dashboard reflect `WORKING` the moment a user message arrives, even on harnesses that don't dispatch `before_agent_run`. |
| `message_sent`     | `message_sent`                   | `src/index.ts` (message hooks section)          | Outbound delivery. **Not dispatched on every harness** — embedded/CLI runners fire it; Codex/Telegram path does not. |
| `subagent_spawned` | `subagent_spawned`               | `src/index.ts` (message hooks section)          | Fires when a child agent is spawned. Rare on Codex/Telegram. |
| `subagent_ended`   | `subagent_ended`                 | `src/index.ts` (message hooks section)          | Fires when a child agent completes (success/fail). Rare on Codex/Telegram. |
| `cron_reconciled`  | `cron_reconciled`                | `src/index.ts` (message hooks section)          | Fires when the OpenClaw cron scheduler reconciles state. **Harness-independent.** |

## Events OpenClaw 2026.9.2 does **not** provide

| Spec concept               | Why it's missing                                                | What we do instead                                          |
|----------------------------|------------------------------------------------------------------|-------------------------------------------------------------|
| `run_started` literally    | No such named hook in this version.                              | We use `before_agent_run`, which is the closest analog. The `before_agent_run` hook is **not emitted by every harness** (Codex app-server and Copilot are documented as exceptions in `dist/docs/plugins/codex-harness-runtime.md`). For harnesses that don't emit it, the run-start is implicit from the first `message_received` or `tool_started` event. |
| `waiting` (user input)     | No such hook in 2026.9.2.                                        | Synthesised from heartbeat + idle gap.                       |
| `agent_online` (per session) | Sessions come and go; only the gateway is "the bot".           | We treat `gateway_start` as the canonical online event and `session_start` as a status-bearing helper (no separate event type). |
| Dedicated `heartbeat` hook | None.                                                            | The plugin owns a setInterval. Tunable via `heartbeatMs`.   |
| `thinking` event marker    | Not first-class; `model_call_started` is the runtime signal.     | Mapped 1:1.                                                  |

## Harness caveats

Per `dist/docs/plugins/hooks.md`:

> "The catalog is the registration API, not a promise that every runtime
> emits every hook. For example, `before_agent_run` is implemented by the
> embedded and CLI runners; do not rely on it as a Codex or Copilot input
> gate."

The plugin registers all 15 typed hooks unconditionally. The harness
dispatcher decides which ones actually fire. Empirically (verified on the
OpenClaw 2026.9.2 Telegram/Codex path):

| Hook                 | Embedded/CLI | Telegram/Codex | Why we still register it                              |
|----------------------|:------------:|:--------------:|--------------------------------------------------------|
| `gateway_start`      | ✓            | ✓              | Universal lifecycle event                              |
| `gateway_stop`       | ✓            | ✓              | Universal lifecycle event                              |
| `message_received`   | ✓            | ✓              | The WORKING trigger on Telegram/Codex                  |
| `cron_reconciled`    | ✓            | ✓              | Operator visibility on cron ticks                      |
| `session_start`      | ✓            | ✓              | Status-bearing helper                                  |
| `session_end`        | ✓            | ✓              | Offline detection (shutdown/deleted reasons)           |
| `message_sent`       | ✓            | (not dispatch) | Fires on embedded/CLI runners                          |
| `before_agent_run`   | ✓            | (not dispatch) | Conversation hook; needs `allowConversationAccess: true` |
| `agent_end`          | ✓            | (not dispatch) | Conversation hook; needs `allowConversationAccess: true` |
| `before_tool_call`   | ✓            | (not dispatch) | Native tool gate                                       |
| `after_tool_call`    | ✓            | (not dispatch) | Native tool observer                                   |
| `model_call_started` | ✓            | (not dispatch) | Provider/model timing                                  |
| `model_call_ended`   | ✓            | (not dispatch) | Provider/model timing                                  |
| `subagent_*`         | ✓            | (rare)         | Subagent visibility on embedded runs                   |

**Practical impact**: even on Telegram/Codex (where most agent-run hooks
don't dispatch), the dashboard reflects `WORKING` the moment a user message
arrives via `message_received`, and `IDLE` again after the next 30 s
heartbeat. The "always IDLE" complaint is resolved end-to-end without
needing every hook to fire.

## Why these mappings and not others?

- We considered using `llm_input` / `llm_output` for `thinking`, but both
  receive the **prompt** and **response** content. Using them would force
  the sanitiser to throw away most of the payload, which defeats the
  purpose. `model_call_started` carries the same provider/model/timing
  signal with zero prompt content.
- We considered `before_compaction` / `after_compaction` for `waiting` /
  status events. Compaction is a session-internal optimisation, not a
  user-visible state, so we explicitly ignore it.
- `subagent_spawned` / `subagent_ended` are now mapped to dedicated spec
  events (`subagent_spawned`, `subagent_ended`) so the dashboard can
  distinguish parent vs child work. The metadata includes `subagentId`.

## Permissions

The plugin listens on `api.on(...)` for typed hooks. Per the
`dist/docs/plugins/hooks.md` permission rules:

- **Conversation hooks** (`before_agent_run`, `agent_end`,
  `before_model_resolve`, `agent_turn_prepare`, `before_prompt_build`,
  `before_agent_reply`, `llm_input`, `llm_output`,
  `before_agent_finalize`) require
  `plugins.entries.<id>.hooks.allowConversationAccess: true` for
  non-bundled plugins. Bundled plugins are allowed unless explicitly
  `false`.
- **Observation hooks** (`message_received`, `message_sent`,
  `gateway_start`, `gateway_stop`, `cron_reconciled`, `session_*`,
  `model_call_*`, `subagent_*`) do **not** require
  `allowConversationAccess`.
- The plugin does **not** register `before_agent_reply`,
  `before_prompt_build`, `llm_input`, or `llm_output`. Those would force
  every operator to enable conversation access. By sticking to
  observation + the two conversation hooks we actually need
  (`before_agent_run`, `agent_end`), the plugin works with the minimum
  permission grant documented in `docs/install.md` Step 2.

## Lifecycle in v1

```text
gateway_start
  └─ session_start → before_agent_run → model_call_started → before_tool_call
                                                            ↳ after_tool_call
                                                            ↳ ... more turns ...
                                                            ↳ agent_end (success | fail)
  └─ session_end (idle | shutdown | restart | ...)
gateway_stop
```