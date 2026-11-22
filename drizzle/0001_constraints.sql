-- Constraints and security that Drizzle's schema DSL cannot express.

-- 1. Prevent double-booking a gardener at the database level.
--    Two active bookings for the same gardener may never overlap in time.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_gardener_overlap"
  EXCLUDE USING gist (
    "gardener_id" WITH =,
    tstzrange("scheduled_start", "scheduled_end", '[)') WITH &&
  )
  WHERE ("gardener_id" IS NOT NULL AND "status" IN ('assigned','accepted','in_progress','awaiting_confirmation'));
--> statement-breakpoint

-- 2. Only one default variant per product, one default warehouse.
CREATE UNIQUE INDEX "variants_one_default" ON "product_variants" ("product_id") WHERE "is_default";
--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_one_default" ON "warehouses" ("is_default") WHERE "is_default";
--> statement-breakpoint

-- 3. Cart must belong to a user or a guest token.
ALTER TABLE "carts" ADD CONSTRAINT "carts_owner" CHECK (num_nonnulls("user_id", "guest_token") >= 1);
--> statement-breakpoint

-- 4. Row Level Security.
--    The application connects with the database owner role and enforces authorization
--    in server code. When hosted on Supabase, the auto-generated public Data API
--    (anon / authenticated roles) must never expose these tables, so RLS is enabled
--    on every table with no permissive policies: direct client access is denied.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
