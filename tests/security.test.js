import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  decryptIdentityData,
  decryptPin,
  encryptIdentityData,
  encryptPin,
  fingerprintDemoPin,
  fingerprintPin,
  isValidCsrfToken,
  loginInput,
  productInput,
  redactSensitive,
  requestInput,
  signupInput,
  validateDemoSeedConfig,
} from "../server/security.js";

const encryptionKey = randomBytes(32);
const fingerprintKey = randomBytes(32);

test("PIN and identity data encrypt and decrypt with separate keys", () => {
  const pin = "WAEC-SECRET-1234";
  const encryptedPin = encryptPin(pin, encryptionKey);
  assert.notEqual(encryptedPin.ciphertext.toString("utf8"), pin);
  assert.equal(decryptPin({
    ciphertext: encryptedPin.ciphertext,
    iv: encryptedPin.iv,
    authTag: encryptedPin.authTag,
  }, encryptionKey), pin);

  const identity = { nin: "12345678901", consent: true };
  const encryptedIdentity = encryptIdentityData(identity, encryptionKey);
  assert.notEqual(encryptedIdentity.ciphertext.toString("utf8"), JSON.stringify(identity));
  assert.deepEqual(decryptIdentityData({
    ciphertext: encryptedIdentity.ciphertext,
    iv: encryptedIdentity.iv,
    authTag: encryptedIdentity.authTag,
  }, encryptionKey), identity);
});

test("tampered PIN ciphertext fails authenticated decryption", () => {
  const encrypted = encryptPin("secret-pin", encryptionKey);
  const tampered = Buffer.from(encrypted.ciphertext);
  tampered[0] ^= 0xff;
  assert.throws(() => decryptPin({
    ciphertext: tampered,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  }, encryptionKey));
});

test("PIN fingerprint detects duplicates without storing plaintext", () => {
  const first = fingerprintPin("EXAMPLE-PIN", fingerprintKey);
  const duplicate = fingerprintPin("EXAMPLE-PIN", fingerprintKey);
  const different = fingerprintPin("DIFFERENT-PIN", fingerprintKey);
  assert.deepEqual(first, duplicate);
  assert.notDeepEqual(first, different);
  assert.notEqual(first.toString("hex"), "EXAMPLE-PIN");
  assert.notDeepEqual(fingerprintDemoPin("EXAMPLE-PIN", fingerprintKey), first);
  assert.deepEqual(
    fingerprintDemoPin("EXAMPLE-PIN", fingerprintKey),
    fingerprintDemoPin("EXAMPLE-PIN", fingerprintKey),
  );
});

test("signup and product schemas enforce their bounds", () => {
  assert.equal(signupInput.safeParse({
    email: "Person@Example.com",
    password: "long-and-unique-password",
    firstName: "Ada",
    lastName: "Okafor",
  }).data.email, "person@example.com");
  assert.equal(signupInput.safeParse({
    email: "person@example.com",
    password: "short",
    firstName: "Ada",
    lastName: "Okafor",
  }).success, false);
  assert.equal(productInput.safeParse({
    name: "NIN check",
    category: "nin_bvn",
    price: -1,
  }).success, false);
  assert.equal(productInput.safeParse({
    name: "unknown service",
    category: "unknown",
    price: 1,
  }).success, false);
  assert.equal(productInput.safeParse({
    name: "Unverified airtime",
    category: "airtime",
    price: 50,
    providerEnabled: true,
  }).success, false);
  assert.equal(productInput.safeParse({
    name: "Unverified VPN",
    category: "vpn",
    price: 50,
    fulfilmentMethod: "provider",
  }).success, false);
});

test("request submissions require affirmative consent", () => {
  const valid = requestInput.safeParse({
    productId: "a5493293-5a60-4f29-af1a-e51a3e857dc1",
    requestData: { nin: "01234567890" },
    consent: true,
  });
  const invalid = requestInput.safeParse({
    productId: "a5493293-5a60-4f29-af1a-e51a3e857dc1",
    requestData: { nin: "01234567890" },
    consent: false,
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("sensitive values are removed from nested audit metadata", () => {
  assert.deepEqual(redactSensitive({
    reference: "REQ-1",
    ninValue: "01234567890",
    details: { uploadedDocument: "private-file" },
  }), {
    reference: "REQ-1",
    ninValue: "[REDACTED]",
    details: { uploadedDocument: "[REDACTED]" },
  });
});

test("CSRF comparison rejects wrong and missing tokens", () => {
  const token = "replay-safe-random-token";
  assert.equal(isValidCsrfToken(token, token), true);
  assert.equal(isValidCsrfToken("other-token", token), false);
  assert.equal(isValidCsrfToken(undefined, token), false);
});

test("login accepts email normalization without relaxing password bounds", () => {
  assert.equal(loginInput.safeParse({
    email: "OPS@SOKOTECH.NG",
    password: "password",
  }).data.email, "ops@sokotech.ng");
  assert.equal(loginInput.safeParse({
    email: "not-an-email",
    password: "password",
  }).success, false);
});

test("demo seeding requires explicit development-only sandbox configuration", () => {
  const config = {
    nodeEnv: "development",
    enableDemoSeed: "true",
    databaseHost: "localhost",
    databaseName: "sokotech_demo",
    password: "unique-demo-access-phrase-9842",
  };
  assert.doesNotThrow(() => validateDemoSeedConfig(config));
  assert.throws(() => validateDemoSeedConfig({ ...config, nodeEnv: "production" }), /development/);
  assert.throws(() => validateDemoSeedConfig({ ...config, enableDemoSeed: "false" }), /explicitly enable/);
  assert.throws(() => validateDemoSeedConfig({ ...config, databaseHost: "db.example.com" }), /local PostgreSQL host/);
  assert.throws(() => validateDemoSeedConfig({ ...config, databaseName: "sokotech" }), /sokotech_demo/);
  assert.throws(() => validateDemoSeedConfig({ ...config, initialAdminPassword: config.password }), /different/);
  assert.throws(() => validateDemoSeedConfig({ ...config, password: "short" }), /16 and 128/);
  assert.throws(() => validateDemoSeedConfig({ ...config, password: "password-demo-secret" }), /placeholder/);
});
