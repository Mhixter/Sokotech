import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import express from "express";
import { rateLimit } from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  encryptIdentityData,
  encryptPin,
  fingerprintDemoPin,
  fingerprintPin,
  isValidCsrfToken,
  loginInput,
  productPatchInput,
  productInput,
  redactSensitive,
  requestInput,
  signupInput,
} from "./security.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PgSession = connectPgSimple(session);
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const staffRoles = ["super_admin", "super_agent", "finance", "operations", "reviewer"];
const managerRoles = ["super_admin", "super_agent"];
const operationsRoles = ["super_admin", "super_agent", "operations", "reviewer"];
const inventoryInput = z.object({
  productId: z.string().uuid(),
  supplier: z.string().trim().min(1).max(120),
  batchReference: z.string().trim().min(3).max(80),
  acquisitionCost: z.coerce.number().finite().min(0).max(1_000_000_000),
  csv: z.string().min(1).max(1_000_000),
});
const requestUpdateSchema = z.object({
  status: z.enum([
    "submitted",
    "awaiting_payment",
    "pending_review",
    "processing",
    "awaiting_customer_information",
    "completed",
    "rejected",
    "failed",
  ]),
  internalNotes: z.string().trim().max(4000).optional(),
  completionNote: z.string().trim().max(1000).optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});
const statusTransitions = {
  submitted: ["awaiting_payment", "pending_review", "rejected"],
  awaiting_payment: ["failed"],
  paid: ["pending_review", "processing", "failed"],
  pending_review: ["processing", "awaiting_customer_information", "rejected"],
  processing: ["awaiting_customer_information", "completed", "rejected", "failed"],
  awaiting_customer_information: ["pending_review", "processing", "rejected"],
  failed: ["processing"],
  completed: [],
  rejected: ["pending_review"],
  draft: ["submitted"],
};

