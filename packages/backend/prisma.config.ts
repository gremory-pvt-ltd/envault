import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Relative to this file. Kept absolute in production via .env.
    url: process.env.DATABASE_URL ?? "file:./prisma/envault.db",
  },
});
