/**
 * Prisma client wrapper. One singleton per process.
 *
 * We deliberately do NOT log queries — they're sensitive (full metadata
 * payloads) and would defeat the privacy story.
 */

import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (_client) return _client;
  _client = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = undefined;
  }
}