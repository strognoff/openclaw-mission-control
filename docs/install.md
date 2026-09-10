# Mission Control — Plugin Install Guide

This is the step-by-step guide for installing the OpenClaw Mission Control
plugin and enrolling your bot in the shared dashboard at
**https://menuboard.online/agents/**.

If you can run shell commands and edit JSON, you can finish this in ~5 minutes.

---

## What you'll see after this

- Your bot appears in the **Agents** grid on the dashboard
- A new tab with your bot's name shows up in **Live activity**
- Your bot's status (IDLE / WORKING / TOOL / OFFLINE / …) updates every 30 s
- Run lifecycle events (started / completed / failed) and tool calls stream live
- You can click the tab for just your bot to filter out everyone else's noise

## What you need from Jeff before you start

1. **An API key.** Jeff will mint one at https://menuboard.online/keys and send
   you the plaintext. It looks like `mc_xxxxxxxxxx_yyyyyy`.
2. **OpenClaw 2026.9.2 or later**, running as a user-level systemd service or
   any process that can write to `~/.openclaw/openclaw.json`.

Everything else you'll do yourself.

---

## Step 1 — Install the plugin

From any directory:

```bash
openclaw plugins install clawhub:strognoff/openclaw-mission-control
```

If you're testing from a local checkout (e.g. you're helping develop Mission
Control), use:

```bash
openclaw plugins install --link /path/to/openclaw-mission-control/packages/plugin --force
```

Verify with:

```bash
openclaw plugins list | grep mission-control
```

You should see `openclaw-mission-control` listed as `enabled`.

> If your gateway runs as a systemd user service, install the plugin as the
> same user that owns `~/.openclaw/`. `sudo` from a different account will
> silently drop the plugin in the wrong place.

---

## Step 2 — Add your config

Edit `~/.openclaw/openclaw.json` and **merge** this block in (don't overwrite
the rest of the file):

```json
{
  "plugins": {
    "entries": {
      "openclaw-mission-control": {
        "enabled": true,
        "config": {
          "url": "https://api.menuboard.online/v1/agents",
          "apiKey": "***",
          "agentId": "your-agent-id",
          "agentName": "Your Bot Display Name",
          "heartbeatMs": 30000
        }
      }
    }
  }
}
```

Replace the four placeholders:

| Field         | Replace with                                                                                  |
|---------------|------------------------------------------------------------------------------------------------|
| `apiKey`      | The `mc_xxxxxxxxxx_yyyyyy` token Jeff sent you                                                 |
| `agentId`     | A stable slug — lowercase, no spaces. e.g. `youtube-bot`, `support-1`, `menuboard-leads`        |
| `agentName`   | The display name you want on the dashboard. e.g. `YouTube Bot`, `Support 1`                    |
| `heartbeatMs` | Keep at `30000` (30 s) unless Jeff asks otherwise                                              |

> The plugin stores `apiKey` as plaintext in `openclaw.json`. That's by design
> — it's the only auth header the API accepts. Make sure `openclaw.json` is
> `chmod 600` and not in a shared repo. **Never paste the key into chat.**

If your OpenClaw instance already runs other plugins, you'll be merging into
an existing `plugins.entries` object — just add `openclaw-mission-control` as
one more key alongside the rest.

---

## Step 3 — Restart OpenClaw

```bash
openclaw gateway restart
```

That's it. The plugin will:

1. Auto-register your agent on the first heartbeat (within 30 s)
2. Send a heartbeat every 30 s
3. Stream run / tool / status events as they happen

You don't need to call `/v1/agents/register` manually — the plugin does it.

---

## Step 4 — Verify

Open **https://menuboard.online/agents/** — your bot should appear in the
**Agents** grid within 30 seconds. Click the tab with your bot's name in
**Live activity** to see just your events.

If the bot stays `OFFLINE` for more than a minute:

```bash
journalctl --user -u openclaw-gateway.service -n 80 | grep -i '\[mc\]'
```

Look for one of:

| Log line                                  | Meaning                                                          |
|-------------------------------------------|------------------------------------------------------------------|
| `[mc] registered: <name> @ <url>`         | ✅ Agent enrolled. You're done.                                  |
| `[mc] send failed: 401 Unauthorized`      | ❌ API key wrong/revoked. Ask Jeff for a new one from `/keys`.   |
| `[mc] send failed: timeout`               | ❌ The host can't reach `api.menuboard.online` — check egress.   |
| `[mc] disabled: missing config.url`       | ❌ Config block missing `url`. Re-check Step 2.                  |

If you see **nothing** at all, the plugin isn't loaded — re-run
`openclaw plugins list` and check the gateway logs for a startup error.

---

## What gets reported (and what doesn't)

The plugin sanitises every event before it leaves the host. Only the
following fields ever leave your box:

- `agentId`, `agentName`, `hostname`, `platform`, `openclawVersion` (registration)
- Event type: `heartbeat`, `run_started`, `run_completed`, `run_failed`,
  `thinking`, `tool_started`, `tool_completed`, `tool_failed`, `waiting`,
  `agent_online`, `agent_offline`, `status_changed`
- Status: `IDLE`, `WORKING`, `THINKING`, `TOOL`, `WAITING`, `COMPLETE`, `ERROR`
- Tool name (e.g. `bash`, `web_fetch`, `image_generate`)
- Short sanitised activity label (max 200 chars)

**Never reported** (stripped before send): prompts, responses, cookies,
headers, environment variables, file paths, command arguments, secrets of
any kind. See `packages/plugin/src/sanitise.ts` for the exact rules.

---

## Day-to-day

- **You don't need to do anything** — the plugin runs in-process with the
  gateway, survives restarts, queues events when the API is down, and
  retries with exponential backoff up to 10 minutes.
- **Rotate your key** any time by asking Jeff to revoke it from
  https://menuboard.online/keys, then drop the new key into Step 2 and
  restart.
- **Go offline briefly** (maintenance, reboot) — the dashboard will mark
  you `OFFLINE` after 90 s without a heartbeat. When you come back, your
  status flips to `IDLE` automatically.

---

## Troubleshooting recipes

**Bot shows in `/keys` but not in `/agents`**
Registration hasn't completed yet. The plugin self-registers on first
heartbeat (within 30 s). If it's been 2 minutes, check the gateway logs
for `[mc]` errors.

**Multiple gateways / multiple processes on the same host**
Only the first to register keeps the agent record. If you have dev + prod
on the same box, give them different `agentId` values.

**Revoke / uninstall**
```bash
openclaw plugins disable openclaw-mission-control   # stop sending events
# or remove the "openclaw-mission-control" key from openclaw.json entirely
```

**Behind a corporate proxy**
Set `HTTPS_PROXY=https://proxy.example.com:8080` in the OpenClaw process
environment before `openclaw gateway restart`. The plugin honours the
standard Node fetch proxy env vars.

**Need a per-agent tab view that aggregates heartbeats?**
The dashboard already does this. See the **Live activity** panel — by
default heartbeats collapse into a single row with a `×N` count badge on
the left.

---

## What to send back to Jeff once you're enrolled

A short message in the group chat:

> *Enrolled: `<agentId>` on `<hostname>` — key prefix `mc_xxxxxx…`,
>  first heartbeat received at HH:MM.*

That's enough. Jeff will see your bot on the dashboard.
