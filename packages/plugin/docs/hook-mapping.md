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
| `run_started`      | `before_agent_run`               | `src/index.ts` L106                             | Best run-boundary hook in the current SDK. |
| `run_completed`    | `agent_end` (success=true)       | `src/index.ts` L111                             | `event.success` is the discriminator. |
| `run_failed`       | `agent_end` (success=false)      | `src/index.ts` L111                             | `event.error` becomes `errorSummary` in metadata. |
| `thinking`         | `model_call_started`             | `src/index.ts` L121                             | Provider/model available on the event. |
| `tool_started`     | `before_tool_call`               | `src/index.ts` L131                             | `event.toolName` becomes the `tool` field. |
| `tool_completed`   | `after_tool_call` (no `error`)   | `src/index.ts` L135                             | The runtime does not provide a dedicated "tool completed" hook in 2026.9.2; we read `event.error` to discriminate. |
| `tool_failed`      | `after_tool_call` (has `error`)  | `src/index.ts` L135                             | Same hook, error branch. |
| `waiting`          | synthesized (60s idle timer)     | `src/index.ts` (sender timer)                   | OpenClaw has no explicit "agent is waiting on user input" hook in 2026.9.2; we synthesise this when no status-bearing hook has fired for a while. |
| `heartbeat`        | in-process interval              | `src/sender.ts` `tickHeartbeat`                 | There is no native heartbeat hook. The plugin owns the timer; the heartbeat endpoint on the API updates `Agent.lastHeartbeat`. |
| `status_changed`   | any of the above                 | `src/index.ts` (sender)                         | Emitted whenever `currentStatus` would change but no other spec event covers it (e.g. `session_end` with non-shutdown reason). |

## Events OpenClaw 2026.9.2 does **not** provide

| Spec concept               | Why it's missing                                                | What we do instead                                          |
|----------------------------|------------------------------------------------------------------|-------------------------------------------------------------|
| `run_started` literally    | No such named hook in this version.                              | We use `before_agent_run`, which is the closest analog. The `before_agent_run` hook is not emitted by every harness (Codex app-server and Copilot are documented as exceptions in `dist/docs/plugins/codex-harness-runtime.md`). For harnesses that don't emit it, the run-start is implicit from the first `tool_started` event. |
| `waiting` (user input)     | No such hook in 2026.9.2.                                        | Synthesised from heartbeat + idle gap.                       |
| `agent_online` (per session) | Sessions come and go; only the gateway is "the bot".           | We treat `gateway_start` as the canonical online event and `session_start` as a status-bearing helper (no separate event type). |
| Dedicated `heartbeat` hook | None.                                                            | The plugin owns a setInterval. Tunable via `heartbeatMs`.   |
| `thinking` event marker    | Not first-class; `model_call_started` is the runtime signal.     | Mapped 1:1.                                                  |

## Why these mappings and not others?

- We considered using `llm_input` / `llm_output` for `thinking`, but both
  receive the **prompt** and **response** content. Using them would force
  the sanitiser to throw away most of the payload, which defeats the
  purpose. `model_call_started` carries the same provider/model/timing
  signal with zero prompt content.
- We considered `before_compaction` / `after_compaction` for `waiting` /
  status events. Compaction is a session-internal optimisation, not a
  user-visible state, so we explicitly ignore it.
- `subagent_spawned` / `subagent_ended` exist but the SPEC talks about
  "agents" not "subagents". We treat them as ordinary runs: a subagent
  emit just shows up as a second run with its own `runId`. The dashboard
  doesn't need to know it's a subagent in v1.

## Permissions

The plugin only listens on `api.on(...)` for observation hooks. Per
`dist/docs/plugins/hooks.md`, **observation hooks do not need
`allowConversationAccess`**. We avoid `before_agent_reply` /
`before_prompt_build` / `llm_input` / `llm_output` on purpose so we
don't need to ask the operator to enable conversation access in
`openclaw.json`.

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