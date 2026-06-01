import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    // DB-gated suites (db.test.js, migrate.test.js) share a single Postgres
    // instance via DATABASE_URL. Running test files in parallel workers races
    // their migrate/cleanup against each other (afterAll DELETE hits a table
    // another worker just reset). Force serial file execution so the suite is
    // deterministic whether or not DATABASE_URL is set; the suite is ~2s.
    fileParallelism: false,
  },
});
