-- NORDVIK: the app writes per-game attributes (One Piece card colour, cost,
-- power, life, etc.) into items.dynamic_fields. The 20260526 migration added
-- that column to catalog_items, but the live catalogue table is `items` — so
-- the column was missing here and every insert failed with
-- "Could not find the 'dynamic_fields' column of 'items' in the schema cache".
-- Safe to run multiple times.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS dynamic_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Tell PostgREST (Supabase's API layer) to refresh its schema cache so the new
-- column is immediately visible to the client without waiting for auto-reload.
NOTIFY pgrst, 'reload schema';
