/**
 * Grant or revoke the ADMIN role. Run from a trusted machine only:
 *   npm run role:set -- <email> ADMIN
 *   npm run role:set -- <email> CUSTOMER
 * The user must have signed up first (profile rows are created by the auth trigger).
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../lib/generated/prisma/client";

config({ path: ".env.local", quiet: true });

async function main() {
  const [email, roleArg = "ADMIN"] = process.argv.slice(2);
  if (!email || !(roleArg in Role)) {
    console.error("Usage: npm run role:set -- <email> <ADMIN|CUSTOMER>");
    process.exit(1);
  }

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL is not set (.env.local)");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const profile = await prisma.profile.update({
      where: { email: email.trim().toLowerCase() },
      data: { role: roleArg as Role },
      select: { email: true, role: true },
    });
    console.log(`OK: ${profile.email} → ${profile.role}`);
  } catch {
    console.error(`No profile found for ${email}. Has this user signed up?`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
