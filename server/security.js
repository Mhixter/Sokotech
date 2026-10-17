import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const productCategories = [
  "nin_bvn",
  "cac",
  "airtime",
  "mobile_data",
  "vpn",
  "education_pins",
  "validation",
  "ipe",
  "personalisation",
];

const money = z.coerce.number().finite().min(0).max(1_000_000_000);

const productBase = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(productCategories),
  description: z.string().trim().max(2000).default(""),
  price: money,
  providerCost: money.default(0),
  serviceFee: money.default(0),
  commissionRate: z.coerce.number().finite().min(0).max(100).default(0),
  providerName: z.string().trim().max(120).nullable().optional(),
  providerEnabled: z.boolean().default(false),
  fulfilmentMethod: z.enum(["manual", "provider", "inventory"]).default("manual"),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).default(0),
  active: z.boolean().default(true),
});

function rejectUnavailableProviderMethods(value, context) {
  if (value.providerEnabled === true) {
    context.addIssue({
      code: "custom",
      path: ["providerEnabled"],
      message: "Live provider integrations are not configured and cannot be enabled.",
    });
  }
  if (value.fulfilmentMethod === "provider") {
    context.addIssue({
      code: "custom",
      path: ["fulfilmentMethod"],
      message: "Use manual or inventory fulfilment until an approved provider adapter is implemented.",
    });
  }
}

export const productInput = productBase.superRefine(rejectUnavailableProviderMethods);

export const productPatchInput = productBase
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one product field is required.")
  .superRefine(rejectUnavailableProviderMethods);

export const signupInput = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export const loginInput = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export function validateDemoSeedConfig({
  nodeEnv,
  enableDemoSeed,
  databaseHost,
  databaseName,
  password,
  initialAdminPassword,
}) {
  if (nodeEnv !== "development") {
    throw new Error("Demo seed is allowed only when NODE_ENV=development.");
  }
  if (enableDemoSeed !== "true") {
    throw new Error("Set ENABLE_DEMO_SEED=true to explicitly enable demo seeding.");
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseHost)) {
    throw new Error("Demo seed requires a local PostgreSQL host (localhost or loopback address).");
  }
  if (databaseName !== "sokotech_demo") {
    throw new Error("Demo seed requires a PostgreSQL database named exactly sokotech_demo.");
  }
  if (typeof password !== "string" || password.length < 16 || password.length > 128) {
    throw new Error("DEMO_ADMIN_PASSWORD must be a unique password between 16 and 128 characters.");
  }
  if (/^(password|change[-_]?me|demo[-_]?password|replace[-_]?me)/i.test(password)) {
    throw new Error("Choose a unique DEMO_ADMIN_PASSWORD instead of a sample or placeholder password.");
  }
  if (initialAdminPassword && password === initialAdminPassword) {
    throw new Error("DEMO_ADMIN_PASSWORD must be different from INITIAL_ADMIN_PASSWORD.");
  }
}

export const requestInput = z.object({
  productId: z.string().uuid(),
  requestData: z.record(z.string(), z.unknown()).default({}),
  consent: z.literal(true),
});

const keyFromEnv = (name) => {
  const value = process.env[name];
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${name} must be set to a 64-character hex-encoded 32-byte key.`);
  }
  return Buffer.from(value, "hex");
};

export function encryptPin(pin, key = keyFromEnv("PIN_ENCRYPTION_KEY")) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decryptPin(record, key = keyFromEnv("PIN_ENCRYPTION_KEY")) {
  const decipher = createDecipheriv("aes-256-gcm", key, record.iv);
  decipher.setAuthTag(record.authTag);
  return Buffer.concat([
    decipher.update(record.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptIdentityData(value, key = keyFromEnv("IDENTITY_ENCRYPTION_KEY")) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decryptIdentityData(record, key = keyFromEnv("IDENTITY_ENCRYPTION_KEY")) {
  const decipher = createDecipheriv("aes-256-gcm", key, record.iv);
  decipher.setAuthTag(record.authTag);
  const plaintext = Buffer.concat([
    decipher.update(record.ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

export function fingerprintPin(pin, key = keyFromEnv("PIN_FINGERPRINT_KEY")) {
  return createHmac("sha256", key).update(pin, "utf8").digest();
}

export function fingerprintDemoPin(pin, key = keyFromEnv("PIN_FINGERPRINT_KEY")) {
  const sandboxKey = createHmac("sha256", key)
    .update("sokotech-demo-pin-fingerprint-v1", "utf8")
    .digest();
  return fingerprintPin(pin, sandboxKey);
}

export function isValidCsrfToken(supplied, expected) {
  if (typeof supplied !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /nin|bvn|pin|password|token|secret|document/i.test(key)
        ? "[REDACTED]"
        : redactSensitive(item),
    ]),
  );
}
