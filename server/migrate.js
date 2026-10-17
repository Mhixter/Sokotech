import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();

  for (const file of files) {
    const { rowCount } = await client.query(
      "SELECT 1 FROM schema_migrations WHERE name = $1",
      [file],
    );
    if (rowCount) continue;

    const sql = await readFile(join(migrationsDirectory, file), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.info(`Applied migration ${file}`);
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
