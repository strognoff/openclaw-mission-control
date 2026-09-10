/**
 * Route registration.
 *
 * Every route uses zod for request validation and returns one of the typed
 * shapes from `@openclaw-mc/shared`. Errors are normalised through the
 * Fastify error handler so the plugin never sees 500s with HTML.
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  EVENT_TYPES,
  AGENT_STATUSES,
  type EventType,
  type AgentStatus,
} from "@openclaw-mc/shared";
import { getPrisma } from "./db.js";
import {
  authenticate,
  extractBearer,
  generateApiKey,
  hashKey,
} from "./auth.js";
import {
  createSseBroker,
  publishAgentAdded,
  publishAgentUpdated,
  publishEventAdded,
  publishAgentRemoved,
  type SseBroker,
} from "./sse-broker.js";
import type { AppEnv } from "./env.js";

const eventTypeSchema = z.enum(EVENT_TYPES as readonly [string, ...string[]]);
const agentStatusSchema = z.enum(AGENT_STATUSES as readonly [string, ...string[]]);

const registerSchema = z.object({
  agentId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  hostname: z.string().min(1).max(256),
  platform: z.string().min(1).max(64),
  openclawVersion: z.string().min(1).max(64),
  apiKey: z.string().min(16).max(256),
});

const eventPayloadSchema = z.object({
  type: eventTypeSchema,
  status: agentStatusSchema.optional(),
  task: z.string().max(200).optional(),
  activity: z.string().max(200).optional(),
  tool: z.string().max(64).optional(),
  runId: z.string().max(128).optional(),
  sessionId: z.string().max(128).optional(),
  timestamp: z.string().datetime().optional(),
  progressCurrent: z.number().finite().optional(),
  progressTotal: z.number().finite().optional(),
  progressPercent: z.number().finite().optional(),
  progressLabel: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ingestSchema = z.object({
  events: z.array(eventPayloadSchema).max(500),
});

const heartbeatSchema = z.object({
  status: agentStatusSchema.optional(),
  task: z.string().max(200).optional(),
  activity: z.string().max(200).optional(),
  tool: z.string().max(64).optional(),
  runId: z.string().max(128).optional(),
});

const createKeySchema = z.object({
  agentId: z.string().min(1).max(128),
  label: z.string().max(128).optional(),
});

/* ────────────────────────────────────────────────────────────────────────── */

