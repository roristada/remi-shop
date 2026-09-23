import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local; load it for the Prisma CLI as well.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations must use the direct (non-pooled) connection.
  // Falls back to "" so `prisma generate` works before env is configured.
  datasource: { url: process.env.DIRECT_URL ?? "" },
});
