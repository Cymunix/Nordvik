import DashboardHero from '../components/dashboard/DashboardHero'
import StatCard from '../components/dashboard/StatCard'
import CompletionStat from '../components/dashboard/CompletionStat'
import HotItems from '../components/dashboard/HotItems'
import RecentSales from '../components/dashboard/RecentSales'
import { UpcomingEvents } from '../components/dashboard/DashboardPanels'
import useValueHistory from '../components/dashboard/useValueHistory'
import { IconValue, IconItems, IconSales } from '../components/dashboard/icons'

// NORDVIK Dashboard / landing screen.
// Composed from small presentational pieces. Every number here is
// derived from real, already-loaded application data (owned copies +
// wishlist). Nothing is mocked; cards with no data source are omitted.
export default function HomePage({ scope }) {
  const {
    currentUser,
    timeGreeting,
    topbarUserName,
    ownedCatalogItemCounts = {},
    ownedCatalogItemPurchases = {},
    handleOpenCatalog,
    openCatalogItemById,
    homeColumns = [],
    settingsHomeShowEmptyStateHints,
    t,
    tx,
  } = scope

  // ── Real collection aggregates (globally-loaded owned-copies data) ──
  const uniqueItems = Object.keys(ownedCatalogItemCounts).length
  const totalCopies = Object.values(ownedCatalogItemCounts).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0,
  )

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  let collectionValue = 0
  let newThisMonth = 0
  for (const purchases of Object.values(ownedCatalogItemPurchases)) {
    if (!Array.isArray(purchases)) continue
    for (const purchase of purchases) {
      collectionValue += Number(purchase?.unitPrice) || 0
      const added = purchase?.createdAt ? new Date(purchase.createdAt).getTime() : NaN
      if (!Number.isNaN(added) && added >= monthStart) newThisMonth += 1
    }
  }

  const money = (value) =>
    `$${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`

  // Real value/items history (snapshots) → sparklines + month-to-date delta.
  // Hook must run before any early return.
  const { valueSeries, itemsSeries, valueDeltaPct } = useValueHistory(
    currentUser?.id,
    collectionValue,
    totalCopies,
  )
  const valueDelta =
    valueDeltaPct == null || Math.abs(valueDeltaPct) < 0.05
      ? null
      : { text: `${valueDeltaPct > 0 ? '+' : ''}${valueDeltaPct.toFixed(1)}%`, tone: valueDeltaPct >= 0 ? 'up' : 'down' }

  // Signed-out visitors get a welcome hero + a single call to action.
  if (!currentUser) {
    return (
      <div className="nv-dashboard">
        <DashboardHero
          eyebrow="Welcome to NORDVIK"
          name="Your collection, chronicled."
          quote={t ? t('tagline') : 'Track, value, and trade your collectibles.'}
          actions={[{ label: 'Browse the catalogue', primary: true, onClick: handleOpenCatalog }]}
        />
      </div>
    )
  }

  return (
    <div className="nv-dashboard">
      <DashboardHero
        eyebrow={`${timeGreeting || 'Welcome back'},`}
        name={topbarUserName}
        quote="Every collection has a story. What will yours become?"
      />

      <div className="nv-dash-body">
        <section className="nv-stats" aria-label="Collection summary">
          <StatCard
            icon={<IconValue />}
            label="Collection Value"
            value={money(collectionValue)}
            sub="Based on recorded purchase prices"
            spark={valueSeries}
            delta={valueDelta}
          />
          <StatCard
            icon={<IconItems />}
            label="Items Owned"
            value={totalCopies.toLocaleString()}
            sub={`${uniqueItems.toLocaleString()} unique ${uniqueItems === 1 ? 'item' : 'items'}`}
            spark={itemsSeries}
          />
          <CompletionStat userId={currentUser?.id} />
          <StatCard
            icon={<IconSales />}
            label="New This Month"
            value={`+${newThisMonth.toLocaleString()}`}
            sub={newThisMonth === 0 ? 'No new items yet this month' : 'Items added this month'}
          />
        </section>

        <HotItems limit={6} onOpenItem={openCatalogItemById} />

        <section className="nv-bottom-grid" aria-label="Activity and highlights">
          <RecentSales userId={currentUser?.id} onOpenItem={openCatalogItemById} />
          <UpcomingEvents />
        </section>

        {/* Existing configurable home sections preserved, reskinned for the dark canvas. */}
        {homeColumns.length > 0 && (
          <section className="panel-grid" aria-label="Homepage content sections">
            {homeColumns.map((column) => (
              <article key={column.title} className="panel-column">
                <header className="column-head">
                  <h2>{tx(column.title)}</h2>
                  {column.action && (
                    <a href="#" className="column-link">{tx(column.action)}</a>
                  )}
                </header>
                <div className={`cards cards-${column.variant}`}>
                  {Array.from({ length: column.cards }).map((_, index) => (
                    <div key={`${column.title}-${index}`} className="card-placeholder">
                      {settingsHomeShowEmptyStateHints && column.showMessage && (
                        <span>{tx('No purchases yet')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
