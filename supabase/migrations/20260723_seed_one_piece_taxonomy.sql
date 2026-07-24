-- Seed the stable One Piece Card Game taxonomy for NORDVIK.
-- Idempotent (safe to re-run). Per-card values (subject, property/set, card
-- number, description, colour/cost/power/etc.) come from the import, NOT here.
-- Columns verified against the live schema.

-- 1. Subcategory "One Piece" under the Trading Cards category.
--    (For Trading Cards, Subcategory IS the franchise — see project rule.)
INSERT INTO public.subcategories (category_id, name)
SELECT c.category_id, 'One Piece'
FROM public.categories c
WHERE c.name = 'Trading Cards'
  AND NOT EXISTS (
    SELECT 1 FROM public.subcategories s
    WHERE s.category_id = c.category_id AND s.name = 'One Piece'
  );

-- 2. Card types (shared table; add only the ones missing).
INSERT INTO public.card_types (name)
SELECT v.name
FROM (VALUES ('Leader'), ('Character'), ('Event'), ('Stage'), ('DON!!')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.card_types ct WHERE ct.name = v.name);

-- 3. Rarities (shared table; add missing, keep a sensible sort order).
INSERT INTO public.rarities (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES
  ('C', 10), ('UC', 20), ('R', 30), ('SR', 40), ('SEC', 50), ('L', 60), ('P', 70)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.rarities r WHERE r.name = v.name);

-- 4. Item Types (brands). For One Piece the item type mirrors the card type.
INSERT INTO public.brands (name)
SELECT v.name
FROM (VALUES ('Leader'), ('Character'), ('Event'), ('Stage'), ('DON!!')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.name = v.name);

-- NOTE — Subfranchise "The One Piece Card Game" is intentionally NOT seeded here.
-- public.subsets.franchise_id is NOT NULL -> public.franchises, which conflicts
-- with the "Trading Cards have no separate franchise" rule. Decide how to resolve
-- (see the accompanying message) before seeding the subset.
