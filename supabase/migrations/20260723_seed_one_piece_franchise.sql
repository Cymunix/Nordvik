-- One Piece as a FRANCHISE (the classification for Trading Cards going forward),
-- linked to its subcategory, with the card-game subset. Idempotent.

-- 1. The One Piece franchise.
INSERT INTO public.franchises (name)
SELECT 'One Piece'
WHERE NOT EXISTS (SELECT 1 FROM public.franchises WHERE name = 'One Piece');

-- 2. Link the franchise to the One Piece subcategory (under Trading Cards) so
--    the app's theme/franchise cascade can find it.
INSERT INTO public.franchise_subcategory (franchise_id, subcategory_id)
SELECT f.franchise_id, s.subcategory_id
FROM public.franchises f
JOIN public.subcategories s ON s.name = 'One Piece'
JOIN public.categories c ON c.category_id = s.category_id AND c.name = 'Trading Cards'
WHERE f.name = 'One Piece'
  AND NOT EXISTS (
    SELECT 1 FROM public.franchise_subcategory fs
    WHERE fs.franchise_id = f.franchise_id AND fs.subcategory_id = s.subcategory_id
  );

-- 3. Subfranchise "The One Piece Card Game" as a subset under the franchise.
INSERT INTO public.subsets (franchise_id, name)
SELECT f.franchise_id, 'The One Piece Card Game'
FROM public.franchises f
WHERE f.name = 'One Piece'
  AND NOT EXISTS (
    SELECT 1 FROM public.subsets ss
    WHERE ss.franchise_id = f.franchise_id AND ss.name = 'The One Piece Card Game'
  );
