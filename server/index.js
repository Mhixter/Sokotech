import pg from "pg";
import { createApp } from "./app.js";

const { Pool } = pg;
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const encryptionKeys = [
  ["PIN_ENCRYPTION_KEY", process.env.PIN_ENCRYPTION_KEY],
  ["PIN_FINGERPRINT_KEY", process.env.PIN_FINGERPRINT_KEY],
  ["IDENTITY_ENCRYPTION_KEY", process.env.IDENTITY_ENCRYPTION_KEY],
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be configured before starting SOKOTECH.");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a valid TCP port between 1 and 65535.");
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must contain at least 32 characters.");
  process.exit(1);
}
const invalidKeys = encryptionKeys
  .filter(([, value]) => !value || !/^[0-9a-f]{64}$/i.test(value))
  .map(([name]) => name);
if (invalidKeys.length) {
  console.error(`Configure separate 32-byte hexadecimal keys: ${invalidKeys.join(", ")}.`);
  process.exit(1);
}
if (new Set(encryptionKeys.map(([, value]) => value.toLowerCase())).size !== encryptionKeys.length) {
  console.error("PIN encryption, identity encryption, and PIN fingerprint keys must all be different.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

pool.on("error", (error) => {
  console.error(JSON.stringify({ error: "postgres_pool", code: error.code }));
});

try {
  await pool.query("SELECT 1");
} catch (error) {
  console.error(`Cannot connect to PostgreSQL (${error.code ?? error.name}). Run migrations and check DATABASE_URL.`);
  await pool.end();
  process.exit(1);
}

const app = createApp({ pool });
app.locals.pool = pool;
const server = app.listen(port, () => {
  console.info(`SOKOTECH is listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
