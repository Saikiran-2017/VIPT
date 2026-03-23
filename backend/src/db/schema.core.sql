-- VIPT 3.0 core schema (plain PostgreSQL, no TimescaleDB).
-- Used when `timescaledb` extension is unavailable. Skips: hypertable, compression, price_daily CAgg.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'vector extension skipped: %', SQLERRM;
END;
$$;

-- ─── Products ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  universal_product_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(1024) NOT NULL,
  brand VARCHAR(255),
  model_number VARCHAR(255),
  sku VARCHAR(255),
  category VARCHAR(255),
  image_url TEXT,
  description TEXT,
  name_embedding TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_upid ON products(universal_product_id);
CREATE INDEX IF NOT EXISTS idx_products_model ON products(model_number);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_tsv ON products USING gin(name_embedding);

-- ─── Price history (standard table) ───────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  discount NUMERIC(5,2),
  in_stock BOOLEAN NOT NULL DEFAULT true,
  quality VARCHAR(32) NOT NULL DEFAULT 'aggregated',
  PRIMARY KEY (id, recorded_at)
);

ALTER TABLE price_history ADD COLUMN IF NOT EXISTS quality VARCHAR(32) NOT NULL DEFAULT 'aggregated';

CREATE INDEX IF NOT EXISTS idx_history_product ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_history_platform ON price_history(platform);
CREATE INDEX IF NOT EXISTS idx_history_recorded ON price_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_product_platform ON price_history(product_id, platform, recorded_at DESC);

-- ─── Prediction outcomes & model performance ────────────────────
CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  prediction_id UUID,
  predicted_price NUMERIC(12,2),
  model_weights_used JSONB,
  outcome_metadata JSONB,
  actual_price_amount NUMERIC(12,2),
  actual_price_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  was_accurate BOOLEAN,
  error_margin NUMERIC(12,6),
  mape NUMERIC(12,6),
  direction_correct BOOLEAN,
  check_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_product ON prediction_outcomes(product_id);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_evaluated ON prediction_outcomes(evaluated_at DESC);

CREATE TABLE IF NOT EXISTS model_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_name VARCHAR(100) NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  metric_value NUMERIC(14,6) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (model_name, metric_name, window_start)
);

CREATE INDEX IF NOT EXISTS idx_model_performance_model ON model_performance(model_name);

-- ─── Existing app tables (compatibility) ──────────────────────────
CREATE TABLE IF NOT EXISTS platform_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  platform_product_id VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  current_price NUMERIC(12,2) NOT NULL,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  total_effective_price NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  discount_percent NUMERIC(5,2),
  delivery_estimate VARCHAR(100),
  in_stock BOOLEAN DEFAULT true,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_product_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_product ON platform_listings(product_id);
CREATE INDEX IF NOT EXISTS idx_listings_platform ON platform_listings(platform);
CREATE INDEX IF NOT EXISTS idx_listings_price ON platform_listings(total_effective_price);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  tier VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_tracked_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tracked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  target_price NUMERIC(12,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  triggered_at TIMESTAMPTZ,
  UNIQUE(user_id, product_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_product ON alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS retail_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(50),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  region VARCHAR(50) DEFAULT 'global',
  expected_discount_min NUMERIC(5,2),
  expected_discount_max NUMERIC(5,2),
  categories TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, platform, start_date)
);

CREATE INDEX IF NOT EXISTS idx_events_dates ON retail_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_active ON retail_events(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  model_used VARCHAR(50) NOT NULL,
  expected_price_low NUMERIC(12,2),
  expected_price_high NUMERIC(12,2),
  drop_probability NUMERIC(5,4),
  suggested_wait_days INTEGER,
  confidence_score NUMERIC(5,4),
  factors JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_predictions_product ON predictions(product_id);
CREATE INDEX IF NOT EXISTS idx_predictions_generated ON predictions(generated_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
    CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
