-- create_tables.sql

-- Tenants table: stores tenant details and Shopify credentials.
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  shopify_store_url TEXT NOT NULL,
  shopify_api_password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SMTP Settings table: stores each tenant's SMTP credentials.
CREATE TABLE IF NOT EXISTS smtp_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  smtp_user TEXT NOT NULL,
  pass TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Templates table: stores each tenant's email template (both design JSON and HTML).
CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  design TEXT,
  html TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stats table: tracks emails sent and orders served per day per tenant.
CREATE TABLE IF NOT EXISTS stats (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  date DATE NOT NULL,
  emails_sent INTEGER DEFAULT 0,
  orders_served INTEGER DEFAULT 0,
  UNIQUE (tenant_id, date)
);

-- Orders table: stores order details.
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  order_number TEXT NOT NULL,
  ordered_date TIMESTAMP NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  shopify_customer_url TEXT,
  latest_dispatched_email TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
