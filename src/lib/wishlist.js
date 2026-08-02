// Wishlist cascade helpers.
//
// Wishlisting a container item (e.g. a LEGO set) should also wishlist the
// items it contains — the minifigs/parts — so they count on the wishlist too.
// Children come from two sources in the data model:
//   - catalog_item_relationships (parent_item_id → child_item_id, type 'includes')
//   - set_minifigs (set_item_id → minifig_item_id)
// Cascade applies on ADD only. Removing a set does NOT strip its children,
// since a collector may still want a minifig independently of the set.

// Resolve the full set of catalog_item_ids to wishlist for a given item:
// the item itself plus every child it includes.
export async function collectWishlistCascadeIds(supabase, itemId) {
  const ids = new Set([itemId])
  try {
    const [{ data: rel }, { data: sm }] = await Promise.all([
      supabase.from('catalog_item_relationships')
        .select('child_item_id').eq('parent_item_id', itemId).eq('relationship_type', 'includes'),
      supabase.from('set_minifigs')
        .select('minifig_item_id').eq('set_item_id', itemId),
    ])
    for (const r of rel || []) if (r.child_item_id) ids.add(r.child_item_id)
    for (const r of sm || []) if (r.minifig_item_id) ids.add(r.minifig_item_id)
  } catch {
    /* on any lookup failure, fall back to wishlisting just the item itself */
  }
  return [...ids]
}

// Upsert the item and its included children onto the user's wishlist.
// Returns the list of ids that were added (for local state updates).
export async function addToWishlistCascade(supabase, userId, itemId) {
  const ids = await collectWishlistCascadeIds(supabase, itemId)
  const rows = ids.map((id) => ({ user_id: userId, catalog_item_id: id }))
  await supabase.from('wishlist_items')
    .upsert(rows, { onConflict: 'user_id,catalog_item_id', ignoreDuplicates: true })
  return ids
}