export function createApp({ pool, sessionSecret = process.env.SESSION_SECRET, production = process.env.NODE_ENV === "production" }) {
  if (!pool) throw new Error("A PostgreSQL connection pool is required.");
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  const app = express();
  app.locals.pool = pool;
  const publicFiles = new Map([
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/signup.html", "signup.html"],
    ["/login.html", "login.html"],
    ["/dashboard.html", "dashboard.html"],
    ["/styles.css", "styles.css"],
    ["/landing.css", "landing.css"],
    ["/auth.css", "auth.css"],
    ["/admin.css", "admin.css"],
    ["/app.js", "app.js"],
    ["/admin.js", "admin.js"],
    ["/verification.html", "verification.html"],
    ["/customer.js", "customer.js"],
    ["/favicon.ico", "assets/sokotech-mark.jpg"],
  ]);

  app.disable("x-powered-by");
  app.set("trust proxy", production ? 1 : false);
  app.use(helmet({
    strictTransportSecurity: production ? undefined : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: "1.1mb", strict: true }));
  app.use(session({
    name: "sokotech.sid",
    secret: sessionSecret,
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    if (mutationMethods.has(req.method) && req.path.startsWith("/api/")) {
      const supplied = req.get("X-CSRF-Token");
      if (!isValidCsrfToken(supplied, req.session.csrfToken)) {
        return res.status(403).json({ error: { code: "CSRF_INVALID", message: "Refresh the page and try again." }, requestId: req.requestId });
      }
    }
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again later." } },
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", database: "connected" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "unavailable" });
    }
  });

  app.get("/api/auth/csrf", (req, res) => {
    req.session.csrfToken ??= randomBytes(32).toString("hex");
    res.setHeader("Cache-Control", "no-store");
    res.json({ csrfToken: req.session.csrfToken });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    const result = await pool.query(
      `SELECT id, email, first_name AS "firstName", last_name AS "lastName",
              role, is_demo AS "isDemo", created_at AS "createdAt"
       FROM users WHERE id = $1 AND account_status = 'active'`,
      [req.session.userId],
    );
    if (!result.rowCount) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user: result.rows[0] });
  });

  app.post("/api/auth/signup", authLimiter, async (req, res) => {
    const input = signupInput.safeParse(req.body);
    if (!input.success) return validationError(res, input.error);

    const passwordHash = await bcrypt.hash(input.data.password, 12);
    const client = await pool.connect();
    let user;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, first_name AS "firstName", last_name AS "lastName",
                   role, created_at AS "createdAt"`,
        [input.data.email, passwordHash, input.data.firstName, input.data.lastName],
      );
      user = inserted.rows[0];
      await writeAudit(client, user.id, "account.created", "user", user.id, {});
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        return res.status(409).json({ error: { code: "ACCOUNT_EXISTS", message: "An account with that email already exists." } });
      }
      throw error;
    } finally {
      client.release();
    }
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.isDemo = Boolean(user.isDemo);
    req.session.csrfToken = randomBytes(32).toString("hex");
    res.status(201).json({ user, csrfToken: req.session.csrfToken });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const input = loginInput.safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    const result = await pool.query(
      `SELECT id, email, first_name AS "firstName", last_name AS "lastName", role,
              account_status, password_hash, is_demo AS "isDemo"
       FROM users WHERE email = $1`,
      [input.data.email],
    );
    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(
      input.data.password,
      user?.password_hash ?? "$2a$12$abcdefghijklmnopqrstuu",
    );
    if (!user || !passwordMatches || user.account_status !== "active") {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
    }
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.isDemo = Boolean(user.isDemo);
    req.session.csrfToken = randomBytes(32).toString("hex");
    const { password_hash: _passwordHash, account_status: _accountStatus, ...safeUser } = user;
    res.json({ user: safeUser, csrfToken: req.session.csrfToken });
  });

  app.post("/api/auth/logout", async (req, res) => {
    await destroySession(req);
    res.clearCookie("sokotech.sid", { httpOnly: true, secure: production, sameSite: "lax" });
    res.status(204).end();
  });

  app.post("/api/auth/password-reset-request", authLimiter, async (req, res) => {
    const input = z.object({
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    }).safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: {
        code: "EMAIL_DELIVERY_NOT_CONFIGURED",
        message: "Password reset is unavailable because no verified email delivery service is configured. Contact the administrator for help.",
      },
    });
  });

  app.use("/api", (req, res, next) => {
    if (!req.path.startsWith("/auth/") && !req.session.userId) {
      return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." }, requestId: req.requestId });
    }
    next();
  });

  app.get("/api/dashboard/overview", requireRole(...staffRoles), async (req, res) => {
    const demo = req.session.isDemo;
    const [transactions, requests, inventory, daily, products, activity] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(amount_due) FILTER (WHERE payment_status = 'confirmed'), 0)::text AS transaction_value,
          COALESCE(SUM(amount_paid) FILTER (WHERE payment_status = 'confirmed'), 0)::text AS revenue,
          COALESCE(SUM(amount_paid - provider_cost - commission) FILTER (WHERE payment_status = 'confirmed'), 0)::text AS gross_profit,
          COUNT(*) FILTER (WHERE payment_status = 'confirmed')::int AS successful,
          COUNT(*) FILTER (WHERE payment_status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE payment_status IN ('failed', 'reversed'))::int AS failed
        FROM transactions
        WHERE is_demo = $1 AND created_at >= now() - interval '30 days'
      `, [demo]),
      pool.query(`
        SELECT COUNT(*)::int AS pending
        FROM service_requests WHERE is_demo = $1 AND status IN ('submitted', 'paid', 'pending_review', 'processing', 'awaiting_customer_information')
      `, [demo]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'available' AND (expires_at IS NULL OR expires_at > now()))::int AS available,
          COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved,
          COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
          COUNT(*) FILTER (WHERE status = 'expired' OR (status = 'available' AND expires_at <= now()))::int AS expired
        FROM pin_inventory WHERE is_demo = $1
      `, [demo]),
      pool.query(`
        SELECT created_at::date::text AS date,
               COALESCE(SUM(amount_paid), 0)::text AS revenue,
               COALESCE(SUM(amount_paid - provider_cost - commission), 0)::text AS profit
        FROM transactions
        WHERE is_demo = $1 AND payment_status = 'confirmed'
          AND created_at >= (CURRENT_DATE - interval '29 days')
        GROUP BY created_at::date
        ORDER BY created_at::date
      `, [demo]),
      pool.query(`
        SELECT p.id, p.name, p.category, p.provider_name AS "providerName",
               p.provider_enabled AS "providerEnabled", p.low_stock_threshold AS "lowStockThreshold",
               COUNT(i.id) FILTER (WHERE i.status = 'available' AND (i.expires_at IS NULL OR i.expires_at > now()))::int AS "availablePins"
        FROM products p
        LEFT JOIN pin_inventory i ON i.product_id = p.id AND i.is_demo = $1
        WHERE p.active = true AND p.is_demo = $1
        GROUP BY p.id
        ORDER BY p.name
      `, [demo]),
      pool.query(`
        SELECT a.id, a.action, a.entity_type AS "entityType", a.created_at AS "createdAt",
               u.first_name AS "actorFirstName", u.last_name AS "actorLastName"
        FROM audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.is_demo = $1
        ORDER BY a.created_at DESC
        LIMIT 8
      `, [demo]),
    ]);
    const availableProducts = products.rows.map((product) => ({
      ...product,
      lowStock: product.category === "education_pins"
        && product.availablePins <= product.lowStockThreshold,
      providerState: product.providerEnabled ? "configured" : "not_configured",
    }));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      period: "30 days",
      transactions: transactions.rows[0],
      dailyActivity: daily.rows,
      requests: requests.rows[0],
      inventory: inventory.rows[0],
      providers: {
        configuredProducts: availableProducts.filter((product) => product.providerEnabled).length,
        unconfiguredProducts: availableProducts.filter((product) => !product.providerEnabled).length,
        monitoringAvailable: false,
      },
      lowStock: availableProducts.filter((product) => product.lowStock),
      activity: activity.rows,
    });
  });

  app.get("/api/products", requireRole(...staffRoles), async (req, res) => {
    const page = parsePagination(req.query);
    const values = [req.session.isDemo, page.limit, page.offset];
    let where = "WHERE p.is_demo = $1";
    if (req.query.category) {
      const category = z.enum(["nin_bvn", "cac", "airtime", "mobile_data", "vpn", "education_pins", "validation", "ipe", "personalisation"]).safeParse(req.query.category);
      if (!category.success) return validationError(res, category.error);
      values.splice(1, 0, category.data);
      where += " AND p.category = $2";
    }
    const result = await pool.query(`
      SELECT p.id, p.name, p.category, p.description, p.price::text,
             p.provider_cost::text AS "providerCost", p.service_fee::text AS "serviceFee",
             p.commission_rate::text AS "commissionRate", p.provider_name AS "providerName",
             p.provider_enabled AS "providerEnabled", p.fulfilment_method AS "fulfilmentMethod",
             p.low_stock_threshold AS "lowStockThreshold", p.active,
             p.created_at AS "createdAt", p.updated_at AS "updatedAt"
      FROM products p ${where}
      ORDER BY p.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    res.json({ items: result.rows, ...page });
  });

  app.get("/api/staff", requireRole(...operationsRoles), async (req, res) => {
    const result = await pool.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", role
       FROM users
       WHERE role IN ('super_admin', 'super_agent', 'operations', 'reviewer')
         AND account_status = 'active' AND is_demo = $1
       ORDER BY first_name, last_name`,
      [req.session.isDemo],
    );
    res.json({ items: result.rows });
  });

  app.post("/api/products", requireRole(...managerRoles), async (req, res) => {
    const input = productInput.safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    const client = await pool.connect();
    let product;
    try {
      await client.query("BEGIN");
      product = await insertProduct(client, input.data, req.session.isDemo);
      await writeAudit(client, req.session.userId, "product.created", "product", product.id, {
        category: product.category,
        name: product.name,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ product });
  });

  app.patch("/api/products/:id", requireRole(...managerRoles), async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const input = productPatchInput.safeParse(req.body);
    if (!id.success) return validationError(res, id.error);
    if (!input.success) return validationError(res, input.error);
    const fieldMap = {
      name: "name",
      category: "category",
      description: "description",
      price: "price",
      providerCost: "provider_cost",
      serviceFee: "service_fee",
      commissionRate: "commission_rate",
      providerName: "provider_name",
      providerEnabled: "provider_enabled",
      fulfilmentMethod: "fulfilment_method",
      lowStockThreshold: "low_stock_threshold",
      active: "active",
    };
    const fields = Object.entries(input.data);
    const assignments = fields.map(([key], index) => `${fieldMap[key]} = $${index + 1}`);
    const values = fields.map(([, value]) => value);
    assignments.push("updated_at = now()");
    values.push(id.data);
    const client = await pool.connect();
    let product;
    try {
      await client.query("BEGIN");
      const previousProduct = await client.query(
        "SELECT * FROM products WHERE id = $1 AND is_demo = $2 FOR UPDATE",
        [id.data, req.session.isDemo],
      );
      if (!previousProduct.rowCount) {
        await client.query("ROLLBACK");
        return notFound(res, "Product");
      }
      const result = await client.query(
        `UPDATE products SET ${assignments.join(", ")} WHERE id = $${values.length} AND is_demo = $${values.length + 1}
         RETURNING id, name, category, description, price::text, active, updated_at AS "updatedAt"`,
        [...values, req.session.isDemo],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return notFound(res, "Product");
      }
      product = result.rows[0];
      await writeAudit(client, req.session.userId, "product.updated", "product", id.data, {
        changes: Object.fromEntries(fields.map(([key, value]) => {
          const snakeCaseKey = fieldMap[key];
          return [key, {
            from: previousProduct.rows[0][snakeCaseKey],
            to: value,
          }];
        })),
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.json({ product });
  });

  app.get("/api/requests", requireRole(...staffRoles, "sub_agent", "customer"), async (req, res) => {
    const page = parsePagination(req.query);
    const isCustomer = req.session.role === "customer" || req.session.role === "sub_agent";
    const demoCustomerView = req.query.scope === "mine"
      && req.session.role === "super_admin"
      && req.session.isDemo;
    if (req.query.scope && !demoCustomerView) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "This customer view is available only to the local demo account." } });
    }
    const ownRequests = isCustomer || demoCustomerView;
    const values = ownRequests
      ? [req.session.userId, req.session.isDemo, page.limit, page.offset]
      : [req.session.isDemo, page.limit, page.offset];
    const where = ownRequests
      ? "WHERE r.customer_id = $1 AND r.is_demo = $2"
      : "WHERE r.is_demo = $1";
    const limitPosition = ownRequests ? 3 : 2;
    const result = await pool.query(`
      SELECT r.id, r.reference, r.status, r.created_at AS "createdAt",
             r.updated_at AS "updatedAt", p.name AS "productName",
             r.assigned_to AS "assignedTo",
             p.category, u.first_name AS "customerFirstName",
             u.last_name AS "customerLastName", a.first_name AS "assignedFirstName",
             a.last_name AS "assignedLastName"
      FROM service_requests r
      JOIN products p ON p.id = r.product_id
      JOIN users u ON u.id = r.customer_id
      LEFT JOIN users a ON a.id = r.assigned_to
      ${where}
      ORDER BY r.created_at DESC
      LIMIT $${limitPosition} OFFSET $${limitPosition + 1}
    `, values);
    res.json({ items: result.rows, ...page });
  });

  app.post("/api/requests", async (req, res) => {
    const account = await pool.query(
      "SELECT is_demo, account_status FROM users WHERE id = $1",
      [req.session.userId],
    );
    if (!account.rowCount || account.rows[0].account_status !== "active") {
      await destroySession(req);
      return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." }, requestId: req.requestId });
    }
    req.session.isDemo = account.rows[0].is_demo;
    const input = requestInput.safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    const idempotencyKey = req.get("Idempotency-Key");
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Provide a unique Idempotency-Key for this request." } });
    }
    const scopedIdempotencyKey = req.session.isDemo ? `demo_${idempotencyKey}` : idempotencyKey;

    const client = await pool.connect();
    let request;
    try {
      await client.query("BEGIN");
        const existing = await client.query(
          "SELECT id, reference, status FROM service_requests WHERE idempotency_key = $1 AND is_demo = $2",
          [scopedIdempotencyKey, req.session.isDemo],
      );
      if (existing.rowCount) {
        await client.query("COMMIT");
        return res.status(200).json({ request: existing.rows[0], duplicate: true });
      }
      const productResult = await client.query(
        "SELECT id, name, price, provider_cost, service_fee FROM products WHERE id = $1 AND active = true AND is_demo = $2 FOR SHARE",
        [input.data.productId, req.session.isDemo],
      );
      const product = productResult.rows[0];
      if (!product) {
        await client.query("ROLLBACK");
        return notFound(res, "Active product");
      }
      const encrypted = encryptIdentityData(input.data.requestData);
      const reference = `REQ-${randomUUID()}`;
      const status = product.price === "0.00" || Number(product.price) === 0
        ? "submitted"
        : "awaiting_payment";
      const inserted = await client.query(
        `INSERT INTO service_requests
           (reference, product_id, customer_id, idempotency_key, status, request_data_ciphertext,
            request_data_iv, request_data_auth_tag, consent_version, consent_purpose,
            consent_recorded_at, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'service-request-v1',
                 'Fulfil the customer-requested service', now(), $9)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, reference, status, created_at AS "createdAt"`,
        [reference, product.id, req.session.userId, scopedIdempotencyKey, status,
          encrypted.ciphertext, encrypted.iv, encrypted.authTag, req.session.isDemo],
      );
      if (!inserted.rowCount) {
        const duplicate = await client.query(
          "SELECT id, reference, status FROM service_requests WHERE idempotency_key = $1 AND is_demo = $2",
          [scopedIdempotencyKey, req.session.isDemo],
        );
        await client.query("COMMIT");
        return res.status(200).json({ request: duplicate.rows[0], duplicate: true });
      }
      request = inserted.rows[0];
      await client.query(
        `INSERT INTO transactions
           (reference, idempotency_key, request_id, customer_id, product_id,
             amount_due, amount_paid, provider_cost, service_fee, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [`TXN-${scopedIdempotencyKey}`, scopedIdempotencyKey, request.id, req.session.userId,
           product.id, product.price, 0, product.provider_cost, product.service_fee, req.session.isDemo],
      );
      await writeAudit(client, req.session.userId, "request.submitted", "service_request", request.id, {
        productName: product.name,
        reference: request.reference,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ request });
  });

  app.patch("/api/requests/:id", requireRole(...operationsRoles), async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const input = requestUpdateSchema.safeParse(req.body);
    if (!id.success) return validationError(res, id.error);
    if (!input.success) return validationError(res, input.error);
    const client = await pool.connect();
    let updated;
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id, status, assigned_to FROM service_requests WHERE id = $1 AND is_demo = $2 FOR UPDATE",
        [id.data, req.session.isDemo],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return notFound(res, "Request");
      }
      if (!statusTransitions[current.rows[0].status]?.includes(input.data.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: {
            code: "INVALID_STATUS_TRANSITION",
            message: `A request cannot move from ${current.rows[0].status} to ${input.data.status}.`,
          },
        });
      }
      if (input.data.status === "rejected" && !input.data.rejectionReason?.trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: { code: "REJECTION_REASON_REQUIRED", message: "Include a reason when rejecting a request." } });
      }
      if (input.data.status === "completed" && !input.data.completionNote?.trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: { code: "COMPLETION_NOTE_REQUIRED", message: "Add a completion note before completing a service request." },
        });
      }
      const encryptedCompletionNote = input.data.status === "completed"
        ? encryptIdentityData({ note: input.data.completionNote })
        : null;
      if (input.data.assignedTo && input.data.assignedTo !== current.rows[0].assigned_to) {
        const assignee = await client.query(
          `SELECT id FROM users
           WHERE id = $1 AND account_status = 'active'
             AND role IN ('super_admin', 'super_agent', 'operations', 'reviewer')`,
          [input.data.assignedTo],
        );
        if (!assignee.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: { code: "INVALID_ASSIGNEE", message: "Assign the request to an active operations or reviewer account." },
          });
        }
      }
      const result = await client.query(
        `UPDATE service_requests
         SET status = $1,
             internal_notes = COALESCE($2, internal_notes),
             rejection_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_reason END,
             assigned_to = CASE WHEN $4::boolean THEN $5::uuid ELSE assigned_to END,
             completion_evidence_ciphertext = CASE WHEN $1 = 'completed' THEN $6::bytea ELSE completion_evidence_ciphertext END,
             completion_evidence_iv = CASE WHEN $1 = 'completed' THEN $7::bytea ELSE completion_evidence_iv END,
             completion_evidence_auth_tag = CASE WHEN $1 = 'completed' THEN $8::bytea ELSE completion_evidence_auth_tag END,
             completion_evidence_recorded_at = CASE WHEN $1 = 'completed' THEN now() ELSE completion_evidence_recorded_at END,
             updated_at = now()
         WHERE id = $9 AND is_demo = $10
         RETURNING id, reference, status, updated_at AS "updatedAt"`,
        [input.data.status, input.data.internalNotes ?? null,
          input.data.rejectionReason ?? null, Object.hasOwn(input.data, "assignedTo"),
          input.data.assignedTo ?? null, encryptedCompletionNote?.ciphertext ?? null,
          encryptedCompletionNote?.iv ?? null, encryptedCompletionNote?.authTag ?? null,
          id.data, req.session.isDemo],
      );
      updated = result.rows[0];
      await writeAudit(client, req.session.userId, "request.status_changed", "service_request", id.data, {
        from: current.rows[0].status,
        to: input.data.status,
        completionNoteRecorded: input.data.status === "completed",
        assignedTo: Object.hasOwn(input.data, "assignedTo")
          ? input.data.assignedTo
          : current.rows[0].assigned_to,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.json({ request: updated });
  });

  app.get("/api/transactions", requireRole(...staffRoles), async (req, res) => {
    const page = parsePagination(req.query);
    const result = await pool.query(`
      SELECT t.id, t.reference, t.amount_due::text AS "amountDue",
             t.amount_paid::text AS "amountPaid",
             t.provider_cost::text AS "providerCost", t.service_fee::text AS "serviceFee",
             t.commission::text, (t.amount_paid - t.provider_cost - t.commission)::text AS "grossProfit",
             t.payment_status AS "paymentStatus", t.fulfilment_status AS "fulfilmentStatus",
             t.payment_reference AS "paymentReference", t.provider_reference AS "providerReference",
             t.created_at AS "createdAt", p.name AS "productName", p.category,
             u.email AS "customerEmail"
      FROM transactions t
      JOIN products p ON p.id = t.product_id AND p.is_demo = t.is_demo
      JOIN users u ON u.id = t.customer_id AND u.is_demo = t.is_demo
      WHERE t.is_demo = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.session.isDemo, page.limit, page.offset]);
    res.json({ items: result.rows, ...page });
  });

  app.get("/api/inventory", requireRole(...staffRoles), async (req, res) => {
    const [products, batches, totals] = await Promise.all([
      pool.query(`
        SELECT p.id, p.name, p.low_stock_threshold AS "lowStockThreshold",
               COUNT(i.id) FILTER (WHERE i.status = 'available' AND (i.expires_at IS NULL OR i.expires_at > now()))::int AS available,
               COUNT(i.id) FILTER (WHERE i.status = 'reserved')::int AS reserved,
               COUNT(i.id) FILTER (WHERE i.status = 'sold')::int AS sold,
               COUNT(i.id) FILTER (WHERE i.status = 'expired' OR (i.status = 'available' AND i.expires_at <= now()))::int AS expired
        FROM products p
        LEFT JOIN pin_inventory i ON i.product_id = p.id AND i.is_demo = $1
        WHERE p.category = 'education_pins' AND p.is_demo = $1
        GROUP BY p.id ORDER BY p.name
      `, [req.session.isDemo]),
      pool.query(`
        SELECT b.id, b.batch_reference AS "batchReference", b.supplier,
               b.imported_quantity AS "importedQuantity", b.acquisition_cost::text AS "acquisitionCost",
               b.created_at AS "createdAt", p.name AS "productName",
               COUNT(i.id) FILTER (WHERE i.status = 'available' AND (i.expires_at IS NULL OR i.expires_at > now()))::int AS remaining
        FROM pin_batches b
        JOIN products p ON p.id = b.product_id
        LEFT JOIN pin_inventory i ON i.batch_id = b.id AND i.is_demo = $1
        WHERE b.is_demo = $1
        GROUP BY b.id, p.name ORDER BY b.created_at DESC LIMIT 50
      `, [req.session.isDemo]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'available' AND (expires_at IS NULL OR expires_at > now()))::int AS available,
          COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved,
          COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
          COUNT(*) FILTER (WHERE status = 'expired' OR (status = 'available' AND expires_at <= now()))::int AS expired,
          COUNT(*) FILTER (WHERE status = 'revoked')::int AS revoked
        FROM pin_inventory WHERE is_demo = $1
      `, [req.session.isDemo]),
    ]);
    res.json({
      products: products.rows.map((product) => ({
        ...product,
        lowStock: product.available <= product.lowStockThreshold,
      })),
      batches: batches.rows,
      totals: totals.rows[0],
    });
  });

  app.post("/api/inventory/import", requireRole(...managerRoles), async (req, res) => {
    const input = inventoryInput.safeParse(req.body);
    if (!input.success) return validationError(res, input.error);

    let rows;
    try {
      rows = parse(input.data.csv, {
        columns: true,
        bom: true,
        trim: true,
        skip_empty_lines: true,
        max_record_size: 4096,
      });
    } catch {
      return res.status(400).json({ error: { code: "INVALID_CSV", message: "The CSV format is invalid. Check the header and row values." } });
    }
    if (rows.length < 1 || rows.length > 5000) {
      return res.status(400).json({ error: { code: "INVALID_INVENTORY_SIZE", message: "A batch must contain between 1 and 5,000 PINs." } });
    }
    if (!rows.every((row) => typeof row.pin === "string" && row.pin.length >= 4 && row.pin.length <= 256)) {
      return res.status(400).json({ error: { code: "INVALID_PIN_CSV", message: "CSV must contain a 'pin' column with values 4–256 characters long." } });
    }
    const expiresAt = rows.map((row) => {
      if (!row.expiresAt) return null;
      const date = new Date(row.expiresAt);
      return Number.isNaN(date.getTime()) ? false : date;
    });
    if (expiresAt.some((date) => date === false)) {
      return res.status(400).json({ error: { code: "INVALID_EXPIRY_DATE", message: "An expiry date in the CSV is invalid." } });
    }

    const client = await pool.connect();
    let imported = 0;
    let duplicates = 0;
    let batchId;
    try {
      await client.query("BEGIN");
      const product = await client.query(
        "SELECT id FROM products WHERE id = $1 AND category = 'education_pins' AND is_demo = $2 FOR SHARE",
        [input.data.productId, req.session.isDemo],
      );
      if (!product.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: { code: "PIN_PRODUCT_NOT_FOUND", message: "Select a configured education PIN product." } });
      }
      const batch = await client.query(
        `INSERT INTO pin_batches
          (product_id, supplier, batch_reference, acquisition_cost, imported_quantity, created_by, is_demo)
         VALUES ($1, $2, $3, $4, 0, $5, $6)
         RETURNING id`,
        [input.data.productId, input.data.supplier, input.data.batchReference,
          input.data.acquisitionCost, req.session.userId, req.session.isDemo],
      );
      batchId = batch.rows[0].id;

      for (const [index, row] of rows.entries()) {
        const pin = row.pin.trim();
        const encrypted = encryptPin(pin);
        const fingerprint = req.session.isDemo ? fingerprintDemoPin(pin) : fingerprintPin(pin);
        const inserted = await client.query(
          `INSERT INTO pin_inventory
             (batch_id, product_id, pin_ciphertext, pin_iv, pin_auth_tag, fingerprint, expires_at, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (fingerprint) DO NOTHING
           RETURNING id`,
          [batchId, input.data.productId, encrypted.ciphertext, encrypted.iv,
            encrypted.authTag, fingerprint, expiresAt[index], req.session.isDemo],
        );
        if (!inserted.rowCount) {
          duplicates += 1;
          continue;
        }
        imported += 1;
        await client.query(
          `INSERT INTO inventory_movements
             (pin_id, batch_id, product_id, movement_type, quantity, actor_id, is_demo)
           VALUES ($1, $2, $3, 'imported', 1, $4, $5)`,
          [inserted.rows[0].id, batchId, input.data.productId, req.session.userId, req.session.isDemo],
        );
      }
      await client.query("UPDATE pin_batches SET imported_quantity = $1 WHERE id = $2", [imported, batchId]);
      await writeAudit(client, req.session.userId, "inventory.imported", "pin_batch", batchId, {
        imported,
        duplicates,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        return res.status(409).json({ error: { code: "BATCH_REFERENCE_EXISTS", message: "That batch reference has already been used." } });
      }
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ batchId, imported, duplicates });
  });

  app.get("/api/activity", requireRole(...staffRoles), async (req, res) => {
    const page = parsePagination(req.query);
    const result = await pool.query(`
      SELECT a.id, a.action, a.entity_type AS "entityType", a.metadata,
             a.created_at AS "createdAt", u.first_name AS "actorFirstName",
             u.last_name AS "actorLastName"
      FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.is_demo = $1
      ORDER BY a.created_at DESC LIMIT $2 OFFSET $3
    `, [req.session.isDemo, page.limit, page.offset]);
    res.json({ items: result.rows.map((event) => ({
      ...event,
      metadata: redactSensitive(event.metadata),
    })), ...page });
  });

  for (const [path, filename] of publicFiles) {
    app.get(path, (_req, res) => res.sendFile(join(root, filename)));
  }
  app.get("/assets/sokotech-mark.jpg", (_req, res) => res.sendFile(join(root, "assets", "sokotech-mark.jpg")));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });
  app.use((_req, res) => {
    res.status(404).type("text").send("Page not found.");
  });
  app.use((error, req, res, _next) => {
    if (res.headersSent) return;
    const status = error.status === 400 ? 400
      : error.type === "entity.parse.failed" ? 400
      : error.type === "entity.too.large" ? 413
        : error.code === "23505" ? 409
          : error.code === "23503" ? 400
            : error.code === "ECONNREFUSED" || error.code === "57P01" ? 503
              : 500;
    if (status >= 500) {
      console.error(JSON.stringify({
        requestId: req.requestId,
        error: error.name,
        code: error.code,
      }));
    }
    const messages = {
      400: "The request could not be parsed.",
      409: "That record conflicts with an existing record.",
      413: "The request is too large.",
      503: "The service is temporarily unavailable.",
      500: "An unexpected error occurred.",
    };
    res.status(status).json({
      error: {
        code: status === 503 ? "SERVICE_UNAVAILABLE" : status === 409 ? "CONFLICT" : "REQUEST_FAILED",
        message: messages[status] ?? "The request could not be completed.",
      },
      requestId: req.requestId,
    });
  });

  return app;
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." }, requestId: req.requestId });
    }
    try {
      const result = await req.app.locals.pool.query(
        "SELECT role, account_status, is_demo FROM users WHERE id = $1",
        [req.session.userId],
      );
      const user = result.rows[0];
      if (!user || user.account_status !== "active") {
        await destroySession(req);
        return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." }, requestId: req.requestId });
      }
      req.session.role = user.role;
      req.session.isDemo = user.is_demo;
      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." }, requestId: req.requestId });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function parsePagination(query) {
  const parsed = z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(query);
  if (!parsed.success) throw Object.assign(new Error("Invalid pagination parameters."), { status: 400 });
  return { ...parsed.data, offset: (parsed.data.page - 1) * parsed.data.limit };
}

