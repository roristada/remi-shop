import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { serverEnv } from "@/lib/env.server";

/** Connections per server instance. */
const DB_POOL_MAX = 3;
/** Idle connections are returned to the pooler quickly; serverless instances sit idle between requests. */
const DB_IDLE_TIMEOUT_MS = 5_000;

const globalForPrisma =globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Each serverless instance keeps its own pool, and the Supabase pooler allows a fixed number of
    // client connections (200 on small plans). pg's default of 10 per instance exhausted it under
    // traffic (EMAXCONN). A page runs at most a few queries at once, so a small pool is enough.
    const adapter = new PrismaPg({
      connectionString: serverEnv().DATABASE_URL,
      max: DB_POOL_MAX,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily-connected Prisma client (created on first use, so importing it during
 * `next build` doesn't require DB env vars). Reused across hot reloads.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
