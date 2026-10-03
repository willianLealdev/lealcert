ALTER TABLE settings ADD COLUMN IF NOT EXISTS leal_plus_price text NOT NULL DEFAULT '19.90';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS leal_plus_price text;
-- Historical orders intentionally retain NULL: their original price cannot
-- safely be reconstructed from the total (coupons and older prices existed).