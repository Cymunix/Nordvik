-- NORDVIK item data-model alignment (per the category field spec).
--
-- 1) Item Type becomes a structured cascade level: its own `item_types` table
--    scoped under Subcategory (categories → subcategories → franchises →
--    subsets → properties → item_types), mirroring the other levels.
--    Previously Item Type rode on items.brand_id, which was confusingly named
--    and not scoped/filterable like the rest of the cascade.
-- 2) Portrays becomes a first-class LOOKUP facet (`portrays` + m2m
--    `item_portrays`): the same real person recurs across many items
--    (e.g. Mark Hamill on dozens), so this supports "everything that portrays X"
--    across the whole catalogue. Many-to-many because one item can portray
--    several people.
-- 3) Subject becomes a plain indexed TEXT column on items (subjects are mostly
--    unique per item — ATTE, T-Rex, Feraligatr — so a lookup table is overhead).
--    The existing subjects table/FK is left intact here; the cutover +
--    backfill lives in the companion migration so it can be reviewed separately.
-- 4) Availability added as a typed column. Pieces (items.piece_count) and
--    Barcodes (items.upc) ALREADY EXIST — not duplicated.
-- 5) Includes / Included In are NOT added: 20260718_catalog_item_relationships
--    already covers them (parent/child + relationship_type + quantity, with a
--    uniqueness constraint and both-direction indexes). No duplication.
--
-- Idempotent; safe to re-run.

-- ── 1) Item Types (cascade level, scoped under Subcategory) ──────────────────
CREATE TABLE IF NOT EXISTS public.item_types (
  item_type_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id uuid REFERENCES public.subcategories(subcategory_id) ON DELETE CASCADE,
  name           text NOT NULL,
  sort_order     integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One name per subcategory (case-insensitive), matching the other cascade levels.
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_types_subcat_name
  ON public.item_types (subcategory_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_item_types_subcategory ON public.item_types (subcategory_id);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS item_type_id uuid REFERENCES public.item_types(item_type_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_items_item_type_id ON public.items (item_type_id);

-- ── 2) Portrays (lookup + m2m) ───────────────────────────────────────────────
-- A real person/character depicted by the item. Lookup so it is queryable
-- across the catalogue ("every item portraying Mark Hamill").
CREATE TABLE IF NOT EXISTS public.portrays (
  portray_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  kind       text,          -- optional: 'actor' | 'character' | 'athlete' | …
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_portrays_name_lower ON public.portrays (lower(name));

CREATE TABLE IF NOT EXISTS public.item_portrays (
  item_id    uuid NOT NULL REFERENCES public.items(item_id) ON DELETE CASCADE,
  portray_id uuid NOT NULL REFERENCES public.portrays(portray_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, portray_id)
);
CREATE INDEX IF NOT EXISTS idx_item_portrays_item    ON public.item_portrays (item_id);
CREATE INDEX IF NOT EXISTS idx_item_portrays_portray ON public.item_portrays (portray_id);

-- ── 3) Subject as an indexed text column (cutover in the companion migration) ─
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS subject text;
CREATE INDEX IF NOT EXISTS idx_items_subject_lower ON public.items (lower(subject));

-- ── 4) Availability (typed column; Pieces/Barcodes already exist) ────────────
-- Free text rather than an enum so new states don't need a schema change; the
-- app supplies the vocabulary (Available / Retired / Preorder / Exclusive …).
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS availability text;
CREATE INDEX IF NOT EXISTS idx_items_availability ON public.items (availability);

-- ── RLS: public read, platform-admin write (matches every other catalogue table) ─
ALTER TABLE public.item_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portrays      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_portrays ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['item_types','portrays','item_portrays'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t||'_read', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_write') THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
      $f$, t||'_write', t);
    END IF;
  END LOOP;
END $$;
