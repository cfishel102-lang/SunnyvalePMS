// Loads the starting data only when the database has never been set up.
// It never touches a database that already has an account in it.
import { db } from "../src/lib/db";

async function main() {
  const accounts = await db.organization.count();
  await db.$disconnect();
  if (accounts > 0) return console.log("Database already set up; leaving its data alone.");
  console.log("New database: loading starting data.");
  await import("./seed");
}
main();