export interface RouteDeps {
  env: AppEnv;
  broker: SseBroker;
}

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { env, broker } = deps;

  /** Auth helper: require an agent identity (admin counts). */
  async function requireAnyAgent(req: FastifyRequest, reply: FastifyReply) {
    const bearer = extractBearer(req);
    const id = await authenticate(bearer, env.MC_ADMIN_KEY);
    if (!id) {
      reply.code(401).send({ error: "unauthorized", message: "Missing or invalid bearer token." });
      return null;
    }
    req.auth = id;
    return id;
  }

  /** Auth helper: agent identity (NOT admin). */
  async function requireAgent(req: FastifyRequest, reply: FastifyReply) {
    const id = await requireAnyAgent(req, reply);
    if (!id) return null;
    if (id.kind !== "agent") {
      reply.code(403).send({ error: "forbidden", message: "Agent token required." });
      return null;
    }
    return id;
  }

  /** Auth helper: admin only. */
  async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
    const id = await requireAnyAgent(req, reply);
    if (!id) return null;
    if (id.kind !== "admin") {
      reply.code(403).send({ error: "forbidden", message: "Admin token required." });
      return null;
    }
    return id;
  }

  /* ────────── Health ────────── */

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  /* ────────── Register ────────── */

  app.post("/v1/agents/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      return;
    }
    const { agentId, name, hostname, platform, openclawVersion, apiKey } = parsed.data;

    const prisma = getPrisma();

    // The matching key must exist BEFORE the agent can register. This is
    // what stops a bot from inventing its own identity.
    const keyHash = await hashKey(apiKey);
    const keyPrefix = apiKey.slice(0, 8);
    const existingKey = await prisma.apiKey.findFirst({
      where: { keyPrefix, revokedAt: null },
    });
    let matchedKeyId: string;
    if (existingKey) {
      const ok = await import("bcrypt").then((b) => b.compare(apiKey, existingKey.keyHash));
      if (!ok) {
        reply.code(401).send({ error: "invalid_api_key" });
        return;
      }
      matchedKeyId = existingKey.id;
      // Bind the key to this agentId if it was created with placeholder agent
      if (existingKey.agentId !== agentId) {
        // Forbid re-binding: this would let an attacker hijack a key.
        reply.code(409).send({ error: "key_already_bound", agentId: existingKey.agentId });
        return;
      }
    } else {
      reply.code(401).send({ error: "invalid_api_key", message: "No matching key on file." });
      return;
    }

    const existing = await prisma.agent.findUnique({ where: { id: agentId } });
    if (existing) {
      // Idempotent re-register: refresh metadata, return existing.
      const updated = await prisma.agent.update({
        where: { id: agentId },
        data: {
          name,
          hostname,
          platform,
          openclawVersion,
          lastSeen: new Date(),
          // First registration after offline status returns it to IDLE.
          currentStatus: existing.currentStatus === "OFFLINE" ? "IDLE" : existing.currentStatus,
        },
      });
      publishAgentUpdated(broker, updated);
      reply.code(200).send({
        id: updated.id,
        name: updated.name,
        hostname: updated.hostname,
        platform: updated.platform,
        openclawVersion: updated.openclawVersion,
        apiKeyId: matchedKeyId,
        apiKeyPrefix: keyPrefix,
        createdAt: updated.createdAt.toISOString(),
      });
      return;
    }

    const agent = await prisma.agent.create({
      data: {
        id: agentId,
        name,
        hostname,
        platform,
        openclawVersion,
        currentStatus: "IDLE",
        lastHeartbeat: new Date(),
        lastSeen: new Date(),
      },
    });
    publishAgentAdded(broker, agent);
    reply.code(201).send({
      id: agent.id,
      name: agent.name,
      hostname: agent.hostname,
      platform: agent.platform,
      openclawVersion: agent.openclawVersion,
      apiKeyId: matchedKeyId,
      apiKeyPrefix: keyPrefix,
      createdAt: agent.createdAt.toISOString(),
    });
  });

  /* ────────── Ingest ────────── */

  app.post("/v1/agents/events", async (req, reply) => {
    const id = await requireAgent(req, reply);
    if (!id) return;

    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      return;
    }

    const agentId = id.agent.id;
    const prisma = getPrisma();

    // Run management: we open a Run row on the first run_started and close
    // it on run_completed/failed.
    const rows = [];
    for (const ev of parsed.data.events) {
      const ts = ev.timestamp ? new Date(ev.timestamp) : new Date();
      let runId: string | null = ev.runId ?? null;

      if (ev.type === "run_started" && runId) {
        await prisma.run.upsert({
          where: { id: runId },
          update: { status: "WORKING", task: ev.task ?? undefined },
          create: {
            id: runId,
            agentId,
            sessionId: ev.sessionId ?? null,
            task: ev.task ?? null,
            status: "WORKING",
            startedAt: ts,
          },
        });
      } else if ((ev.type === "run_completed" || ev.type === "run_failed") && runId) {
        await prisma.run
          .update({
            where: { id: runId },
            data: {
              status: ev.status ?? (ev.type === "run_failed" ? "ERROR" : "COMPLETE"),
              completedAt: ts,
              errorSummary: ev.metadata?.errorSummary as string | undefined ?? null,
            },
          })
          .catch(() => {
            /* run may have been GC'd; ignore */
          });
      } else if (ev.type === "tool_started" && runId) {
        await prisma.run
          .update({
            where: { id: runId },
            data: { toolCallCount: { increment: 1 } },
          })
          .catch(() => {});
      }

      const metadata = ev.metadata ? JSON.stringify(ev.metadata) : null;
      const row = await prisma.event.create({
        data: {
          agentId,
          runId,
          type: ev.type,
          status: ev.status ?? null,
          activity: ev.activity ?? null,
          tool: ev.tool ?? null,
          timestamp: ts,
          metadata,
        },
      });
      rows.push(row);
      publishEventAdded(broker, row);

      // Status-bearing events also touch Agent.currentStatus.
      if (ev.status) {
        await prisma.agent
          .update({
            where: { id: agentId },
            data: {
              currentStatus: ev.status,
              currentTask: ev.task ?? undefined,
              currentActivity: ev.activity ?? undefined,
              currentTool: ev.tool ?? undefined,
              lastSeen: ts,
            },
          })
          .then((a) => publishAgentUpdated(broker, a))
          .catch(() => {});
      }
    }

    reply.code(202).send({ ids: rows.map((r) => r.id) });
  });

  /* ────────── Heartbeat ────────── */

  app.post("/v1/agents/heartbeat", async (req, reply) => {
    const id = await requireAgent(req, reply);
    if (!id) return;

    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      return;
    }

    const prisma = getPrisma();
    const now = new Date();
    const current = await prisma.agent.findUnique({ where: { id: id.agent.id } });

    // No event row inserted unless the meaningful state changes.
    const meaningful =
      !current ||
      (parsed.data.status !== undefined && parsed.data.status !== current.currentStatus) ||
      (parsed.data.task !== undefined && parsed.data.task !== current.currentTask) ||
      (parsed.data.activity !== undefined &&
        parsed.data.activity !== current.currentActivity) ||
      (parsed.data.tool !== undefined && parsed.data.tool !== current.currentTool);

    const updated = await prisma.agent.update({
      where: { id: id.agent.id },
      data: {
        lastHeartbeat: now,
        lastSeen: now,
        ...(parsed.data.status !== undefined ? { currentStatus: parsed.data.status } : {}),
        ...(parsed.data.task !== undefined ? { currentTask: parsed.data.task } : {}),
        ...(parsed.data.activity !== undefined ? { currentActivity: parsed.data.activity } : {}),
        ...(parsed.data.tool !== undefined ? { currentTool: parsed.data.tool } : {}),
      },
    });
    publishAgentUpdated(broker, updated);

    if (meaningful) {
      const ts = now;
      const row = await prisma.event.create({
        data: {
          agentId: id.agent.id,
          runId: parsed.data.runId ?? null,
          type: "heartbeat",
          status: parsed.data.status ?? updated.currentStatus,
          activity: parsed.data.activity ?? "Heartbeat",
          tool: parsed.data.tool ?? null,
          timestamp: ts,
          metadata: null,
        },
      });
      publishEventAdded(broker, row);
    }

    reply.send({
      lastHeartbeat: updated.lastHeartbeat.toISOString(),
      currentStatus: updated.currentStatus as AgentStatus,
    });
  });

  /* ────────── List / detail ────────── */

  app.get("/v1/agents", async (req, reply) => {
    const id = await requireAdmin(req, reply);
    if (!id) return;

    const agents = await getPrisma().agent.findMany({
      orderBy: [{ currentStatus: "asc" }, { name: "asc" }],
    });
    reply.send({ agents });
  });

  app.get("/v1/agents/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const params = req.params as { id: string };

    const agent = await getPrisma().agent.findUnique({ where: { id: params.id } });
    if (!agent) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const [events, runs] = await Promise.all([
      getPrisma().event.findMany({
        where: { agentId: params.id },
        orderBy: { timestamp: "desc" },
        take: 50,
      }),
      getPrisma().run.findMany({
        where: { agentId: params.id },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
    ]);

    reply.send({ agent, events, runs });
  });

  /* ────────── Pagination ────────── */

  app.get("/v1/agents/:id/events", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const params = req.params as { id: string };
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .safeParse(req.query);
    if (!q.success) {
      reply.code(400).send({ error: "bad_request", issues: q.error.issues });
      return;
    }
    const where = {
      agentId: params.id,
      ...(q.data.cursor ? { id: { lt: q.data.cursor } } : {}),
    };
    const events = await getPrisma().event.findMany({
      where,
      orderBy: { id: "desc" },
      take: q.data.limit,
    });
    const nextCursor = events.length === q.data.limit ? events[events.length - 1]!.id : null;
    reply.send({ events, nextCursor });
  });

  app.get("/v1/agents/:id/runs", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const params = req.params as { id: string };
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .safeParse(req.query);
    if (!q.success) {
      reply.code(400).send({ error: "bad_request", issues: q.error.issues });
      return;
    }
    const where = {
      agentId: params.id,
      ...(q.data.cursor ? { startedAt: { lt: new Date(q.data.cursor) } } : {}),
    };
    const runs = await getPrisma().run.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: q.data.limit,
    });
    const nextCursor = runs.length === q.data.limit ? runs[runs.length - 1]!.startedAt.toISOString() : null;
    reply.send({ runs, nextCursor });
  });

  /* ────────── SSE stream ────────── */

  app.get("/v1/agents/events/stream", async (req, reply) => {
    const id = await requireAdmin(req, reply);
    if (!id) return;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    reply.raw.flushHeaders?.();

    let closed = false;
    const cleanup = broker.subscribe({
      id: 0,
      write: async (chunk: string) => {
        if (closed) return;
        reply.raw.write(chunk);
      },
      close: async () => {
        if (closed) return;
        closed = true;
        try {
          reply.raw.end();
        } catch {
          /* ignore */
        }
      },
    });

    // Send an initial hello so the EventSource opens immediately.
    reply.raw.write(
      `event: hello\ndata: ${JSON.stringify({ ok: true, t: Date.now() })}\n\n`,
    );

    req.raw.on("close", () => {
      closed = true;
      cleanup();
    });
  });

  /* ────────── Admin: keys ────────── */

  app.post("/v1/agents/admin/keys", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;

    const parsed = createKeySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      return;
    }

    // The agent row is NOT auto-created here. The bot's first call to
    // /v1/agents/register creates it. This keeps the lifecycle simple:
    // mint key → hand to bot → bot registers itself.
    let agent = await getPrisma().agent.findUnique({ where: { id: parsed.data.agentId } });
    if (!agent) {
      // Create a placeholder so we can attach the key. The bot's register
      // call will replace the placeholder values with real ones.
      agent = await getPrisma().agent.create({
        data: {
          id: parsed.data.agentId,
          name: parsed.data.agentId,
          hostname: "pending",
          platform: "pending",
          openclawVersion: "pending",
          currentStatus: "IDLE",
          lastHeartbeat: new Date(),
          lastSeen: new Date(),
        },
      });
      publishAgentAdded(broker, agent);
    }

    const apiKey = generateApiKey();
    const keyHash = await hashKey(apiKey);
    const keyPrefix = apiKey.slice(0, 8);
    const row = await getPrisma().apiKey.create({
      data: {
        agentId: agent.id,
        keyHash,
        keyPrefix,
        label: parsed.data.label ?? null,
      },
    });

    // Return plaintext ONCE. The hash never leaves this process.
    reply.code(201).send({
      id: row.id,
      agentId: agent.id,
      apiKey,
      keyPrefix,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
    });
  });

  app.delete("/v1/agents/admin/keys/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const params = req.params as { id: string };

    const existing = await getPrisma().apiKey.findUnique({ where: { id: params.id } });
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    await getPrisma().apiKey.update({
      where: { id: params.id },
      data: { revokedAt: new Date() },
    });
    reply.code(204).send();
  });

  app.get("/v1/agents/admin/keys", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const keys = await getPrisma().apiKey.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    // Never return the hash.
    reply.send({
      keys: keys.map((k) => ({
        id: k.id,
        agentId: k.agentId,
        keyPrefix: k.keyPrefix,
        label: k.label,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
      })),
    });
  });

  /* ────────── Admin: global feed ────────── */

  app.get("/v1/agents/events/recent", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const limit = Math.min(200, Math.max(1, Number((req.query as any)?.limit) || 30));
    const events = await getPrisma().event.findMany({
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    reply.send({ events });
  });
}

/** Public surface used by server.ts to create the broker. */
export { createSseBroker };
export type { EventType, AgentStatus };