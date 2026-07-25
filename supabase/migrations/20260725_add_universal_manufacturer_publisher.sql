-- NORDVIK: universal Manufacturer & Publisher fields across every catalogue item.
--
-- Manufacturer = the company that produced the physical item (LEGO, Bandai, Funko).
-- Publisher    = the company that published/released/distributed it (Topps, Panini,
--                Wizards of the Coast, Nintendo).
-- Both are first-class, category-agnostic, nullable relations — mirroring the
-- existing single-FK facet pattern (items.series_id → series, etc.). Neither is
-- scoped to a subcategory/franchise: they are universal.
--
-- Safe to run multiple times (idempotent).

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manufacturers (
  manufacturer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  website         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publishers (
  publisher_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  website      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness so resolve-or-create never duplicates "Topps"/"topps".
CREATE UNIQUE INDEX IF NOT EXISTS uq_manufacturers_name_lower ON public.manufacturers (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_publishers_name_lower    ON public.publishers    (lower(name));

-- ── items columns (nullable — existing rows keep working) ────────────────────
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS manufacturer_id uuid REFERENCES public.manufacturers(manufacturer_id) ON DELETE SET NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS publisher_id    uuid REFERENCES public.publishers(publisher_id)       ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_manufacturer_id ON public.items (manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_items_publisher_id    ON public.items (publisher_id);

-- ── RLS: readable by everyone, writable by platform admins (same as the importer's
--        access level; mirrors the catalog_brands policy pattern) ──────────────
ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishers    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['manufacturers','publishers'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t||'_read', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_write_platform_admin') THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
      $f$, t||'_write_platform_admin', t);
    END IF;
  END LOOP;
END $$;

-- ── Backfill Publisher from the old per-category dynamic field ────────────────
-- Comics/Music/Video Games previously stored a "publisher" value in
-- items.dynamic_fields. Promote each distinct value into the publishers table and
-- link the item, then drop the now-redundant dynamic key.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT trim(dynamic_fields->>'publisher') AS pub
    FROM public.items
    WHERE dynamic_fields ? 'publisher' AND trim(coalesce(dynamic_fields->>'publisher','')) <> ''
  LOOP
    INSERT INTO public.publishers (name) VALUES (r.pub)
    ON CONFLICT (lower(name)) DO NOTHING;
  END LOOP;

  UPDATE public.items i
  SET publisher_id = p.publisher_id
  FROM public.publishers p
  WHERE i.publisher_id IS NULL
    AND i.dynamic_fields ? 'publisher'
    AND lower(trim(i.dynamic_fields->>'publisher')) = lower(p.name);

  -- Remove the migrated key so it is no longer shown as a dynamic field.
  UPDATE public.items
  SET dynamic_fields = dynamic_fields - 'publisher'
  WHERE dynamic_fields ? 'publisher';
END $$;