function validationError(res, error) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_FAILED",
      message: "Check the provided information and try again.",
      fields: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

function notFound(res, resource) {
  return res.status(404).json({
    error: { code: "NOT_FOUND", message: `${resource} not found.` },
  });
}

async function insertProduct(pool, data, isDemo) {
  const result = await pool.query(
    `INSERT INTO products
       (name, category, description, price, provider_cost, service_fee,
        commission_rate, provider_name, provider_enabled, fulfilment_method,
        low_stock_threshold, active, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, name, category, description, price::text,
       provider_cost::text AS "providerCost", service_fee::text AS "serviceFee",
       commission_rate::text AS "commissionRate", provider_name AS "providerName",
       provider_enabled AS "providerEnabled", fulfilment_method AS "fulfilmentMethod",
       low_stock_threshold AS "lowStockThreshold", active`,
    [data.name, data.category, data.description, data.price, data.providerCost,
      data.serviceFee, data.commissionRate, data.providerName ?? null,
      data.providerEnabled, data.fulfilmentMethod, data.lowStockThreshold, data.active, isDemo],
  );
  return result.rows[0];
}

async function writeAudit(client, actorId, action, entityType, entityId, metadata) {
  await client.query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, metadata, is_demo)
     VALUES ($1, $2, $3, $4, $5, (SELECT is_demo FROM users WHERE id = $1))`,
    [actorId, action, entityType, entityId, JSON.stringify(redactSensitive(metadata))],
  );
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((error) => error ? reject(error) : resolve());
  });
}
