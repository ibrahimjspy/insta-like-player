import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moves the connection URL out of schema.prisma into this file.
// It's used by the Prisma CLI (migrate, db push, studio). The runtime client
// gets its connection via the pg driver adapter in src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
