-- PayPal subscription system

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paypal_subscription_id TEXT UNIQUE,
  plan_key TEXT NOT NULL,
  subscriber_role TEXT NOT NULL CHECK (subscriber_role IN ('supporter', 'supporter_plus')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'suspended')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  creator_code TEXT,
  paypal_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_paypal_subscription_id_idx ON subscriptions(paypal_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_active_role_idx ON subscriptions(subscriber_role) WHERE status = 'active';

-- User balances (in cents, USD)
CREATE TABLE IF NOT EXISTS user_balances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Balance ledger for audit trail
CREATE TABLE IF NOT EXISTS balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS balance_ledger_user_id_idx ON balance_ledger(user_id);

-- Creator codes (discount codes for checkout)
CREATE TABLE IF NOT EXISTS creator_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_username TEXT,
  discount_percent INTEGER NOT NULL DEFAULT 10 CHECK (discount_percent BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Achievement credits (prevent double-crediting the same achievement)
CREATE TABLE IF NOT EXISTS achievement_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  credited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS achievement_credits_user_id_idx ON achievement_credits(user_id);

-- PayPal product/plan id cache (avoid recreating plans on every cold start)
CREATE TABLE IF NOT EXISTS paypal_plan_cache (
  plan_key TEXT PRIMARY KEY,
  paypal_product_id TEXT NOT NULL,
  paypal_plan_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: only service role can access these tables (all auth is done server-side)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE paypal_plan_cache ENABLE ROW LEVEL SECURITY;
