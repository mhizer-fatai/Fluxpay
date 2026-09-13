import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const migrationsDir = join(__dirname, "..", "..", "migrations");

async function migrate(): Promise<void> {
  // ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      run_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rowCount } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if (rowCount && rowCount > 0) {
      console.log(`  [skip] ${file} already applied`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`  [run]  ${file}`);
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
  }

  console.log("  ✓ all migrations applied");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});