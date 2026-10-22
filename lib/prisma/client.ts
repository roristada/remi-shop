import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { serverEnv } from "@/lib/env.server";

/** Connections per server instance. One long-running server shares this pool across every request. */
const DB_POOL_MAX = 10;
/** Idle connections go back to the pooler after this long. */
const DB_IDLE_TIMEOUT_MS = 30_000;

const globalForPrisma =globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // The Supabase pooler allows a fixed number of client connections (200 on small plans). One
    // instance runs in production (two for a moment during a deploy), so 10 each leaves room for
    // scripts and the Prisma CLI.
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
