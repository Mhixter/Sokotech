import bcrypt from "bcryptjs";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;
const email = z.string().email().safeParse(process.env.INITIAL_ADMIN_EMAIL);
const password = process.env.INITIAL_ADMIN_PASSWORD;

if (!email.success || !password || password.length < 16) {
  console.error("Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (at least 16 characters) before seeding.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, 'SOKOTECH', 'Administrator', 'super_admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email.data.toLowerCase(), passwordHash],
  );

  if (result.rowCount === 0) {
    console.error("That email already exists; no account was changed.");
    process.exitCode = 1;
  } else {
    console.info("Initial Super Admin created. Remove the initial credentials from your environment.");
  }
} catch (error) {
  console.error("Could not seed the initial administrator:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
