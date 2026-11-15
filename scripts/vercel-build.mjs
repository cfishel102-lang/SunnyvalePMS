// What Vercel runs to build the app. It also prepares the database, so a
// deploy needs no manual steps:
//   1. create or update the tables
//   2. on a brand-new database only, load the starting data
//   3. build the site
import { execSync } from "node:child_process";

const env = { ...process.env };
// Table changes need a direct database connection, not the pooled one.
const direct = env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
if (!direct) {
  console.error("\nNo database is connected. In Vercel, open the project's Storage tab, add a Postgres database, then redeploy.\n");
  process.exit(1);
}
env.DATABASE_URL = env.DATABASE_URL || direct;
const run = (cmd, e = env) => execSync(cmd, { stdio: "inherit", env: e });

run("npx prisma generate");
run("npx prisma migrate deploy", { ...env, DATABASE_URL: direct });
run("npx tsx prisma/seed-if-empty.ts", { ...env, DATABASE_URL: direct });
run("npx next build");
