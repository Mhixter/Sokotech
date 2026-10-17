CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('super_admin', 'super_agent', 'finance', 'operations', 'reviewer', 'sub_agent', 'customer')),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL
    CHECK (category IN ('nin_bvn', 'cac', 'airtime', 'mobile_data', 'vpn', 'education_pins', 'validation', 'ipe', 'personalisation')),
  description text NOT NULL DEFAULT '',
  price numeric(14, 2) NOT NULL CHECK (price >= 0),
  provider_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (provider_cost >= 0),
  service_fee numeric(14, 2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  commission_rate numeric(7, 4) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  provider_name text,
  provider_enabled boolean NOT NULL DEFAULT false,
  fulfilment_method text NOT NULL DEFAULT 'manual'
    CHECK (fulfilment_method IN ('manual', 'provider', 'inventory')),
  low_stock_threshold integer NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_active_idx ON products (category, active);

CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES products(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'awaiting_payment', 'paid', 'pending_review', 'processing', 'awaiting_customer_information', 'completed', 'rejected', 'failed', 'refunded')),
  request_data_ciphertext bytea NOT NULL,
  request_data_iv bytea NOT NULL,
  request_data_auth_tag bytea NOT NULL,
  consent_version text NOT NULL,
  consent_purpose text NOT NULL,
  consent_recorded_at timestamptz NOT NULL,
  internal_notes text NOT NULL DEFAULT '',
  completion_evidence_ciphertext bytea,
  completion_evidence_iv bytea,
  completion_evidence_auth_tag bytea,
  completion_evidence_recorded_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_requests_status_created_idx ON service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_customer_created_idx ON service_requests (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  idempotency_key text UNIQUE,
  request_id uuid REFERENCES service_requests(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  amount_due numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  amount_paid numeric(14, 2) NOT NULL CHECK (amount_paid >= 0),
  provider_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (provider_cost >= 0),
  service_fee numeric(14, 2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  commission numeric(14, 2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  payment_reference text UNIQUE,
  provider_reference text,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'confirmed', 'failed', 'refunded', 'reversed')),
  fulfilment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfilment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_created_idx ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_customer_created_idx ON transactions (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pin_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  supplier text NOT NULL,
  batch_reference text NOT NULL UNIQUE,
  acquisition_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (acquisition_cost >= 0),
  imported_quantity integer NOT NULL DEFAULT 0 CHECK (imported_quantity >= 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pin_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES pin_batches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  pin_ciphertext bytea NOT NULL,
  pin_iv bytea NOT NULL,
  pin_auth_tag bytea NOT NULL,
  fingerprint bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold', 'expired', 'revoked')),
  expires_at timestamptz,
  allocated_to uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pin_inventory_product_status_idx ON pin_inventory (product_id, status);
CREATE INDEX IF NOT EXISTS pin_inventory_batch_idx ON pin_inventory (batch_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id uuid REFERENCES pin_inventory(id),
  batch_id uuid NOT NULL REFERENCES pin_batches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  movement_type text NOT NULL
    CHECK (movement_type IN ('imported', 'reserved', 'sold', 'expired', 'revoked', 'reconciled')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  actor_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_created_idx ON inventory_movements (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
