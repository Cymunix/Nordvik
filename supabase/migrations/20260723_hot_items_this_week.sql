-- NORDVIK Dashboard: "Hot Items" data source.
--
-- owned_copies is RLS-locked to each owner (owned_copies_owner_select),
-- so the client cannot compute a cross-collection ranking directly.
-- This SECURITY DEFINER function aggregates additions across ALL users
-- but exposes ONLY non-identifying aggregate counts per catalog item —
-- never any user_id, price, or per-row data. Safe to call from clients.

CREATE OR REPLACE FUNCTION public.hot_items_this_week(item_limit integer DEFAULT 6)
RETURNS TABLE (
  catalog_item_id uuid,
  add_count       bigint,
  collector_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    oc.catalog_item_id,
    COUNT(*)                    AS add_count,
    COUNT(DISTINCT oc.user_id)  AS collector_count
  FROM public.owned_copies oc
  WHERE oc.created_at >= (now() - interval '7 days')
  GROUP BY oc.catalog_item_id
  ORDER BY collector_count DESC, add_count DESC
  LIMIT GREATEST(1, LEAST(COALESCE(item_limit, 6), 24));
$$;

-- Lock down and expose only to signed-in users.
REVOKE ALL ON FUNCTION public.hot_items_this_week(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hot_items_this_week(integer) TO authenticated;
