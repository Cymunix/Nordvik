import React from 'react'

export default function WishlistPage({ scope }) {
  const {
    currentUser,
    filteredWishlistItems,
    formatUsd,
    handleOpenAddToCollectionModal,
    handleOpenCatalog,
    handleOpenCatalogItem,
    handleWishlistRemove,
    isWishlistLoading,
    openAuth,
    ownedCatalogItemCounts,
    setSelectedCatalogItem,
    setWishlistCategoryFilter,
    setWishlistRemoveConfirmId,
    setWishlistSearchQuery,
    wishlistCategories,
    wishlistCategoryFilter,
    wishlistItems,
    wishlistLoadError,
    wishlistRemoveConfirmId,
    wishlistSearchQuery,
    wishlistSummary,
  } = scope

  const [sortKey, setSortKey] = React.useState('added_desc')
  const [perPage, setPerPage] = React.useState(25)
  const [page, setPage] = React.useState(1)
  const [manageOpen, setManageOpen] = React.useState(false)

  const catCount = (id) => wishlistItems.filter(i => i.category_id === id).length
  const priceOf = (i) => (i.market_price != null && Number(i.market_price) > 0 ? Number(i.market_price) : null)

  // Client-side sort + pagination (no backend changes).
  const sorted = React.useMemo(() => {
    const arr = [...filteredWishlistItems]
    switch (sortKey) {
      case 'price_asc': arr.sort((a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity)); break
      case 'price_desc': arr.sort((a, b) => (priceOf(b) ?? -Infinity) - (priceOf(a) ?? -Infinity)); break
      case 'name': arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break
      case 'year': arr.sort((a, b) => (Number(b.releaseYear) || 0) - (Number(a.releaseYear) || 0)); break
      case 'added_asc': arr.sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0)); break
      default: arr.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0))
    }
    return arr
  }, [filteredWishlistItems, sortKey])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const curPage = Math.min(page, totalPages)
  const start = (curPage - 1) * perPage
  const pageItems = sorted.slice(start, start + perPage)

  React.useEffect(() => { setPage(1) }, [wishlistCategoryFilter, wishlistSearchQuery, sortKey, perPage])

  const fmtDate = (d) => { try { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null } catch { return null } }

  const stats = [
    { icon: '♥', label: 'Total Wishlisted', value: wishlistSummary.totalItems, unit: wishlistSummary.totalItems === 1 ? 'item' : 'items' },
    { icon: '▦', label: 'Categories', value: wishlistSummary.uniqueCategories, unit: wishlistSummary.uniqueCategories === 1 ? 'category' : 'categories' },
    {
      icon: '▤', label: 'Est. Price to Complete',
      value: wishlistSummary.pricedCount > 0 ? formatUsd(wishlistSummary.estimatedTotal) : '$—',
      unit: wishlistSummary.pricedCount > 0 ? `${wishlistSummary.pricedCount} of ${wishlistSummary.filteredCount} priced` : 'Not enough data',
    },
  ]

  return (
    <section className="collection-screen nv-wishlist" aria-label="My Wishlist">
      <div className="catalog-head">
        <div>
          <h1>My Wishlist</h1>
          <p className="subtitle catalog-subtitle">Items you want — add them to your collection when you get them.</p>
        </div>
        <div className="catalog-actions">
          <button type="button" className="nv-btn nv-btn-primary" onClick={handleOpenCatalog}>
            Browse Catalogue
          </button>
        </div>
      </div>

      {!currentUser ? (
        <div className="settings-empty-state">
          <p className="subtitle">Log in to view your wishlist.</p>
          <button type="button" className="auth-submit" onClick={() => openAuth('signin')}>Log in</button>
        </div>
      ) : (
        <div className="collection-layout">
          <aside className="catalog-card collection-sidebar nv-wish-sidebar" aria-label="Wishlist filters">
            <p className="collection-sidebar-title nv-wish-sidebar-head">Filter Wishlist</p>

            <button
              type="button"
              className={`nv-wish-nav ${wishlistCategoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => { setWishlistCategoryFilter('all'); setPage(1) }}
            >
              <span className="nv-wish-nav-ic">♥</span>
              <span className="nv-wish-nav-label">All Items</span>
              <span className="nv-wish-nav-count">{wishlistItems.length}</span>
            </button>
            {wishlistCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`nv-wish-nav ${wishlistCategoryFilter === cat.id ? 'active' : ''}`}
                onClick={() => { setWishlistCategoryFilter(cat.id); setPage(1) }}
              >
                <span className="nv-wish-nav-ic">▣</span>
                <span className="nv-wish-nav-label">{cat.name}</span>
                <span className="nv-wish-nav-count">{catCount(cat.id)}</span>
              </button>
            ))}

            <p className="nv-wish-sidebar-sub">Quick Filters</p>
            {[
              { ic: '🏷', label: 'On Sale', count: 0 },
              { ic: '📉', label: 'Price Drop', count: 0 },
              { ic: '📍', label: 'In Stock Nearby', count: 0 },
            ].map(f => (
              <div key={f.label} className="nv-wish-nav nv-wish-quick" title="Not enough data yet">
                <span className="nv-wish-nav-ic">{f.ic}</span>
                <span className="nv-wish-nav-label">{f.label}</span>
                <span className="nv-wish-nav-count">{f.count}</span>
              </div>
            ))}

            <p className="nv-wish-sidebar-sub">Sort By</p>
            <select className="nv-wish-sort" value={sortKey} onChange={e => setSortKey(e.target.value)}>
              <option value="added_desc">Date Added (Newest)</option>
              <option value="added_asc">Date Added (Oldest)</option>
              <option value="price_asc">Price (Low → High)</option>
              <option value="price_desc">Price (High → Low)</option>
              <option value="name">Alphabetical</option>
              <option value="year">Release Year</option>
            </select>
          </aside>

          <div className="collection-main-pane">
            <div className="collection-topbar nv-wish-topbar">
              <div className="nv-wish-search-wrap">
                <span className="nv-wish-search-ic" aria-hidden="true">&#128269;</span>
                <input
                  type="search"
                  placeholder="Search your wishlist…"
                  value={wishlistSearchQuery}
                  onChange={e => { setWishlistSearchQuery(e.target.value); setPage(1) }}
                />
              </div>
              <div className="nv-wish-manage">
                <button type="button" className="catalog-action-pill" onClick={() => setManageOpen(o => !o)}>
                  &#8943; Manage Wishlist &#9662;
                </button>
                {manageOpen && (
                  <div className="nv-wish-manage-menu" role="menu">
                    <button type="button" onClick={() => { setManageOpen(false); handleOpenCatalog() }}>Browse Catalogue</button>
                    <button type="button" className="nv-wish-manage-disabled" disabled title="Not enough data yet">Compare Prices</button>
                    <button type="button" className="nv-wish-manage-disabled" disabled title="Not enough data yet">Share Wishlist</button>
                  </div>
                )}
              </div>
            </div>

            {isWishlistLoading ? (
              <div className="catalog-card catalog-loading-panel">Loading your wishlist…</div>
            ) : wishlistLoadError ? (
              <div className="catalog-card catalog-loading-panel">{wishlistLoadError}</div>
            ) : wishlistItems.length === 0 ? (
              <div className="nv-wish-empty">
                <div className="nv-wish-empty-ic">♡</div>
                <h2>Your Wishlist is Empty</h2>
                <p>Save items from the catalogue to remember what you're searching for.</p>
                <button type="button" className="auth-submit" onClick={handleOpenCatalog}>Browse Catalogue</button>
              </div>
            ) : (
              <>
                <section className="nv-wish-stats" aria-label="Wishlist summary">
                  {stats.map(s => (
                    <article key={s.label} className="catalog-card nv-wish-stat">
                      <span className="nv-wish-stat-ic">{s.icon}</span>
                      <div>
                        <p className="nv-wish-stat-label">{s.label}</p>
                        <strong>{s.value}</strong>
                        <p className="nv-wish-stat-unit">{s.unit}</p>
                      </div>
                    </article>
                  ))}
                </section>

                {total === 0 ? (
                  <div className="catalog-card catalog-loading-panel">No items match your filters.</div>
                ) : (
                  <>
                    <section className="collection-list nv-wish-list" aria-label="Wishlist items">
                      {pageItems.map(item => {
                        const price = priceOf(item)
                        const added = fmtDate(item.addedAt)
                        const meta = [item.releaseYear, item.categoryName, item.subcategoryName].filter(Boolean).join('  |  ')
                        return (
                          <article key={`wishlist-item-${item.id}`} className="catalog-card nv-wish-row">
                            <div className="nv-wish-media">
                              <span className="nv-wish-heart">♥</span>
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} loading="lazy" />
                              ) : (
                                <div className="nv-wish-noimg">No image</div>
                              )}
                            </div>

                            <div className="nv-wish-info">
                              <h3>{item.name}</h3>
                              {meta && <p className="nv-wish-meta">{meta}</p>}
                              {item.setName && (
                                <div className="nv-wish-tags"><span className="nv-wish-tag">{item.setName}</span></div>
                              )}
                              {added && <p className="nv-wish-added">&#128197; Added {added}</p>}
                              {ownedCatalogItemCounts[item.id] > 0 && (
                                <p className="nv-wish-owned">✓ You own {ownedCatalogItemCounts[item.id]}</p>
                              )}
                            </div>

                            <div className="nv-wish-price">
                              <span className="nv-wish-col-label">Est. Price (CAD) <span className="nv-wish-info-i">&#9432;</span></span>
                              {price != null ? (
                                <strong>{formatUsd(price)}</strong>
                              ) : (
                                <><strong className="nv-wish-na">N/A</strong><span className="nv-wish-hint">Not enough data</span></>
                              )}
                              <span className="nv-wish-col-label nv-wish-col-label-2">Last Seen Price</span>
                              <span className="nv-wish-dash">—</span>
                            </div>

                            <div className="nv-wish-avail">
                              <span className="nv-wish-col-label">Availability <span className="nv-wish-info-i">&#9432;</span></span>
                              <span className="nv-wish-avail-status"><span className="nv-wish-dot" />Not enough data yet</span>
                            </div>

                            <div className="nv-wish-actions">
                              <button type="button" className="catalog-action-pill nv-wish-collect" onClick={() => { setSelectedCatalogItem(item); handleOpenAddToCollectionModal(item.id) }}>
                                &#43; Collect
                              </button>
                              <button type="button" className="catalog-action-pill" onClick={() => handleOpenCatalogItem(item)}>
                                &#128463; View Catalogue Card
                              </button>
                              {wishlistRemoveConfirmId === item.id ? (
                                <div className="collection-item-remove-confirm">
                                  <span className="collection-item-remove-label">Remove?</span>
                                  <button type="button" className="collection-item-remove-choice collection-item-remove-all" onClick={() => handleWishlistRemove(item.id)}>Yes</button>
                                  <button type="button" className="collection-item-remove-cancel" onClick={() => setWishlistRemoveConfirmId('')}>No</button>
                                </div>
                              ) : (
                                <button type="button" className="catalog-action-pill collection-item-remove-btn nv-wish-remove" onClick={() => setWishlistRemoveConfirmId(item.id)}>
                                  &#128465; Remove
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </section>

                    <div className="nv-wish-pagination">
                      <span className="nv-wish-showing">Showing {total === 0 ? 0 : start + 1} to {Math.min(start + perPage, total)} of {total} items</span>
                      <div className="nv-wish-pager">
                        <button type="button" className="catalog-pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1}>‹</button>
                        <span className="nv-wish-page-num">{curPage}</span>
                        <button type="button" className="catalog-pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}>›</button>
                      </div>
                      <div className="nv-wish-perpage">
                        Show
                        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}>
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                        per page
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
