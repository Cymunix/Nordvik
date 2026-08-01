-- Trading Cards: format legality.
--
-- Legality is a MULTI-VALUE fact: a card is legal in zero or more formats.
-- We store ONLY the formats a card IS legal in — absence means "not legal" by
-- convention. That's why there is no `status` column: a row's existence IS the
-- statement, so there's no way to represent a contradictory state.
--
-- No `game` column by design: for Trading Cards the Subcategory IS the game
-- (Magic: The Gathering, One Piece, Star Wars, Marvel, TMNT), so
-- items.subcategory_id already identifies the TCG and a game column here would
-- be duplicated state that can drift out of sync.
--
-- ⚠ HAZARD: format names collide across games — Pokémon "Standard" is NOT
-- Magic "Standard". Any query MUST scope by game via the join to items, e.g.
--
--   select i.* from items i
--   join card_format_legality l on l.item_id = i.item_id
--   where l.format = 'Standard' and i.subcategory_id = <the game>;
--
-- Filtering on `format` alone will mix games together.
--
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS public.card_format_legality (
  item_id    uuid NOT NULL REFERENCES public.items(item_id) ON DELETE CASCADE,
  format     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_format_legality_unique UNIQUE (item_id, format),
  CONSTRAINT card_format_legality_format_not_blank CHECK (btrim(format) <> '')
);

-- Lookup by card (detail view: "which formats is this legal in?")
CREATE INDEX IF NOT EXISTS idx_cfl_item   ON public.card_format_legality (item_id);
-- Lookup by format (catalogue filter: "every card legal in X") — always joined
-- to items and scoped by subcategory, per the hazard note above.
CREATE INDEX IF NOT EXISTS idx_cfl_format ON public.card_format_legality (format);

-- RLS: public read, platform-admin write (same as every other catalogue table).
ALTER TABLE public.card_format_legality ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='card_format_legality' AND policyname='card_format_legality_read') THEN
    CREATE POLICY card_format_legality_read ON public.card_format_legality
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='card_format_legality' AND policyname='card_format_legality_write') THEN
    CREATE POLICY card_format_legality_write ON public.card_format_legality
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'));
  END IF;
END $$;

-- Backfill from the Pokémon importer's dynamic_fields.legalities payload
-- (TCGdex supplies {"standard": true, "expanded": false}). Only `true` entries
-- become rows, matching the "absence = not legal" convention.
INSERT INTO public.card_format_legality (item_id, format)
SELECT i.item_id, initcap(kv.key)
FROM public.items i
CROSS JOIN LATERAL jsonb_each(i.dynamic_fields -> 'legalities') AS kv(key, value)
WHERE i.dynamic_fields ? 'legalities'
  AND jsonb_typeof(i.dynamic_fields -> 'legalities') = 'object'
  AND kv.value = 'true'::jsonb
ON CONFLICT (item_id, format) DO NOTHING;
