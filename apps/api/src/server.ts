/**
 * Fastify server entry.
 *
 * Boots: env → db → broker → routes → schedulers.
 * Graceful shutdown on SIGTERM/SIGINT cancels schedulers, drains SSE, and
 * closes the DB connection.
 */

import Fastify from "fastify";
import { loadEnv, type AppEnv } from "./env.js";
import { getPrisma, disconnectPrisma } from "./db.js";
import { registerRoutes, createSseBroker } from "./routes.js";
import { startOfflineReaper, startRetention, type SchedulerHandle } from "./schedulers.js";

export interface ServerHandle {
  app: Awaited<ReturnType<typeof Fastify>>;
  broker: ReturnType<typeof createSseBroker>;
  env: AppEnv;
  stop: () => Promise<void>;
}

export async function buildServer(env?: AppEnv): Promise<ServerHandle> {
  const envResolved = env ?? loadEnv();

  const app = Fastify({
    logger: {
      level: envResolved.MC_LOG_LEVEL,
      transport:
        envResolved.MC_LOG_LEVEL === "debug"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    disableRequestLogging: envResolved.MC_LOG_LEVEL !== "debug",
    trustProxy: true,
  });

  // CORS is handled at the nginx edge (see /etc/nginx/sites-available/menuboard-scraper
  // `add_header Access-Control-Allow-Origin ... always`). Do NOT register @fastify/cors
  // here — two CORS headers on the same response triggers a browser-side "multiple
  // values" CORS error, even though the values match. If we ever serve the API
  // directly (without nginx in front), re-enable this block and set MC_CORS_ORIGINS.

  // Connect DB once at boot. If the schema doesn't exist, push it.
  try {
    await getPrisma().$connect();
    app.log.info("prisma connected");
  } catch (err) {
    app.log.error({ err }, "prisma connection failed");
    throw err;
  }

  const broker = createSseBroker();
  await registerRoutes(app, { env: envResolved, broker });

  const schedulers: SchedulerHandle[] = [
    startOfflineReaper(broker, {
      intervalMs: envResolved.MC_REAPER_INTERVAL_MS,
      offlineAfterMs: envResolved.MC_OFFLINE_AFTER_MS,
      logger: { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) },
    }),
    startRetention({
      intervalMs: envResolved.MC_RETENTION_INTERVAL_MS,
      retentionDays: envResolved.MC_RETENTION_DAYS,
      lockfile: envResolved.MC_RETENTION_LOCKFILE,
      logger: { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) },
    }),
  ];

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    for (const s of schedulers) s.stop();
    broker.stop();
    try {
      await app.close();
    } catch {
      /* ignore */
    }
    await disconnectPrisma();
  };

  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());

  return { app, broker, env: envResolved, stop };
}

/** Run the server (used by `npm run dev` / `npm start`). */
async function main() {
  const handle = await buildServer();
  try {
    await handle.app.listen({
      host: handle.env.MC_HOST,
      port: handle.env.MC_PORT,
    });
    handle.app.log.info(
      `listening on http://${handle.env.MC_HOST}:${handle.env.MC_PORT}`,
    );
  } catch (err) {
    handle.app.log.error({ err }, "failed to listen");
    process.exit(1);
  }
}

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  void main();
}