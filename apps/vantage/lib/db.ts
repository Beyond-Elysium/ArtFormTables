/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads server modules in dev, which would otherwise create a
 * fresh PrismaClient (and a fresh pool of DB connections) on every edit.
 * Caching the instance on `globalThis` survives that reload. In production
 * (and in tests) a single instance per process is created normally.
 *
 * Usage: `import { db } from "@/lib/db"`.
 */

import { PrismaClient } from "@/generated/prisma-client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export default db;
