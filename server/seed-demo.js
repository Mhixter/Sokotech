import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import {
  encryptIdentityData,
  encryptPin,
  fingerprintDemoPin,
  validateDemoSeedConfig,
} from "./security.js";

const { Pool } = pg;
let databaseName;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point to the isolated local demo database.");
  }
  let parsedDatabase;
  try {
    const url = new URL(process.env.DATABASE_URL);
    parsedDatabase = {
      host: url.hostname,
      name: decodeURIComponent(url.pathname.slice(1)),
    };
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  validateDemoSeedConfig({
    nodeEnv: process.env.NODE_ENV,
    enableDemoSeed: process.env.ENABLE_DEMO_SEED,
    databaseHost: parsedDatabase.host,
    databaseName: parsedDatabase.name,
    password: process.env.DEMO_ADMIN_PASSWORD,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
  });
  databaseName = parsedDatabase.name;
} catch (error) {
  console.error(`Demo seeding stopped safely: ${error.message}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 5_000,
  max: 1,
});

const demoEmail = "demo.admin@sokotech.local";
const sampleProducts = [
  ["DEMO · NIN verification", "nin_bvn", "SIMULATED SAMPLE. No government verification is connected.", 1500, 300, 200, 2],
  ["DEMO · BVN check", "nin_bvn", "SIMULATED SAMPLE. No identity provider is connected.", 1000, 200, 150, 2],
  ["DEMO · CAC name search", "cac", "SIMULATED SAMPLE. Not an official CAC service.", 2500, 400, 350, 1],
  ["DEMO · Airtime top-up", "airtime", "SIMULATED SAMPLE. No airtime provider is connected.", 500, 0, 50, 1],
  ["DEMO · Data plan", "mobile_data", "SIMULATED SAMPLE. No mobile data provider is connected.", 1200, 0, 100, 1],
  ["DEMO · VPN subscription", "vpn", "SIMULATED SAMPLE. No VPN subscription is activated.", 3500, 0, 250, 1],
  ["DEMO · WAEC PIN", "education_pins", "TEST ONLY. Imported demo PINs cannot be redeemed.", 1800, 700, 100, 3],
  ["DEMO · Validation request", "validation", "SIMULATED SAMPLE for manually reviewed validation workflows.", 900, 100, 100, 1],
  ["DEMO · IPE request", "ipe", "SIMULATED SAMPLE. IPE workflow is not defined.", 1200, 100, 100, 1],
  ["DEMO · Personalisation", "personalisation", "SIMULATED SAMPLE for manual operations review.", 2200, 250, 150, 1],
];
const sampleStatuses = [
  "submitted",
  "awaiting_payment",
  "pending_review",
  "processing",
  "awaiting_customer_information",
  "completed",
  "rejected",
  "failed",
  "draft",
  "submitted",
];
const samplePaymentStates = [
  "pending",
  "pending",
  "pending",
  "failed",
  "pending",
  "pending",
  "failed",
  "failed",
  "pending",
  "pending",
];

const redact = (value) => value.replace(/.{1,4}/g, "••••");

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentDatabase = await client.query("SELECT current_database() AS name");
    if (currentDatabase.rows[0].name !== databaseName || currentDatabase.rows[0].name !== "sokotech_demo") {
      throw new Error("Connected PostgreSQL database does not match the isolated sokotech_demo sandbox.");
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sokotech-local-demo-v1'))");
    const passwordHash = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD, 12);
    const existing = await client.query(
      "SELECT id, is_demo FROM users WHERE email = $1 FOR UPDATE",
      [demoEmail],
    );
    let accountId;
    if (existing.rowCount) {
      if (!existing.rows[0].is_demo) {
        throw new Error("The demo email already belongs to a non-demo account. No account was changed.");
      }
      accountId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET password_hash = $1, first_name = 'SokoTech',
           last_name = 'Demo Admin', role = 'super_admin', account_status = 'active',
           updated_at = now()
         WHERE id = $2 AND is_demo = true`,
        [passwordHash, accountId],
      );
      await clearExistingDemoRecords(client, accountId);
    } else {
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, is_demo)
         VALUES ($1, $2, 'SokoTech', 'Demo Admin', 'super_admin', true)
         RETURNING id`,
        [demoEmail, passwordHash],
      );
      accountId = inserted.rows[0].id;
    }

    const productIds = [];
    for (const [name, category, description, price, providerCost, serviceFee, lowStockThreshold] of sampleProducts) {
      const result = await client.query(
        `INSERT INTO products
           (name, category, description, price, provider_cost, service_fee,
            commission_rate, fulfilment_method, low_stock_threshold, active, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, 5, $7, $8, true, true)
         RETURNING id`,
        [name, category, description, price, providerCost, serviceFee,
          category === "education_pins" ? "inventory" : "manual", lowStockThreshold],
      );
      productIds.push(result.rows[0].id);
    }

    for (const [index, productId] of productIds.entries()) {
      const idempotencyKey = `demo_${randomUUID().replaceAll("-", "")}`;
      const reference = `DEMO-REQ-${randomUUID().slice(0, 8).toUpperCase()}`;
      const encryptedRequest = encryptIdentityData({
        scenario: "Synthetic local-demo request; not submitted to a real service.",
        sample: redact("DEMO-NOT-A-REAL-IDENTIFIER-0000"),
      });
      const completionEvidence = sampleStatuses[index] === "completed"
        ? encryptIdentityData({ note: "Synthetic demo completion. No external fulfilment occurred." })
        : null;
      const rejectionReason = sampleStatuses[index] === "rejected"
        ? "Synthetic demo rejection example. No real customer or provider is involved."
        : null;
      const request = await client.query(
        `INSERT INTO service_requests
           (reference, product_id, customer_id, assigned_to, idempotency_key,
            status, request_data_ciphertext, request_data_iv, request_data_auth_tag,
            consent_version, consent_purpose, consent_recorded_at, rejection_reason,
            completion_evidence_ciphertext, completion_evidence_iv,
            completion_evidence_auth_tag, completion_evidence_recorded_at, is_demo)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'demo-seed-v1',
            'Synthetic local-demo sample; no real identity data is used', now(), $9,
            $10, $11, $12, CASE WHEN $13::boolean THEN now() ELSE NULL END, true)
         RETURNING id`,
        [reference, productId, accountId, idempotencyKey, sampleStatuses[index],
          encryptedRequest.ciphertext, encryptedRequest.iv, encryptedRequest.authTag,
          rejectionReason, completionEvidence?.ciphertext ?? null,
          completionEvidence?.iv ?? null, completionEvidence?.authTag ?? null,
          Boolean(completionEvidence)],
      );
      const paymentStatus = samplePaymentStates[index];
      await client.query(
        `INSERT INTO transactions
           (reference, idempotency_key, request_id, customer_id, product_id,
            amount_due, amount_paid, provider_cost, service_fee, commission,
            payment_status, fulfilment_status, is_demo)
         SELECT $1, $2, $3, $4, $5, p.price, 0, p.provider_cost, p.service_fee,
                round(p.price * p.commission_rate / 100, 2), $6, $7, true
         FROM products p WHERE p.id = $5`,
        [`DEMO-TXN-${randomUUID().slice(0, 8).toUpperCase()}`, idempotencyKey,
          request.rows[0].id, accountId, productId, paymentStatus,
          sampleStatuses[index] === "completed" ? "completed" : paymentStatus === "failed" ? "failed" : "pending"],
      );
      await writeDemoAudit(client, accountId, "demo.request_seeded", "service_request", request.rows[0].id, {
        scenario: "Synthetic local-demo record",
        sampleStatus: sampleStatuses[index],
      });
    }

    const pinBatch = await client.query(
      `INSERT INTO pin_batches
         (product_id, supplier, batch_reference, acquisition_cost, imported_quantity, created_by, is_demo)
       VALUES ($1, 'DEMO FIXTURE · NOT A SUPPLIER', 'DEMO-BATCH-WAEC-001', 0, 5, $2, true)
       RETURNING id`,
      [productIds[6], accountId],
    );
    const demoPins = [
      { value: "DEMO-NOT-REDEEMABLE-WAEC-AVAILABLE-01", status: "available" },
      { value: "DEMO-NOT-REDEEMABLE-WAEC-AVAILABLE-02", status: "available" },
      { value: "DEMO-NOT-REDEEMABLE-WAEC-RESERVED-01", status: "reserved", allocatedTo: accountId },
      { value: "DEMO-NOT-REDEEMABLE-WAEC-SOLD-01", status: "sold", allocatedTo: accountId },
      { value: "DEMO-NOT-REDEEMABLE-WAEC-EXPIRED-01", status: "expired" },
    ];
    for (const pin of demoPins) {
      const encrypted = encryptPin(pin.value);
      const inserted = await client.query(
        `INSERT INTO pin_inventory
           (batch_id, product_id, pin_ciphertext, pin_iv, pin_auth_tag,
            fingerprint, status, allocated_to, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         RETURNING id`,
        [pinBatch.rows[0].id, productIds[6], encrypted.ciphertext, encrypted.iv,
          encrypted.authTag, fingerprintDemoPin(pin.value), pin.status, pin.allocatedTo ?? null],
      );
      await client.query(
        `INSERT INTO inventory_movements
           (pin_id, batch_id, product_id, movement_type, quantity, actor_id, note, is_demo)
         VALUES ($1, $2, $3, $4, 1, $5, 'Synthetic local-demo record; PIN is not redeemable', true)`,
        [inserted.rows[0].id, pinBatch.rows[0].id, productIds[6],
          pin.status === "expired" ? "expired" : pin.status === "sold" ? "sold" : pin.status === "reserved" ? "reserved" : "imported",
          accountId],
      );
    }
    await writeDemoAudit(client, accountId, "demo.account_seeded", "user", accountId, {
      sampleProducts: productIds.length,
      sampleRequests: sampleStatuses.length,
      samplePins: demoPins.length,
      warning: "All included content is synthetic and must not be treated as a real payment, PIN, customer, identity check, or service result.",
    });
    await client.query("COMMIT");
    console.info("Local SOKOTECH demo account is ready.");
    console.info(`Email: ${demoEmail}`);
    console.info("Password: the DEMO_ADMIN_PASSWORD value in your local .env file");
    console.info("Sandbox: PostgreSQL database sokotech_demo only");
    console.info("All records are synthetic. PIN samples cannot be redeemed; providers and payments are not connected.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(`Demo account was not created: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

async function clearExistingDemoRecords(client, accountId) {
  await client.query('DELETE FROM session WHERE sess->>\'userId\' = $1', [accountId]);
  await client.query("DELETE FROM audit_events WHERE is_demo = true");
  await client.query("DELETE FROM inventory_movements WHERE is_demo = true");
  await client.query("DELETE FROM pin_inventory WHERE is_demo = true");
  await client.query("DELETE FROM pin_batches WHERE is_demo = true");
  await client.query("DELETE FROM transactions WHERE is_demo = true");
  await client.query("DELETE FROM service_requests WHERE is_demo = true");
  await client.query("DELETE FROM products WHERE is_demo = true");
}

async function writeDemoAudit(client, actorId, action, entityType, entityId, metadata) {
  await client.query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, metadata, is_demo)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [actorId, action, entityType, entityId, JSON.stringify(metadata)],
  );
}
