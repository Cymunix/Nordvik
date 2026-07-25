import React from 'react'
import CompletionPage from './CompletionPage'
import StatCard from '../components/dashboard/StatCard'
import CollectionAnalytics from '../components/dashboard/CollectionAnalytics'
import { IconItems, IconValue, IconGraded, IconStores, IconCollection } from '../components/dashboard/icons'

// Muted engraved icon per category for the "Collections by Category" tiles.
const CATEGORY_EMOJI = {
  'building blocks': '🧱', toys: '🧸', 'trading cards': '🃏', comics: '📖',
  'video games': '🎮', movies: '🎬', music: '🎵', 'sports cards': '🏈', books: '📚',
}
const categoryEmoji = (name) => CATEGORY_EMOJI[String(name || '').trim().toLowerCase()] || '📦'

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// Small circular progress ring for the category tiles.
function Ring({ percent, label }) {
  const r = 26
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, percent || 0))
  return (
    <svg className="nv-col-ring" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} className="nv-col-ring-bg" />
      <circle cx="32" cy="32" r={r} className="nv-col-ring-fill"
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} transform="rotate(-90 32 32)" />
      <text x="32" y="36" className="nv-col-ring-text">{label}</text>
    </svg>
  )
}

export default function CollectionPage({ scope }) {
  const {
    activeCollectionFilter,
    activeStorageFilter,
    assignableCustomCollections,
    collectionFilterCondition,
    collectionFilterFaction,
    collectionFilterOptions,
    collectionFilterSpecies,
    collectionFilterSubtheme,
    collectionFilterManufacturer,
    collectionFilterPublisher,
    setCollectionFilterManufacturer,
    setCollectionFilterPublisher,
    collectionLoadError,
    collectionOverviewPage,
    collectionOverviewPageInput,
    collectionOverviewTotalPages,
    collectionSearchQuery,
    collectionSortKey,
    collectionSummary,
    collectionViewTab,
    completionBrandGroups,
    completionCategoryGroups,
    completionFranchiseGroups,
    completionLabels,
    completionNavBrand,
    completionNavCategory,
    completionNavFranchise,
    completionNavSubcategory,
    completionSubcategoryGroups,
    currentUser,
    customCollections,
    filteredCollectionItems,
    formatUsd,
    handleAssignStorageLocationToItem,
    handleCreateCustomCollection,
    handleCreateStorageLocation,
    handleDeleteActiveCollection,
    handleDeleteActiveStorageLocation,
    handleMoveActiveStorageLocation,
    handleOpenCatalog,
    handleOpenCatalogItem,
    handleOpenCollectionItemDetails,
    handleRemoveCollectionItem,
    handleRenameActiveCollection,
    handleRenameActiveStorageLocation,
    handleToggleCollectionMembership,
    isCollectionLoading,
    isCreatingCustomCollection,
    isCreatingStorageLocation,
    isSavingCollectionOrganization,
    newCustomCollectionName,
    newStorageLocationName,
    newStorageParentLocationId,
    openAuth,
    openCatalogItemById,
    ownedCatalogItemIds,
    paginatedCollectionItems,
    removeConfirmItemId,
    setActiveCollectionFilter,
    setActiveStorageFilter,
    setCollectionFilterCondition,
    setCollectionFilterFaction,
    setCollectionFilterSpecies,
    setCollectionFilterSubtheme,
    setCollectionOverviewPage,
    setCollectionOverviewPageInput,
    setCollectionSearchQuery,
    setCollectionSortKey,
    setCollectionViewTab,
    setCompletionNavBrand,
    setCompletionNavCategory,
    setCompletionNavFranchise,
    setCompletionNavSubcategory,
    setNewCustomCollectionName,
    setNewStorageLocationName,
    setNewStorageParentLocationId,
    setRemoveConfirmItemId,
    setSelectedCompletionSetId,
    storageLocationPathById,
    storageLocations,
    t,
  } = scope

  const [menuItemId, setMenuItemId] = React.useState('')
  const [breakdownMode, setBreakdownMode] = React.useState('items') // 'items' | 'value'
  const [localCategoryFilter, setLocalCategoryFilter] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)
  const [manageStorage, setManageStorage] = React.useState(false)
  const [manageCollections, setManageCollections] = React.useState(false)

  // Map legacy tab values onto the three primary tabs.
  const activeTab =
    collectionViewTab === 'items' ? 'items'
      : collectionViewTab === 'analytics' ? 'analytics'
      : collectionViewTab === 'completion' ? 'completion'
      : 'overview'

  const hasExtraFilters =
    collectionFilterSubtheme || collectionFilterFaction || collectionFilterSpecies || collectionFilterCondition
    || collectionFilterManufacturer || collectionFilterPublisher

  // ── Overview aggregates (all from real, already-loaded collection data) ──
  const totalItems = filteredCollectionItems.length
  const categoryAgg = {}
  let breakdownValueTotal = 0
  for (const it of filteredCollectionItems) {
    const c = it.categoryName || 'Uncategorized'
    const value = Number(it.currentMarketValue) || 0
    if (!categoryAgg[c]) categoryAgg[c] = { count: 0, value: 0 }
    categoryAgg[c].count += 1
    categoryAgg[c].value += value
    breakdownValueTotal += value
  }
  const categoryTiles = Object.entries(categoryAgg).map(([name, agg]) => ({ name, count: agg.count, value: agg.value }))

  // Collection Breakdown: share of total item COUNT or total VALUE per category.
  const breakdownTotal = breakdownMode === 'value' ? breakdownValueTotal : totalItems
  const breakdownTiles = categoryTiles
    .map((c) => {
      const metric = breakdownMode === 'value' ? c.value : c.count
      return {
        ...c,
        percent: breakdownTotal > 0 ? (metric / breakdownTotal) * 100 : 0,
        label: breakdownMode === 'value' ? formatUsd(c.value) : `${c.count} ${c.count === 1 ? 'item' : 'items'}`,
      }
    })
    .sort((a, b) => (breakdownMode === 'value' ? b.value - a.value : b.count - a.count))

  const recentlyAdded = [...filteredCollectionItems]
    .filter((it) => it.latestAddedAt)
    .sort((a, b) => String(b.latestAddedAt).localeCompare(String(a.latestAddedAt)))
    .slice(0, 5)

  const storageStats = storageLocations.map((loc) => {
    const count = filteredCollectionItems.filter(
      (it) => Array.isArray(it.locationIds) && it.locationIds.includes(loc.id),
    ).length
    return { ...loc, count, percent: totalItems ? Math.round((count / totalItems) * 100) : 0 }
  })

  const gradedPct = collectionSummary.totalCopies
    ? Math.round((collectionSummary.gradedCopies / collectionSummary.totalCopies) * 100)
    : 0

  // ── Items list (with an optional client-side category filter) ──
  const categoryOptions = [...new Set(filteredCollectionItems.map((i) => i.categoryName).filter(Boolean))].sort()
  const itemsToRender = localCategoryFilter
    ? filteredCollectionItems.filter((i) => i.categoryName === localCategoryFilter)
    : paginatedCollectionItems
  const showPagination = !localCategoryFilter && collectionOverviewTotalPages > 1

  const selectTab = (tab) => setCollectionViewTab(tab)

  return (
    <section className="nv-collection" aria-label="My collection">
      <header className="nv-col-head">
        <div>
          <h1>{t('myCollection')}</h1>
          <p className="nv-col-subtitle">Organize, track and grow your legendary collection.</p>
        </div>
        <button type="button" className="nv-btn nv-btn-primary" onClick={handleOpenCatalog}>Browse Catalogue</button>
      </header>

      {!currentUser ? (
        <div className="nv-panel nv-col-empty">
          <p>Log in to view and manage your collection.</p>
          <button type="button" className="nv-btn nv-btn-primary" onClick={() => openAuth('signin')}>Log in</button>
        </div>
      ) : (
        <>
          <nav className="nv-col-tabs" role="tablist" aria-label="Collection views">
            {[['overview', 'Overview'], ['items', 'Items'], ['analytics', 'Analytics'], ['completion', 'Completion']].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={activeTab === key}
                className={`nv-col-tab${activeTab === key ? ' is-active' : ''}`} onClick={() => selectTab(key)}>
                {label}
              </button>
            ))}
          </nav>

          {/* ── Compact filter toolbar ── */}
          {activeTab === 'completion' ? (
            <div className="nv-col-toolbar">
              <select className="nv-col-select" value={completionNavCategory}
                onChange={(e) => { setCompletionNavCategory(e.target.value); setCompletionNavSubcategory(''); setCompletionNavFranchise(''); setCompletionNavBrand(''); setSelectedCompletionSetId('') }}>
                <option value="">All categories</option>
                {Object.keys(completionCategoryGroups).sort((a, b) => a.localeCompare(b)).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="nv-col-select" value={completionNavSubcategory} disabled={!completionNavCategory}
                onChange={(e) => { setCompletionNavSubcategory(e.target.value); setCompletionNavFranchise(''); setCompletionNavBrand(''); setSelectedCompletionSetId('') }}>
                <option value="">All {completionLabels.subcategory.toLowerCase()}s</option>
                {Object.keys(completionSubcategoryGroups).sort((a, b) => a.localeCompare(b)).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="nv-col-select" value={completionNavFranchise} disabled={!completionNavSubcategory}
                onChange={(e) => { setCompletionNavFranchise(e.target.value); setCompletionNavBrand(''); setSelectedCompletionSetId('') }}>
                <option value="">All {completionLabels.franchise.toLowerCase()}s</option>
                {Object.keys(completionFranchiseGroups).sort((a, b) => a.localeCompare(b)).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="nv-col-select" value={completionNavBrand} disabled={!completionNavFranchise}
                onChange={(e) => { setCompletionNavBrand(e.target.value); setSelectedCompletionSetId('') }}>
                <option value="">All {completionLabels.brand.toLowerCase()}s</option>
                {Object.keys(completionBrandGroups).sort((a, b) => a.localeCompare(b)).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {(completionNavCategory || completionNavSubcategory || completionNavFranchise || completionNavBrand) && (
                <button type="button" className="nv-col-clear"
                  onClick={() => { setCompletionNavCategory(''); setCompletionNavSubcategory(''); setCompletionNavFranchise(''); setCompletionNavBrand(''); setSelectedCompletionSetId('') }}>Clear</button>
              )}
            </div>
          ) : (
            <div className="nv-col-toolbar">
              <input className="nv-col-search" type="search" value={collectionSearchQuery}
                onChange={(e) => setCollectionSearchQuery(e.target.value)}
                placeholder="Search items, sets, collections…" />
              <select className="nv-col-select" value={activeCollectionFilter}
                onChange={(e) => setActiveCollectionFilter(e.target.value)} aria-label="Collection">
                <option value="all">All Collections</option>
                {customCollections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="nv-col-select" value={localCategoryFilter}
                onChange={(e) => setLocalCategoryFilter(e.target.value)} aria-label="Category">
                <option value="">All Categories</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="nv-col-select" value={activeStorageFilter || ''}
                onChange={(e) => setActiveStorageFilter(e.target.value)} aria-label="Location">
                <option value="">All Locations</option>
                {storageLocations.map((l) => <option key={l.id} value={l.id}>{storageLocationPathById[l.id] || l.name}</option>)}
              </select>
              <select className="nv-col-select nv-col-sort" value={collectionSortKey}
                onChange={(e) => setCollectionSortKey(e.target.value)} aria-label="Sort by">
                <option value="recent">Sort by: Recently Added</option>
                <option value="name">Sort by: Name (A–Z)</option>
                <option value="value_desc">Sort by: Value (high→low)</option>
                <option value="value_asc">Sort by: Value (low→high)</option>
                <option value="quantity">Sort by: Quantity</option>
              </select>
              {(collectionFilterOptions.subthemes.length > 0 || collectionFilterOptions.factions.length > 0 ||
                collectionFilterOptions.species.length > 0 || collectionFilterOptions.conditions.length > 0 ||
                collectionFilterOptions.manufacturers.length > 0 || collectionFilterOptions.publishers.length > 0) && (
                <button type="button" className={`nv-col-filter-btn${showFilters || hasExtraFilters ? ' is-active' : ''}`}
                  onClick={() => setShowFilters((v) => !v)} aria-label="More filters" title="More filters">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                </button>
              )}
            </div>
          )}

          {showFilters && activeTab !== 'completion' && (
            <div className="nv-col-filter-panel">
              {collectionFilterOptions.subthemes.length > 0 && (
                <select className="nv-col-select" value={collectionFilterSubtheme} onChange={(e) => setCollectionFilterSubtheme(e.target.value)}>
                  <option value="">All sets</option>
                  {collectionFilterOptions.subthemes.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {collectionFilterOptions.manufacturers.length > 0 && (
                <select className="nv-col-select" value={collectionFilterManufacturer} onChange={(e) => setCollectionFilterManufacturer(e.target.value)}>
                  <option value="">All manufacturers</option>
                  {collectionFilterOptions.manufacturers.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {collectionFilterOptions.publishers.length > 0 && (
                <select className="nv-col-select" value={collectionFilterPublisher} onChange={(e) => setCollectionFilterPublisher(e.target.value)}>
                  <option value="">All publishers</option>
                  {collectionFilterOptions.publishers.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {collectionFilterOptions.factions.length > 0 && (
                <select className="nv-col-select" value={collectionFilterFaction} onChange={(e) => setCollectionFilterFaction(e.target.value)}>
                  <option value="">All factions</option>
                  {collectionFilterOptions.factions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {collectionFilterOptions.species.length > 0 && (
                <select className="nv-col-select" value={collectionFilterSpecies} onChange={(e) => setCollectionFilterSpecies(e.target.value)}>
                  <option value="">All species</option>
                  {collectionFilterOptions.species.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {collectionFilterOptions.conditions.length > 0 && (
                <select className="nv-col-select" value={collectionFilterCondition} onChange={(e) => setCollectionFilterCondition(e.target.value)}>
                  <option value="">All conditions</option>
                  {collectionFilterOptions.conditions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {hasExtraFilters && (
                <button type="button" className="nv-col-clear" onClick={() => { setCollectionFilterSubtheme(''); setCollectionFilterFaction(''); setCollectionFilterSpecies(''); setCollectionFilterCondition(''); setCollectionFilterManufacturer(''); setCollectionFilterPublisher('') }}>Clear filters</button>
              )}
            </div>
          )}

          {isCollectionLoading ? (
            <div className="nv-panel nv-col-empty">Loading your collection…</div>
          ) : collectionLoadError ? (
            <div className="nv-panel nv-col-empty">{collectionLoadError}</div>
          ) : activeTab === 'completion' ? (
            <CompletionPage
              ownedCatalogItemIds={ownedCatalogItemIds}
              onOpenItem={openCatalogItemById}
              searchQuery={collectionSearchQuery}
              filterCategory={completionNavCategory}
              filterSubcategory={completionNavSubcategory}
              filterFranchise={completionNavFranchise}
              filterBrand={completionNavBrand}
            />
          ) : activeTab === 'items' ? (
            <div className="nv-col-items">
              {itemsToRender.length === 0 ? (
                <div className="nv-panel nv-col-empty">No matching items. Add items from the catalogue or adjust your filters.</div>
              ) : (
                itemsToRender.map((item) => {
                  const primaryLocationId = Array.isArray(item.locationIds) && item.locationIds.length ? item.locationIds[0] : ''
                  const open = menuItemId === item.id
                  return (
                    <article key={`ci-${item.id}`} className="nv-col-row" role="button" tabIndex={0}
                      onClick={() => handleOpenCollectionItemDetails(item)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenCollectionItemDetails(item) } }}>
                      <span className="nv-col-row-thumb">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">◇</span>}
                      </span>
                      <span className="nv-col-row-main">
                        <span className="nv-col-row-name">{item.name}</span>
                        <span className="nv-col-row-meta">
                          {[item.categoryName, item.setName || item.franchiseName, item.releaseYear].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      <span className="nv-col-row-stats">
                        <span className="nv-col-row-qty">×{item.totalQuantity}</span>
                        <span className="nv-col-row-val">{formatUsd(item.totalInvested)}</span>
                      </span>
                      <span className="nv-col-row-menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="nv-col-menu-btn" aria-label="Item actions"
                          onClick={() => setMenuItemId(open ? '' : item.id)}>⋮</button>
                        {open && (
                          <>
                            <span className="nv-col-menu-backdrop" onClick={() => setMenuItemId('')} />
                            <div className="nv-col-menu" role="menu">
                              <button type="button" className="nv-col-menu-item" onClick={() => { setMenuItemId(''); handleOpenCollectionItemDetails(item) }}>View details</button>
                              <button type="button" className="nv-col-menu-item" disabled={!item.catalogItem}
                                onClick={() => { setMenuItemId(''); if (item.catalogItem) handleOpenCatalogItem(item.catalogItem) }}>View catalogue card</button>
                              <div className="nv-col-menu-sep" />
                              <label className="nv-col-menu-label">Location</label>
                              <select className="nv-col-select nv-col-menu-select" value={primaryLocationId}
                                disabled={isSavingCollectionOrganization}
                                onChange={(e) => handleAssignStorageLocationToItem(item, e.target.value)}>
                                <option value="">Unassigned</option>
                                {storageLocations.map((l) => <option key={`il-${item.id}-${l.id}`} value={l.id}>{storageLocationPathById[l.id] || l.name}</option>)}
                              </select>
                              {assignableCustomCollections.length > 0 && (
                                <>
                                  <label className="nv-col-menu-label">Collections</label>
                                  <div className="nv-col-menu-chips">
                                    {assignableCustomCollections.map((c) => {
                                      const on = Array.isArray(item.collectionIds) && item.collectionIds.includes(c.id)
                                      return (
                                        <button key={`ic-${item.id}-${c.id}`} type="button"
                                          className={`nv-col-chip${on ? ' is-on' : ''}`} disabled={isSavingCollectionOrganization}
                                          onClick={() => handleToggleCollectionMembership(item, c.id)}>{on ? '✓ ' : ''}{c.name}</button>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                              <div className="nv-col-menu-sep" />
                              {removeConfirmItemId === item.id ? (
                                <div className="nv-col-menu-remove">
                                  {item.totalQuantity > 1 ? (
                                    <>
                                      <button type="button" className="nv-col-menu-item danger" onClick={() => { handleRemoveCollectionItem(item, 'one'); setMenuItemId('') }}>Remove 1 copy</button>
                                      <button type="button" className="nv-col-menu-item danger" onClick={() => { handleRemoveCollectionItem(item, 'all'); setMenuItemId('') }}>Remove all {item.totalQuantity}</button>
                                    </>
                                  ) : (
                                    <button type="button" className="nv-col-menu-item danger" onClick={() => { handleRemoveCollectionItem(item, 'all'); setMenuItemId('') }}>Confirm remove</button>
                                  )}
                                  <button type="button" className="nv-col-menu-item" onClick={() => setRemoveConfirmItemId('')}>Cancel</button>
                                </div>
                              ) : (
                                <button type="button" className="nv-col-menu-item danger" onClick={() => setRemoveConfirmItemId(item.id)}>Remove from collection</button>
                              )}
                            </div>
                          </>
                        )}
                      </span>
                    </article>
                  )
                })
              )}

              {showPagination && (
                <div className="nv-col-pagination">
                  <button type="button" className="nv-btn" disabled={collectionOverviewPage <= 1}
                    onClick={() => setCollectionOverviewPage((p) => Math.max(1, p - 1))}>Previous</button>
                  <span className="nv-col-page">
                    Page{' '}
                    <input type="number" className="nv-col-page-input" min={1} max={collectionOverviewTotalPages}
                      value={collectionOverviewPageInput}
                      onChange={(e) => setCollectionOverviewPageInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      onBlur={() => {
                        const n = parseInt(collectionOverviewPageInput, 10)
                        if (!Number.isFinite(n)) { setCollectionOverviewPageInput(String(collectionOverviewPage)); return }
                        const clamped = Math.min(collectionOverviewTotalPages, Math.max(1, n))
                        setCollectionOverviewPage(clamped); setCollectionOverviewPageInput(String(clamped))
                      }} />
                    {' '}/ {collectionOverviewTotalPages}
                  </span>
                  <button type="button" className="nv-btn" disabled={collectionOverviewPage >= collectionOverviewTotalPages}
                    onClick={() => setCollectionOverviewPage((p) => Math.min(collectionOverviewTotalPages, p + 1))}>Next</button>
                </div>
              )}
            </div>
          ) : activeTab !== 'analytics' ? (
            /* ── Overview ── */
            <div className="nv-col-overview">
              <section className="nv-stats nv-col-stats" aria-label="Collection summary">
                <StatCard icon={<IconItems />} label="Total Items" value={collectionSummary.totalCopies.toLocaleString()} sub={`${collectionSummary.uniqueItems.toLocaleString()} unique items`} />
                <StatCard icon={<IconCollection />} label="Total Copies" value={collectionSummary.totalCopies.toLocaleString()} sub="Across all items" />
                <StatCard icon={<IconGraded />} label="Graded Copies" value={collectionSummary.gradedCopies.toLocaleString()} sub={`${gradedPct}% of total copies`} />
                <StatCard icon={<IconValue />} label="Total Invested" value={formatUsd(collectionSummary.totalInvested)} sub="Across all time" />
                <StatCard icon={<IconValue />} label="Collection Value" value={formatUsd(collectionSummary.totalValue)} sub="Current estimated value" />
              </section>

              {breakdownTiles.length > 0 && (
                <section className="nv-panel nv-col-block" aria-label="Collection breakdown">
                  <div className="nv-section-head">
                    <span className="nv-section-title">Collection Breakdown</span>
                    <div className="nv-col-seg" role="group" aria-label="Breakdown mode">
                      <button type="button" className={`nv-col-seg-btn${breakdownMode === 'items' ? ' is-active' : ''}`}
                        aria-pressed={breakdownMode === 'items'} onClick={() => setBreakdownMode('items')}>Items</button>
                      <button type="button" className={`nv-col-seg-btn${breakdownMode === 'value' ? ' is-active' : ''}`}
                        aria-pressed={breakdownMode === 'value'} onClick={() => setBreakdownMode('value')}>Value</button>
                    </div>
                  </div>
                  <div className="nv-col-cat-grid">
                    {breakdownTiles.map((c) => (
                      <div key={c.name} className="nv-col-cat-tile">
                        <span className="nv-col-cat-emoji" aria-hidden="true">{categoryEmoji(c.name)}</span>
                        <span className="nv-col-cat-name">{c.name}</span>
                        <Ring percent={c.percent} label={`${Math.round(c.percent)}%`} />
                        <span className="nv-col-cat-count">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="nv-col-two">
                <section className="nv-panel nv-col-block" aria-label="Recently added">
                  <div className="nv-section-head">
                    <span className="nv-section-title">Recently Added</span>
                    <button type="button" className="nv-section-link" onClick={() => selectTab('items')}>View all</button>
                  </div>
                  {recentlyAdded.length === 0 ? (
                    <p className="nv-col-muted">Nothing added yet.</p>
                  ) : (
                    <ul className="nv-col-list">
                      {recentlyAdded.map((it) => (
                        <li key={`ra-${it.id}`}>
                          <button type="button" className="nv-col-list-row" onClick={() => handleOpenCollectionItemDetails(it)}>
                            <span className="nv-col-row-thumb sm">{it.imageUrl ? <img src={it.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">◇</span>}</span>
                            <span className="nv-col-row-main">
                              <span className="nv-col-row-name">{it.name}</span>
                              <span className="nv-col-row-meta">{[it.categoryName, it.setName || it.franchiseName].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="nv-col-row-time">{timeAgo(it.latestAddedAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="nv-panel nv-col-block" aria-label="Storage locations">
                  <div className="nv-section-head">
                    <span className="nv-section-title">Storage Locations</span>
                    <button type="button" className="nv-section-link" onClick={() => setManageStorage((v) => !v)}>{manageStorage ? 'Done' : 'Manage'}</button>
                  </div>
                  {storageStats.length === 0 ? (
                    <p className="nv-col-muted">No storage locations yet.</p>
                  ) : (
                    <ul className="nv-col-list">
                      {storageStats.map((loc) => (
                        <li key={`sl-${loc.id}`}>
                          <button type="button" className={`nv-col-storage-row${activeStorageFilter === loc.id ? ' is-active' : ''}`}
                            onClick={() => { setActiveStorageFilter(activeStorageFilter === loc.id ? '' : loc.id); selectTab('items') }}>
                            <span className="nv-col-storage-icon" aria-hidden="true"><IconStores /></span>
                            <span className="nv-col-storage-main">
                              <span className="nv-col-row-name">{loc.name}</span>
                              <span className="nv-col-row-meta">{loc.count} {loc.count === 1 ? 'item' : 'items'}</span>
                            </span>
                            <span className="nv-col-storage-pct">
                              <span className="nv-col-storage-bar"><span style={{ width: `${loc.percent}%` }} /></span>
                              <span>{loc.percent}%</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {manageStorage && (
                    <div className="nv-col-manage">
                      <div className="nv-col-manage-row">
                        <input type="text" className="nv-col-search" value={newStorageLocationName}
                          onChange={(e) => setNewStorageLocationName(e.target.value)} placeholder="New location name" />
                        <select className="nv-col-select" value={newStorageParentLocationId} onChange={(e) => setNewStorageParentLocationId(e.target.value)}>
                          <option value="">Top Level</option>
                          {storageLocations.map((l) => <option key={`sp-${l.id}`} value={l.id}>{storageLocationPathById[l.id] || l.name}</option>)}
                        </select>
                        <button type="button" className="nv-btn" disabled={isCreatingStorageLocation} onClick={handleCreateStorageLocation}>Add</button>
                      </div>
                      {activeStorageFilter && (
                        <div className="nv-col-manage-row">
                          <select className="nv-col-select" value="" onChange={(e) => handleMoveActiveStorageLocation(e.target.value)}>
                            <option value="">Move selected to…</option>
                            <option value="">Top Level</option>
                            {storageLocations.filter((l) => l.id !== activeStorageFilter).map((l) => <option key={`mv-${l.id}`} value={l.id}>{storageLocationPathById[l.id] || l.name}</option>)}
                          </select>
                          <button type="button" className="nv-btn" onClick={handleRenameActiveStorageLocation}>Rename</button>
                          <button type="button" className="nv-btn" onClick={handleDeleteActiveStorageLocation}>Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {/* Collections management */}
              <section className="nv-panel nv-col-block" aria-label="Collections">
                <div className="nv-section-head">
                  <span className="nv-section-title">My Collections</span>
                  <button type="button" className="nv-section-link" onClick={() => setManageCollections((v) => !v)}>{manageCollections ? 'Done' : 'Manage'}</button>
                </div>
                <div className="nv-col-chips">
                  <button type="button" className={`nv-col-chip${activeCollectionFilter === 'all' ? ' is-on' : ''}`} onClick={() => { setActiveCollectionFilter('all'); selectTab('items') }}>All Items</button>
                  {customCollections.map((c) => (
                    <button key={c.id} type="button" className={`nv-col-chip${activeCollectionFilter === c.id ? ' is-on' : ''}`} onClick={() => { setActiveCollectionFilter(c.id); selectTab('items') }}>{c.name}</button>
                  ))}
                </div>
                {manageCollections && (
                  <div className="nv-col-manage">
                    <div className="nv-col-manage-row">
                      <input type="text" className="nv-col-search" value={newCustomCollectionName}
                        onChange={(e) => setNewCustomCollectionName(e.target.value)} placeholder="New collection name" />
                      <button type="button" className="nv-btn" disabled={isCreatingCustomCollection} onClick={handleCreateCustomCollection}>Create</button>
                    </div>
                    {activeCollectionFilter !== 'all' && (
                      <div className="nv-col-manage-row">
                        <button type="button" className="nv-btn" onClick={handleRenameActiveCollection}>Rename selected</button>
                        <button type="button" className="nv-btn" onClick={handleDeleteActiveCollection}>Delete selected</button>
                      </div>
                    )}
                  </div>
                )}
              </section>

            </div>
          ) : (
            /* ── Analytics ── */
            <CollectionAnalytics scope={scope} />
          )}
        </>
      )}
    </section>
  )
}
