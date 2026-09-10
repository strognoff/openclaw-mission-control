# Mission Control API

REST + SSE API for the OpenClaw Mission Control dashboard. Fastify + Prisma + SQLite.

## Quickstart (local dev)

```bash
cd apps/api
cp .env.example .env
# Generate a real admin key:
node -e "console.log('MC_ADMIN_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> .env

npm install
npm run build           # generates Prisma client + compiles TS
npx tsx prisma/seed.ts  # creates dev.db
npm run dev             # tsx watch on src/server.ts
```

## Production

```bash
NODE_ENV=production npm run build
node dist/server.js
```

Behind nginx, add a vhost snippet that proxies `/v1/agents/events/stream`
with `proxy_buffering off` (otherwise SSE dies). See `ops/nginx/`.

## Endpoints

See [the top-level README](../../README.md#api) for the full contract.
Briefly:

| Method | Path                              | Auth        | Purpose |
|--------|-----------------------------------|-------------|---------|
| POST   | `/v1/agents/register`             | (carries key) | Bootstrap an agent. 201 + token metadata. |
| POST   | `/v1/agents/events`               | agent       | Bulk ingest events. 202 + ids. |
| POST   | `/v1/agents/heartbeat`            | agent       | Heartbeat; bumps lastHeartbeat. |
| GET    | `/v1/agents`                      | admin       | List all agents. |
| GET    | `/v1/agents/:id`                  | admin       | Agent + last 50 events + last 5 runs. |
| GET    | `/v1/agents/:id/events?cursor=…`  | admin       | Cursor-paginated events. |
| GET    | `/v1/agents/:id/runs?cursor=…`    | admin       | Cursor-paginated runs. |
| GET    | `/v1/agents/events/stream`        | admin       | SSE feed (use `?token=` for EventSource). |
| GET    | `/v1/agents/events/recent?limit=` | admin       | Most recent N events across all agents. |
| POST   | `/v1/agents/admin/keys`           | admin       | Mint an agent API key. Plaintext returned ONCE. |
| DELETE | `/v1/agents/admin/keys/:id`       | admin       | Revoke a key. |
| GET    | `/v1/agents/admin/keys`           | admin       | List keys (no hashes). |

## Env

See `.env.example`. Required: `MC_ADMIN_KEY`. Everything else has a sane
default.

## Retention

In-process scheduler with a file lock so multiple API processes don't all
run it. Override via `MC_RETENTION_DAYS` (default 30) and
`MC_RETENTION_INTERVAL_MS` (default 1 hour). Runs are never deleted.