-- SellerOS: migration inicial de referência para PostgreSQL 15+
-- Executar somente após revisão, ajuste às migrations do ORM e testes.
-- Requer pgcrypto para gen_random_uuid() em instalações mais antigas.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BRL',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','admin','operator','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE integration_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL CHECK (provider IN ('mercado_livre','shopee','tiktok_shop')),
  external_seller_id text NOT NULL,
  display_name text,
  site_id text,
  connection_status text NOT NULL DEFAULT 'connected'
    CHECK (connection_status IN ('connected','expired','needs_reauth','error','disconnected')),
  last_successful_sync_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_seller_id)
);
CREATE INDEX integration_accounts_org_idx ON integration_accounts(organization_id);

CREATE TABLE integration_credentials (
  integration_account_id uuid PRIMARY KEY REFERENCES integration_accounts(id) ON DELETE CASCADE,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  access_expires_at timestamptz,
  rotated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Criptografar no service antes de persistir; encryption key somente em secrets manager.

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  current_unit_cost numeric(14,2) CHECK (current_unit_cost >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);
CREATE INDEX products_org_idx ON products(organization_id);

CREATE TABLE product_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  effective_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','purchase','import')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, effective_at)
);
CREATE INDEX product_cost_lookup_idx ON product_cost_history(product_id, effective_at DESC);

CREATE TABLE marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  integration_account_id uuid NOT NULL REFERENCES integration_accounts(id),
  product_id uuid REFERENCES products(id),
  external_item_id text NOT NULL,
  external_variant_id text,
  external_sku text,
  title text NOT NULL,
  raw_status text,
  current_price numeric(14,2) CHECK (current_price >= 0),
  external_available_quantity integer,
  external_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marketplace_listings_identity_uniq
  ON marketplace_listings(integration_account_id, external_item_id, COALESCE(external_variant_id, ''));
CREATE INDEX marketplace_listings_unmapped_idx
  ON marketplace_listings(organization_id) WHERE product_id IS NULL;

CREATE TABLE sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  integration_account_id uuid REFERENCES integration_accounts(id),
  source text NOT NULL CHECK (source IN ('manual','mercado_livre','shopee','tiktok_shop')),
  external_order_id text,
  raw_status text,
  normalized_status text NOT NULL DEFAULT 'unknown'
    CHECK (normalized_status IN ('unknown','pending','paid','shipped','delivered','cancelled','refunded','partially_refunded')),
  gross_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  refunded_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  currency_code char(3) NOT NULL DEFAULT 'BRL',
  external_created_at timestamptz,
  external_paid_at timestamptz,
  external_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source = 'manual' AND integration_account_id IS NULL AND external_order_id IS NULL)
    OR (source <> 'manual' AND integration_account_id IS NOT NULL AND external_order_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX sales_orders_external_identity_uniq
  ON sales_orders(integration_account_id, external_order_id) WHERE integration_account_id IS NOT NULL;
CREATE INDEX sales_orders_org_date_idx ON sales_orders(organization_id, external_created_at DESC);
CREATE INDEX sales_orders_org_status_idx ON sales_orders(organization_id, normalized_status);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
  product_id uuid REFERENCES products(id),
  listing_id uuid REFERENCES marketplace_listings(id),
  external_line_key text NOT NULL,
  external_item_id text,
  external_variant_id text,
  seller_sku_snapshot text,
  title_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost_snapshot numeric(14,2) CHECK (unit_cost_snapshot >= 0),
  cost_source text CHECK (cost_source IN ('product_cost_at_sale','manual_override','imported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, external_line_key)
);
CREATE INDEX order_items_product_idx ON order_items(product_id);

CREATE TABLE order_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
  category text NOT NULL CHECK (category IN ('marketplace_fee','seller_shipping','tax','advertising','packaging','other')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  basis text NOT NULL DEFAULT 'estimated' CHECK (basis IN ('estimated','confirmed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','mercado_livre','shopee','tiktok_shop')),
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_expenses_order_idx ON order_expenses(sales_order_id);
CREATE UNIQUE INDEX order_expenses_ext_ref_uniq ON order_expenses(sales_order_id, source, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  product_id uuid NOT NULL REFERENCES products(id),
  movement_type text NOT NULL
    CHECK (movement_type IN ('opening','purchase','sale','return','loss','adjustment','reversal','other')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  unit_cost_snapshot numeric(14,2) CHECK (unit_cost_snapshot >= 0),
  idempotency_key text,
  reference_type text,
  reference_id text,
  notes text,
  created_by uuid REFERENCES app_users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (movement_type <> 'loss' OR quantity_delta < 0)
);
CREATE UNIQUE INDEX inventory_movements_idempotency_uniq
  ON inventory_movements(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX inventory_stock_idx ON inventory_movements(organization_id, warehouse_id, product_id);
CREATE INDEX inventory_movement_time_idx ON inventory_movements(organization_id, occurred_at DESC);

CREATE TABLE inventory_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  inventory_movement_id uuid NOT NULL UNIQUE REFERENCES inventory_movements(id),
  reason text NOT NULL CHECK (reason IN ('damaged','lost','expired','inventory_discrepancy','other')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost_snapshot numeric(14,2) CHECK (unit_cost_snapshot >= 0),
  description text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Criar loss + movement no MESMO COMMIT e validar product/warehouse/tenant/quantidade no service.

CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_account_id uuid NOT NULL REFERENCES integration_accounts(id),
  kind text NOT NULL CHECK (kind IN ('initial','incremental','manual','webhook_recovery')),
  resource text NOT NULL CHECK (resource IN ('orders','listings','other')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  checkpoint jsonb,
  rows_upserted integer NOT NULL DEFAULT 0 CHECK (rows_upserted >= 0),
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_runs_account_idx ON sync_runs(integration_account_id, created_at DESC);

CREATE TABLE integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_account_id uuid NOT NULL REFERENCES integration_accounts(id),
  event_key text NOT NULL,
  topic text NOT NULL,
  resource_path text,
  external_sent_at timestamptz,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed')),
  payload_minimal jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (integration_account_id, event_key)
);
CREATE INDEX integration_events_pending_idx ON integration_events(integration_account_id, status, received_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details_minimal jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_time_idx ON audit_logs(organization_id, created_at DESC);

-- Saldo interno por produto/deposito; nunca confundir com estoque da listagem externa.
CREATE VIEW inventory_balances AS
SELECT organization_id, warehouse_id, product_id, SUM(quantity_delta)::bigint AS quantity_on_hand
FROM inventory_movements
GROUP BY organization_id, warehouse_id, product_id;

-- NOTAS DE PRODUÇÃO:
-- 1. Proteger índices/queries cross-tenant com service validation e, idealmente, composite FKs/RLS.
-- 2. Movement ledger é append-only na camada de aplicação; bloquear UPDATE/DELETE por permissões de banco no endurecimento.
-- 3. Persistência de custo histórico precisa ser compatível com fechamento/apuração em períodos.
-- 4. Raw webhook payload deve ser mínimo e ter TTL/política de descarte por privacidade.
-- 5. Essa migration SQL e um futuro Prisma schema NÃO devem correr paralelamente sem escolher uma única fonte de migrations.
