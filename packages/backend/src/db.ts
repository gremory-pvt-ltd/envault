import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./env.js";

const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });

/**
 * Single Prisma client for the whole process.
 *
 * Values are stored as plain text in SQLite by product decision; the DB file
 * is the secret material. Never enable Prisma query logging here — it prints
 * bound parameters, which are secrets.
 */
export const prisma = new PrismaClient({
  adapter,
  log: ["error"],
});

/** SQLite pragmas that Prisma does not set itself. */
export async function configureSqlite() {
  await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL;");
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000;");
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
  await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL;");
}
