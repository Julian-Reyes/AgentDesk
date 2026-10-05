import { runMigrations } from "../src/scripts/migrate.ts";
import { connect } from "../src/db/client.ts";
import { seed } from "../src/seed/index.ts";

/**
 * Runs once before all test files: migrate and seed the dedicated test
 * database. Individual DB tests then run inside a transaction that is rolled
 * back, so every test sees this exact seed.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/agentdesk_test";
  if (!/_test\b/.test(url)) throw new Error(`Refusing to run tests against a non-test database: ${url}`);
  process.env.TEST_DATABASE_URL = url;
  await runMigrations(url);
  const { db, close } = connect(url);
  try {
    await seed(db, "2026-09-15");
  } finally {
    await close();
  }
}
