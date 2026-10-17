import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app.js";

class FakePool {
  constructor() {
    this.sessions = new Map();
    this.users = new Map();
    this.auditCount = 0;
  }

  connect() {
    return Promise.resolve({ query: this.query.bind(this), release() {} });
  }

  async query(sql, parameters = []) {
    const normalizedSql = sql.replace(/\s+/g, " ");
    if (/SELECT sess FROM "session" WHERE sid = \$1/.test(normalizedSql)) {
      const session = this.sessions.get(parameters[0]);
      return { rows: session && session.expires >= parameters[1] ? [{ sess: session.data }] : [], rowCount: session ? 1 : 0 };
    }
    if (/INSERT INTO "session"/.test(normalizedSql)) {
      this.sessions.set(parameters[2], { data: parameters[0], expires: parameters[1] });
      return { rows: [{ sid: parameters[2] }], rowCount: 1 };
    }
    if (/DELETE FROM "session" WHERE sid = \$1/.test(normalizedSql)) {
      const deleted = this.sessions.delete(parameters[0]);
      return { rows: [], rowCount: deleted ? 1 : 0 };
    }
    if (/DELETE FROM "session" WHERE expire/.test(normalizedSql)) return { rows: [], rowCount: 0 };
    if (/SELECT 1/.test(normalizedSql)) return { rows: [{ "?column?": 1 }], rowCount: 1 };
    if (/SELECT id, email, first_name AS "firstName".*FROM users WHERE id = \$1/.test(normalizedSql)) {
      const user = this.users.get(parameters[0]);
      return {
        rows: user && user.account_status === "active" ? [publicUser(user)] : [],
        rowCount: user && user.account_status === "active" ? 1 : 0,
      };
    }
    if (/SELECT id, email, first_name AS "firstName".*account_status, password_hash/.test(normalizedSql)) {
      const user = [...this.users.values()].find((entry) => entry.email === parameters[0]);
      return {
        rows: user ? [{
          ...publicUser(user),
          account_status: user.account_status,
          password_hash: user.password_hash,
        }] : [],
        rowCount: user ? 1 : 0,
      };
    }
    if (/SELECT role, account_status, is_demo FROM users/.test(normalizedSql)) {
      const user = this.users.get(parameters[0]);
      return {
        rows: user ? [{ role: user.role, account_status: user.account_status, is_demo: user.is_demo }] : [],
        rowCount: user ? 1 : 0,
      };
    }
    if (/FROM service_requests r/.test(normalizedSql)) {
      this.lastRequestScope = { sql: normalizedSql, parameters };
      return {
        rows: [{
          id: "demo-request",
          reference: "DEMO-REQ-123",
          status: "pending_review",
          productName: "DEMO · NIN verification",
          customerFirstName: "SokoTech",
        }],
        rowCount: 1,
      };
    }
    if (/INSERT INTO users/.test(normalizedSql)) {
      if ([...this.users.values()].some((entry) => entry.email === parameters[0])) {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      const user = {
        id: `${this.users.size + 1}`,
        email: parameters[0],
        password_hash: parameters[1],
        firstName: parameters[2],
        lastName: parameters[3],
        role: "customer",
        account_status: "active",
        is_demo: false,
      };
      this.users.set(user.id, user);
      return { rows: [publicUser(user)], rowCount: 1 };
    }
    if (/INSERT INTO audit_events/.test(normalizedSql)) {
      this.auditCount += 1;
      return { rows: [], rowCount: 1 };
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(normalizedSql.trim())) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected test SQL: ${normalizedSql.trim()}`);
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isDemo: Boolean(user.is_demo),
  };
}

const pool = new FakePool();
const app = createApp({ pool, sessionSecret: "test-session-secret-at-least-32-characters-long", production: false });
const passwordHash = await bcrypt.hash("a-test-password-long-enough", 4);
pool.users.set("admin-test", {
  id: "admin-test",
  email: "admin@example.test",
  firstName: "SOKOTECH",
  lastName: "Admin",
  role: "super_admin",
  account_status: "active",
  is_demo: true,
  password_hash: passwordHash,
});
let server;
let origin;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("public landing, login and admin pages are served with security headers", async () => {
  for (const path of ["/", "/login.html", "/signup.html", "/dashboard.html", "/verification.html"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.ok((await response.text()).includes("SOKOTECH"));
  }
  assert.equal(await (await fetch(`${origin}/server/app.js`)).status, 404);
});

test("mutating requests require a session-bound CSRF token", async () => {
  const response = await fetch(`${origin}/api/auth/csrf`);
  assert.equal(response.status, 200);
  const { csrfToken } = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const rejected = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "a-test-password-long-enough" }),
  });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error.code, "CSRF_INVALID");

  const accepted = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ email: "admin@example.test", password: "a-test-password-long-enough" }),
  });
  assert.equal(accepted.status, 200);
  const user = await accepted.json();
  assert.equal(user.user.role, "super_admin");
  assert.equal(user.user.isDemo, true);
  assert.equal("password_hash" in user.user, false);
  assert.ok(user.csrfToken);
  assert.notEqual(accepted.headers.get("set-cookie").split(";")[0], cookie);
});

test("demo admin can open a self-scoped customer view without widening customer access", async () => {
  const tokenResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await tokenResponse.json();
  const cookie = tokenResponse.headers.get("set-cookie").split(";")[0];
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ email: "admin@example.test", password: "a-test-password-long-enough" }),
  });
  const sessionCookie = login.headers.get("set-cookie").split(";")[0];
  const { csrfToken: sessionCsrfToken } = await login.json();
  const customerView = await fetch(`${origin}/api/requests?scope=mine&page=1&limit=25`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(customerView.status, 200);
  assert.equal((await customerView.json()).items[0].reference, "DEMO-REQ-123");
  assert.deepEqual(pool.lastRequestScope.parameters, ["admin-test", true, 25, 0]);

  const identity = await fetch(`${origin}/api/auth/me`, { headers: { Cookie: sessionCookie } });
  assert.equal((await identity.json()).user.isDemo, true);
  assert.equal(sessionCsrfToken.length > 0, true);
});

test("account registration validates input and only persists a password hash", async () => {
  const tokenResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await tokenResponse.json();
  const cookie = tokenResponse.headers.get("set-cookie").split(";")[0];

  const invalid = await fetch(`${origin}/api/auth/signup`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({
      email: "new@example.test",
      password: "short",
      firstName: "Sam",
      lastName: "Tester",
    }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "VALIDATION_FAILED");

  const response = await fetch(`${origin}/api/auth/signup`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({
      email: "NEW@example.test",
      password: "safe-long-password-123",
      firstName: "Sam",
      lastName: "Tester",
    }),
  });
  assert.equal(response.status, 201);
  const account = await response.json();
  assert.equal(account.user.email, "new@example.test");
  assert.equal("password_hash" in account.user, false);
  assert.notEqual(pool.users.get(account.user.id).password_hash, "safe-long-password-123");
  assert.equal(pool.auditCount, 1);
});

test("customer authorization rejects privileged product writes", async () => {
  const tokenResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await tokenResponse.json();
  const cookie = tokenResponse.headers.get("set-cookie").split(";")[0];
  const registration = await fetch(`${origin}/api/auth/signup`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({
      email: "customer@example.test",
      password: "another-long-password",
      firstName: "Casey",
      lastName: "Customer",
    }),
  });
  const sessionCookie = registration.headers.get("set-cookie").split(";")[0];
  const { csrfToken: rotatedToken } = await registration.json();
  const demoScope = await fetch(`${origin}/api/requests?scope=mine`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(demoScope.status, 403);
  const forbidden = await fetch(`${origin}/api/products`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": rotatedToken,
    },
    body: JSON.stringify({ name: "Unapproved product", category: "airtime", price: 10 }),
  });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "FORBIDDEN");
});
