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
    paginatedWishlistItems,
    setSelectedCatalogItem,
    setWishlistCategoryFilter,
    setWishlistPage,
    setWishlistRemoveConfirmId,
    setWishlistSearchQuery,
    setWishlistViewTab,
    wishlistCategories,
    wishlistCategoryFilter,
    wishlistItems,
    wishlistLoadError,
    wishlistPage,
    wishlistRemoveConfirmId,
    wishlistSearchQuery,
    wishlistSummary,
    wishlistTotalPages,
    wishlistViewTab
  } = scope
  return (
          <section className="collection-screen" aria-label="My Wishlist">
            <div className="catalog-head">
              <div>
                <h1>My Wishlist</h1>
                <p className="subtitle catalog-subtitle">Items you're hoping to add to your collection — plan, track and collect.</p>
              </div>
              <div className="catalog-actions">
                <button type="button" className="catalog-action-pill" onClick={handleOpenCatalog}>
                  Browse Catalogue
                </button>
              </div>
            </div>

            {!currentUser ? (
              <div className="settings-empty-state">
                <p className="subtitle">Log in to view your wishlist.</p>
                <button type="button" className="auth-submit" onClick={() => openAuth('signin')}>
                  Log in
                </button>
              </div>
            ) : (
              <div className="collection-layout">
                <aside className="catalog-card collection-sidebar" aria-label="Wishlist filters">
                  <div className="collection-sidebar-section">
                    <p className="collection-sidebar-title">Filters</p>
                    <button
                      type="button"
                      className={`collection-sidebar-link ${wishlistCategoryFilter === 'all' ? 'active' : ''}`}
                      onClick={() => { setWishlistCategoryFilter('all'); setWishlistPage(1) }}
                    >
                      All Items
                    </button>
                    {wishlistCategories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`collection-sidebar-link ${wishlistCategoryFilter === cat.id ? 'active' : ''}`}
                        onClick={() => { setWishlistCategoryFilter(cat.id); setWishlistPage(1) }}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </aside>

                <div className="collection-main-pane">
                  <div className="collection-topbar">
                    <input
                      type="search"
                      placeholder="Search wishlist…"
                      value={wishlistSearchQuery}
                      onChange={e => { setWishlistSearchQuery(e.target.value); setWishlistPage(1) }}
                    />
                    <div className="collection-tab-row" role="tablist" aria-label="Wishlist views">
                      <button
                        type="button"
                        className={`collection-tab-button ${wishlistViewTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setWishlistViewTab('overview')}
                      >
                        Overview
                      </button>
                    </div>
                  </div>

                  {isWishlistLoading ? (
                    <div className="catalog-card catalog-loading-panel">Loading your wishlist...</div>
                  ) : wishlistLoadError ? (
                    <div className="catalog-card catalog-loading-panel">{wishlistLoadError}</div>
                  ) : wishlistItems.length === 0 ? (
                    <div className="settings-empty-state">
                      <p className="subtitle">Your wishlist is empty. Browse the catalogue and add items you want.</p>
                      <button type="button" className="auth-submit" onClick={handleOpenCatalog}>
                        Browse Catalogue
                      </button>
                    </div>
                  ) : filteredWishlistItems.length === 0 ? (
                    <div className="catalog-card catalog-loading-panel">No items match your filters.</div>
                  ) : (
                    <>
                      <section className="collection-summary-grid" aria-label="Wishlist summary">
                        <article className="catalog-card collection-summary-card">
                          <p className="collection-summary-label">Total Wishlisted</p>
                          <strong>{wishlistSummary.totalItems}</strong>
                        </article>
                        <article className="catalog-card collection-summary-card">
                          <p className="collection-summary-label">Categories</p>
                          <strong>{wishlistSummary.uniqueCategories}</strong>
                        </article>
                        <article className="catalog-card collection-summary-card">
                          <p className="collection-summary-label">Unique Sets</p>
                          <strong>{wishlistSummary.uniqueSets}</strong>
                        </article>
                        <article className="catalog-card collection-summary-card">
                          <p className="collection-summary-label">Est. Price to Complete</p>
                          <strong>{wishlistSummary.pricedCount > 0 ? formatUsd(wishlistSummary.estimatedTotal) : '—'}</strong>
                          {wishlistSummary.pricedCount > 0 && wishlistSummary.pricedCount < wishlistSummary.filteredCount && (
                            <p style={{ fontSize: '0.72rem', color: '#667', marginTop: 2 }}>
                              {wishlistSummary.pricedCount} of {wishlistSummary.filteredCount} priced
                            </p>
                          )}
                        </article>
                      </section>

                      <section className="collection-list nv-wish-list" aria-label="Wishlist items">
                        {paginatedWishlistItems.map(item => {
                          const hasPrice = item.market_price != null && Number(item.market_price) > 0
                          return (
                          <article key={`wishlist-item-${item.id}`} className="catalog-card nv-wish-row">
                            <div className="nv-wish-media">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} loading="lazy" />
                              ) : (
                                <div className="nv-wish-noimg">No image</div>
                              )}
                            </div>

                            <div className="nv-wish-info">
                              <h3>{item.name}</h3>
                              <p className="nv-wish-meta">
                                {[item.releaseYear, item.categoryName, item.setName].filter(Boolean).join('  ·  ')}
                              </p>
                              {item.setName && (
                                <div className="nv-wish-tags">
                                  <span className="nv-wish-tag">{item.setName}</span>
                                </div>
                              )}
                              {ownedCatalogItemCounts[item.id] > 0 && (
                                <p className="nv-wish-owned">✓ You own {ownedCatalogItemCounts[item.id]}</p>
                              )}
                            </div>

                            <div className="nv-wish-price">
                              <span className="nv-wish-col-label">Est. Price (CAD)</span>
                              {hasPrice ? (
                                <strong>{formatUsd(item.market_price)}</strong>
                              ) : (
                                <><strong className="nv-wish-na">N/A</strong><span className="nv-wish-hint">Not enough data yet</span></>
                              )}
                              <span className="nv-wish-col-label nv-wish-col-label-2">Last Seen Price</span>
                              <span className="nv-wish-dash">—</span>
                            </div>

                            <div className="nv-wish-avail">
                              <span className="nv-wish-col-label">Availability</span>
                              <span className="nv-wish-hint">Not enough data yet</span>
                            </div>

                            <div className="nv-wish-actions">
                              <button
                                type="button"
                                className="catalog-action-pill nv-wish-collect"
                                onClick={() => {
                                  setSelectedCatalogItem(item)
                                  handleOpenAddToCollectionModal(item.id)
                                }}
                              >
                                Collect
                              </button>

                              <button
                                type="button"
                                className="catalog-action-pill"
                                onClick={() => handleOpenCatalogItem(item)}
                              >
                                View Catalogue Card
                              </button>

                              {wishlistRemoveConfirmId === item.id ? (
                                <div className="collection-item-remove-confirm">
                                  <span className="collection-item-remove-label">Remove from wishlist?</span>
                                  <button type="button" className="collection-item-remove-choice collection-item-remove-all" onClick={() => handleWishlistRemove(item.id)}>Yes</button>
                                  <button type="button" className="collection-item-remove-cancel" onClick={() => setWishlistRemoveConfirmId('')}>No</button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="catalog-action-pill collection-item-remove-btn"
                                  onClick={() => setWishlistRemoveConfirmId(item.id)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </article>
                        )})}
                      </section>

                      {wishlistTotalPages > 1 && (
                        <div className="catalog-pagination" aria-label="Wishlist pagination">
                          <button
                            type="button"
                            className="catalog-pagination-btn"
                            onClick={() => setWishlistPage(p => Math.max(1, p - 1))}
                            disabled={wishlistPage <= 1}
                          >
                            Previous
                          </button>
                          <span className="catalog-pagination-page">Page {wishlistPage} / {wishlistTotalPages}</span>
                          <button
                            type="button"
                            className="catalog-pagination-btn"
                            onClick={() => setWishlistPage(p => Math.min(wishlistTotalPages, p + 1))}
                            disabled={wishlistPage >= wishlistTotalPages}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
  )
}
