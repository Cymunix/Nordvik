-- Security fix: lock down catalogue write access.
--
-- Two problems found in the pre-launch RLS audit:
--  (1) UNAUTHENTICATED writes: item_images / item_teams / franchise_subcategory
--      had `TO public ... true` INSERT/DELETE policies, so ANYONE (even signed-out)
--      could inject or delete rows — most dangerously arbitrary catalogue image
--      URLs shown to every user, and deletion of all catalogue images.
--  (2) ANY-authenticated writes: core catalogue tables (items, categories,
--      franchises, ...) allowed write to any logged-in user (auth.uid() IS NOT
--      NULL), so a single tester could edit/delete the shared catalogue for
--      everyone.
--
-- Fix: catalogue is public-READ, platform-admin-WRITE (the level the bulk
-- importer / admin editor already run at). Idempotent.

-- Reusable platform-admin predicate is inlined per policy (RLS can't call a
-- parameterised helper cleanly); keep it identical everywhere.

-- ── (1) Remove unauthenticated write access on join/link tables ───────────────
-- item_images already has item_images_write (admin) + item_images_read (public).
DROP POLICY IF EXISTS allow_insert_item_images ON public.item_images;
DROP POLICY IF EXISTS allow_delete_item_images ON public.item_images;
DROP POLICY IF EXISTS allow_select_item_images ON public.item_images;

DROP POLICY IF EXISTS allow_insert_item_teams ON public.item_teams;
DROP POLICY IF EXISTS allow_delete_item_teams ON public.item_teams;
DROP POLICY IF EXISTS allow_select_item_teams ON public.item_teams;
CREATE POLICY item_teams_read ON public.item_teams
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY item_teams_write ON public.item_teams
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'));

DROP POLICY IF EXISTS allow_insert_franchise_subcategory ON public.franchise_subcategory;
DROP POLICY IF EXISTS allow_delete_franchise_subcategory ON public.franchise_subcategory;
DROP POLICY IF EXISTS allow_select_franchise_subcategory ON public.franchise_subcategory;
CREATE POLICY franchise_subcategory_read ON public.franchise_subcategory
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY franchise_subcategory_write ON public.franchise_subcategory
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'));

-- brand_franchise write was `TO public USING auth.role()='authenticated'`.
DROP POLICY IF EXISTS brand_franchise_write ON public.brand_franchise;
CREATE POLICY brand_franchise_write ON public.brand_franchise
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'));

-- ── (2) Restrict core catalogue write to platform admins (was any-authenticated) ─
DO $$
DECLARE t text;
DECLARE tabs text[] := ARRAY[
  'brands','card_types','categories','collectible_sets','franchises','items',
  'print_types','subcategories','subcollectible_sets','subjects','teams'
];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.subscription_tier::text = 'platform_admin'))
    $f$, t || '_write', t);
  END LOOP;
END $$;
