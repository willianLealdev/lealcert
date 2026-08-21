-- Indicações de contadores: código público, vínculo permanente e livro-caixa de créditos.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique
  ON users (referral_code);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS referral_credit_used NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS referral_credit_commissions (
  id SERIAL PRIMARY KEY,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id),
  referred_user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_credit_commissions_order_unique
  ON referral_credit_commissions (order_id);

CREATE TABLE IF NOT EXISTS referral_credit_usages (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_credit_usages_order_unique
  ON referral_credit_usages (order_id);