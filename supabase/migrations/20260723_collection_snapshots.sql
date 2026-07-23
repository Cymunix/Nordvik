-- NORDVIK Dashboard: value/items history for sparklines + % deltas.
--
-- One row per user per day. The dashboard upserts "today" on load, so real
-- history accumulates over time. RLS keeps each user to their own rows; no
-- cross-user access, no fabricated numbers (day one simply has one point).

CREATE TABLE IF NOT EXISTS public.collection_snapshots (
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,
  total_value   numeric NOT NULL DEFAULT 0,
  total_items   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_collection_snapshots_user_date
  ON public.collection_snapshots (user_id, snapshot_date DESC);

ALTER TABLE public.collection_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='collection_snapshots' AND policyname='collection_snapshots_owner_select') THEN
    CREATE POLICY collection_snapshots_owner_select ON public.collection_snapshots
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='collection_snapshots' AND policyname='collection_snapshots_owner_insert') THEN
    CREATE POLICY collection_snapshots_owner_insert ON public.collection_snapshots
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='collection_snapshots' AND policyname='collection_snapshots_owner_update') THEN
    CREATE POLICY collection_snapshots_owner_update ON public.collection_snapshots
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
