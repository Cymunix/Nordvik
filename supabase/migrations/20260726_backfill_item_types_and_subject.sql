-- Companion BACKFILL for 20260726_item_types_portrays_and_item_fields.sql.
-- Kept separate because it moves existing data (vs. pure structure). Run it
-- AFTER the structural migration. Idempotent; re-running is a no-op.
--
-- NOTE: this migration is ADDITIVE ONLY. It populates the new columns/tables
-- and deliberately does NOT drop items.brand_id or items.subject_id, so the
-- running app keeps working while the UI is migrated. Dropping the old columns
-- is a separate, later step once nothing reads them.

-- ── 1) Item Types: promote the distinct brand-per-subcategory pairs that were
--       being used as Item Type into the new item_types table, then link items.
INSERT INTO public.item_types (subcategory_id, name)
SELECT DISTINCT i.subcategory_id, b.name
FROM public.items i
JOIN public.brands b ON b.brand_id = i.brand_id
WHERE i.brand_id IS NOT NULL
  AND i.subcategory_id IS NOT NULL
  AND btrim(coalesce(b.name, '')) <> ''
ON CONFLICT DO NOTHING;

UPDATE public.items i
SET item_type_id = t.item_type_id
FROM public.brands b, public.item_types t
WHERE i.brand_id = b.brand_id
  AND t.subcategory_id = i.subcategory_id
  AND lower(t.name) = lower(b.name)
  AND i.item_type_id IS NULL;

-- ── 2) Subject: copy the linked subject's name into the new text column. ─────
UPDATE public.items i
SET subject = s.subject_name
FROM public.subjects s
WHERE i.subject_id = s.subject_id
  AND i.subject IS NULL
  AND btrim(coalesce(s.subject_name, '')) <> '';

-- ── 3) Availability: promote any value the importer stashed in dynamic_fields
--       into the new typed column, then drop the now-redundant key.
UPDATE public.items
SET availability = btrim(dynamic_fields->>'availability')
WHERE availability IS NULL
  AND dynamic_fields ? 'availability'
  AND btrim(coalesce(dynamic_fields->>'availability','')) <> '';

UPDATE public.items
SET dynamic_fields = dynamic_fields - 'availability'
WHERE dynamic_fields ? 'availability';

-- ── Verification (run manually after applying) ───────────────────────────────
-- select count(*) filter (where item_type_id is not null) as with_item_type,
--        count(*) filter (where brand_id is not null)     as had_brand,
--        count(*) filter (where subject is not null)      as with_subject_text,
--        count(*) filter (where subject_id is not null)   as had_subject_fk,
--        count(*) filter (where availability is not null) as with_availability
-- from public.items;
