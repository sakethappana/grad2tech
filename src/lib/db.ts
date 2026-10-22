import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Single Prisma client per process. Shared by the web app, the worker and tests.
 * (Not marked server-only so the worker and scripts can import it.)
 */
const globalForPrisma = globalThis as unknown as { __g2tPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__g2tPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__g2tPrisma = prisma;

export type Db = PrismaClient;
/** Transaction client type for functions that run inside prisma.$transaction. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
