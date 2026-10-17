ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE pin_batches
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE pin_inventory
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_demo_created_idx ON products (is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_demo_created_idx ON service_requests (is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_demo_created_idx ON transactions (is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS pin_inventory_demo_product_status_idx ON pin_inventory (is_demo, product_id, status);
CREATE INDEX IF NOT EXISTS pin_batches_demo_created_idx ON pin_batches (is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_demo_created_idx ON inventory_movements (is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_demo_created_idx ON audit_events (is_demo, created_at DESC);
