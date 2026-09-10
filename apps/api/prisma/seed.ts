/**
 * One-shot DB init script. Creates the SQLite database and applies the
 * schema if it doesn't exist. Safe to run repeatedly.
 *
 *   npx tsx prisma/seed.ts
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const prismaDir = path.resolve(process.cwd(), "prisma");
if (!existsSync(prismaDir)) {
  mkdirSync(prismaDir, { recursive: true });
}

console.log("→ prisma db push (creating SQLite schema)");
execSync("npx prisma db push --skip-generate", {
  stdio: "inherit",
  env: { ...process.env, MC_DATABASE_URL: process.env.MC_DATABASE_URL ?? "file:./prisma/dev.db" },
});

console.log("→ prisma generate");
execSync("npx prisma generate", { stdio: "inherit" });

console.log("✓ done");