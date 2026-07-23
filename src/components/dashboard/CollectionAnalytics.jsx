import React from 'react'
import StatCard from './StatCard'
import { IconValue } from './icons'
import useValueHistory from './useValueHistory'
import CompletionAnalyticsPanel from './CompletionAnalyticsPanel'

// NORDVIK Collection Analytics.
// Principle: never charge to see data the user entered themselves. Free tiers
// show the user's own facts (value, invested, allocation, growth, basic
// insights). Collector+ sells INTELLIGENCE derived from that data (history,
// performance, gains/losses, spending, deep breakdowns). Missing valuation
// data shows "—" / "Not enough valuation data yet", never fabricated numbers.

const ALLOC_DIM_KEY = {
  category: (it) => it.categoryName || 'Uncategorized',
  franchise: (it) => it.franchiseName || 'Unassigned',
  brand: (it) => it.brandName || 'Unassigned',
  location: (it) => it.primaryLocationPath || 'Unassigned',
}

function PlusTag() { return <span className="nv-plus-tag">Collector+</span> }

function LockedCard({ title, blurb, onUpgrade }) {
  return (
    <section className="nv-panel nv-col-block nv-lock" aria-label={`${title} — Collector+`}>
      <div className="nv-lock-body">
        <div className="nv-section-head"><span className="nv-section-title">{title}</span><PlusTag /></div>
        <p className="nv-col-muted nv-lock-blurb">{blurb}</p>
        <button type="button" className="nv-btn nv-btn-primary" onClick={onUpgrade}>Go Collector+</button>
      </div>
    </section>
  )
}

function Section({ title, plus, right, children }) {
  return (
    <section className="nv-panel nv-col-block">
      <div className="nv-section-head">
        <span className="nv-section-title">{title}{plus ? <PlusTag /> : null}</span>
        {right}
      </div>
      {children}
    </section>
  )
}

// Simple line chart. Plots one or two chronological numeric series.
function LineChart({ a, b, colorA = 'var(--nv-cyan)', colorB = 'var(--nv-gold)', height = 130 }) {
  const all = [...(a || []), ...(b || [])]
  if (!a || a.length < 2) {
    return <p className="nv-col-muted">Not enough history yet — your collection value is recorded once a day, so a trend appears over time.</p>
  }
  const w = 600
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const toPath = (s) => s.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (s.length - 1)) * w).toFixed(1)},${(height - ((v - min) / span) * (height - 10) - 5).toFixed(1)}`).join(' ')
  return (
    <svg className="nv-chart" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trend chart">
      {b && b.length > 1 && <path d={toPath(b)} fill="none" stroke={colorB} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />}
      <path d={toPath(a)} fill="none" stroke={colorA} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function CollectionAnalytics({ scope }) {
  const {
    currentUser, isCollectorPlusMember, isPlatformAdmin, handleOpenPlans,
    formatUsd, formatPercentValue,
    overallCollectionValue, overallTotalInvested, overallProfitLoss, overallRoi,
    customCollectionPerformance,
    mostValuableItem, largestGainItem, largestLossItem, monthlyAnalytics,
    filteredCollectionItems, collectionSummary,
  } = scope

  const hasPlus = Boolean(isCollectorPlusMember || isPlatformAdmin)
  const upgrade = handleOpenPlans

  const items = filteredCollectionItems
  const hasMarket = Number(collectionSummary.totalValue) > 0
  const money = (v) => formatUsd(v)

  // ── Value / growth history (real snapshots) ──
  const { history } = useValueHistory(currentUser?.id, collectionSummary.totalValue, collectionSummary.totalCopies)
  const [valueRange, setValueRange] = React.useState('30') // days or 'all'
  const rangeDays = valueRange === 'all' ? Infinity : Number(valueRange)
  // Reference "now" from the latest snapshot date (pure) rather than Date.now().
  const refTime = history.length ? new Date(history[history.length - 1].snapshot_date).getTime() : 0
  const cutoff = refTime - rangeDays * 86400000
  const scoped = hasPlus
    ? history.filter((h) => rangeDays === Infinity || new Date(h.snapshot_date).getTime() >= cutoff)
    : history.slice(-30)
  const valueLine = scoped.map((h) => Number(h.total_value) || 0)
  const investedLine = scoped.map(() => Number(overallTotalInvested) || 0) // flat invested reference
  const itemsLine = scoped.map((h) => Number(h.total_items) || 0)

  // ── Allocation ──
  const [allocMetric, setAllocMetric] = React.useState('value') // value | items
  const [allocDim, setAllocDim] = React.useState('category')    // category | collection | franchise | brand | location
  const allocation = React.useMemo(() => {
    if (allocDim === 'collection') {
      return customCollectionPerformance.map((c) => ({
        name: c.name,
        metric: allocMetric === 'value' ? Number(c.currentMarketValue) || 0 : Number(c.itemCount) || 0,
      }))
    }
    const key = ALLOC_DIM_KEY[allocDim]
    const map = {}
    for (const it of items) {
      const k = key(it)
      const m = allocMetric === 'value' ? Number(it.currentMarketValue) || 0 : 1
      map[k] = (map[k] || 0) + m
    }
    return Object.entries(map).map(([name, metric]) => ({ name, metric }))
  }, [allocDim, allocMetric, items, customCollectionPerformance])
  const allocTotal = allocation.reduce((s, r) => s + r.metric, 0)
  const allocRows = allocation
    .map((r) => ({ ...r, percent: allocTotal > 0 ? (r.metric / allocTotal) * 100 : 0 }))
    .sort((a, b) => b.metric - a.metric)

  // ── Growth ──
  const [growthMetric, setGrowthMetric] = React.useState('items')
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const newThisMonth = items.filter((it) => it.latestAddedAt && new Date(it.latestAddedAt).getTime() >= monthStart).length
  const categoriesCollected = new Set(items.map((it) => it.categoryName).filter(Boolean)).size

  // ── Item-level performance (Collector+) ──
  const perfRows = items
    .map((it) => {
      const invested = Number(it.totalInvested) || 0
      const value = Number(it.currentMarketValue) || 0
      return { name: it.name, invested, value, gain: value - invested, roi: invested > 0 ? ((value - invested) / invested) * 100 : null, category: it.categoryName || 'Uncategorized' }
    })
    .filter((r) => r.invested > 0 && Number(r.value) >= 0 && hasMarket)
  const [wlTab, setWlTab] = React.useState('gainers')
  const winners = [...perfRows].sort((a, b) => b.gain - a.gain).slice(0, 8)
  const losers = [...perfRows].sort((a, b) => a.gain - b.gain).slice(0, 8)
  const wlRows = wlTab === 'gainers' ? winners : losers

  // ── Category performance (Collector+) ──
  const catPerf = React.useMemo(() => {
    const map = {}
    for (const it of items) {
      const k = it.categoryName || 'Uncategorized'
      if (!map[k]) map[k] = { name: k, invested: 0, value: 0, unique: 0 }
      map[k].invested += Number(it.totalInvested) || 0
      map[k].value += Number(it.currentMarketValue) || 0
      map[k].unique += 1
    }
    return Object.values(map).map((c) => ({ ...c, gain: c.value - c.invested, roi: c.invested > 0 ? ((c.value - c.invested) / c.invested) * 100 : null })).sort((a, b) => b.value - a.value)
  }, [items])

  // ── Insights ──
  const categoryCounts = {}
  for (const it of items) { const k = it.categoryName || 'Uncategorized'; categoryCounts[k] = (categoryCounts[k] || 0) + 1 }
  const mostCollectedCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]
  const largestCollection = [...customCollectionPerformance].sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0))[0]
  const mostRecent = [...items].filter((it) => it.latestAddedAt).sort((a, b) => String(b.latestAddedAt).localeCompare(String(a.latestAddedAt)))[0]
  const bestCategory = [...catPerf].filter((c) => c.roi != null).sort((a, b) => b.roi - a.roi)[0]
  const bestCollection = [...customCollectionPerformance].filter((c) => c.roi != null).sort((a, b) => b.roi - a.roi)[0]
  const bestItem = [...perfRows].filter((r) => r.roi != null).sort((a, b) => b.roi - a.roi)[0]

  // ── Acquisition analytics (Collector+) ──
  const avgCost = collectionSummary.totalCopies > 0 ? overallTotalInvested / collectionSummary.totalCopies : 0
  const mostExpensive = [...items].sort((a, b) => (Number(b.totalInvested) || 0) - (Number(a.totalInvested) || 0))[0]
  const monthsTracked = monthlyAnalytics.length || 1
  const avgPerMonth = Math.round(collectionSummary.totalCopies / monthsTracked)

  const signed = (v) => `${v >= 0 ? '+' : ''}${money(v)}`
  const signedPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${formatPercentValue(v)}`)

  return (
    <div className="nv-col-overview">
      {/* 1. Portfolio Summary — Free */}
      <section className="nv-stats nv-col-portfolio" aria-label="Portfolio summary">
        <StatCard icon={<IconValue />} label="Collection Value" value={hasMarket ? money(overallCollectionValue) : '—'} sub={hasMarket ? 'Current market estimate' : 'No valuation data yet'} />
        <StatCard icon={<IconValue />} label="Total Invested" value={money(overallTotalInvested)} sub="Recorded acquisition cost" />
        <StatCard icon={<IconValue />} label="Profit / Loss" value={hasMarket ? signed(overallProfitLoss) : '—'} sub={hasMarket ? (overallProfitLoss >= 0 ? 'Unrealised gain' : 'Unrealised loss') : 'Needs valuation data'} />
        <StatCard icon={<IconValue />} label="ROI" value={hasMarket ? signedPct(overallRoi) : '—'} sub={hasMarket ? 'Return on investment' : 'Needs valuation data'} />
      </section>

      {/* 2. Collection Value Over Time — Free (30d) + Collector+ (ranges + invested) */}
      <Section
        title="Collection Value Over Time"
        right={hasPlus ? (
          <div className="nv-col-seg">
            {['30', '90', '180', '365', 'all'].map((r) => (
              <button key={r} type="button" className={`nv-col-seg-btn${valueRange === r ? ' is-active' : ''}`} onClick={() => setValueRange(r)}>
                {r === 'all' ? 'ALL' : r === '30' ? '1M' : r === '90' ? '3M' : r === '180' ? '6M' : '1Y'}
              </button>
            ))}
          </div>
        ) : null}
      >
        <LineChart a={valueLine} b={hasPlus ? investedLine : null} />
        <div className="nv-chart-legend">
          <span className="nv-chart-key nv-key-a">Value</span>
          {hasPlus && <span className="nv-chart-key nv-key-b">Invested</span>}
          {!hasPlus && <span className="nv-col-muted">Full history &amp; ranges (1M–ALL) with Collector+.</span>}
        </div>
      </Section>

      {/* 3. Portfolio Allocation — Free (category/collection) + Collector+ (deep) */}
      <Section
        title="Portfolio Allocation"
        right={
          <div className="nv-col-alloc-controls">
            <div className="nv-col-seg">
              <button type="button" className={`nv-col-seg-btn${allocMetric === 'value' ? ' is-active' : ''}`} onClick={() => setAllocMetric('value')}>Value</button>
              <button type="button" className={`nv-col-seg-btn${allocMetric === 'items' ? ' is-active' : ''}`} onClick={() => setAllocMetric('items')}>Items</button>
            </div>
            <select className="nv-col-select" value={allocDim} onChange={(e) => setAllocDim(e.target.value)} aria-label="Break down by">
              <option value="category">By Category</option>
              <option value="collection">By Collection</option>
              {hasPlus && <option value="franchise">By Franchise</option>}
              {hasPlus && <option value="brand">By Brand</option>}
              {hasPlus && <option value="location">By Location</option>}
            </select>
          </div>
        }
      >
        {allocRows.length === 0 ? <p className="nv-col-muted">No allocation data yet.</p> : (
          <div className="nv-col-alloc">
            {allocRows.map((r) => (
              <div key={`al-${r.name}`} className="nv-col-alloc-row">
                <div className="nv-col-alloc-head"><strong>{r.name}</strong><span>{r.percent.toFixed(1)}%</span></div>
                <div className="nv-col-bar"><span style={{ width: `${Math.min(r.percent, 100)}%` }} /></div>
                <p className="nv-col-row-meta">{allocMetric === 'value' ? money(r.metric) : `${r.metric} ${r.metric === 1 ? 'item' : 'items'}`}</p>
              </div>
            ))}
          </div>
        )}
        {!hasPlus && <p className="nv-col-muted nv-col-lock-inline">Franchise, brand &amp; storage-location breakdowns unlock with Collector+.</p>}
      </Section>

      {/* 4. Collection Growth — Free */}
      <Section
        title="Collection Growth"
        right={
          <div className="nv-col-seg">
            <button type="button" className={`nv-col-seg-btn${growthMetric === 'items' ? ' is-active' : ''}`} onClick={() => setGrowthMetric('items')}>Items</button>
            <button type="button" className={`nv-col-seg-btn${growthMetric === 'value' ? ' is-active' : ''}`} onClick={() => setGrowthMetric('value')}>Value</button>
          </div>
        }
      >
        <div className="nv-col-growth-stats">
          <div><span>Unique Items</span><strong>{collectionSummary.uniqueItems.toLocaleString()}</strong></div>
          <div><span>Total Copies</span><strong>{collectionSummary.totalCopies.toLocaleString()}</strong></div>
          <div><span>New This Month</span><strong>+{newThisMonth.toLocaleString()}</strong></div>
          <div><span>Categories</span><strong>{categoriesCollected}</strong></div>
        </div>
        <LineChart a={growthMetric === 'items' ? itemsLine : valueLine} />
        {!hasPlus && <p className="nv-col-muted nv-col-lock-inline">Showing the last 30 days. Full historical growth with Collector+.</p>}
      </Section>

      {/* 5. Acquisition Analytics — Collector+ */}
      {hasPlus ? (
        <Section title="Acquisition Analytics" plus>
          <div className="nv-col-growth-stats">
            <div><span>Total Spent</span><strong>{money(overallTotalInvested)}</strong></div>
            <div><span>Avg Acquisition Cost</span><strong>{money(avgCost)}</strong></div>
            <div><span>Acquisitions</span><strong>{collectionSummary.totalCopies.toLocaleString()}</strong></div>
            <div><span>Avg / Month</span><strong>{avgPerMonth}</strong></div>
          </div>
          <div className="nv-col-insight" style={{ marginTop: 12 }}>
            <span>Most Expensive Acquisition</span>
            <strong>{mostExpensive ? `${mostExpensive.name} · ${money(mostExpensive.totalInvested)}` : 'N/A'}</strong>
          </div>
          {monthlyAnalytics.length > 0 && (
            <div className="nv-col-months">
              {monthlyAnalytics.slice(-6).map((m) => (
                <div key={`sp-${m.label}`} className="nv-col-month"><span>{m.label}</span><strong>{money(m.investedValue)}</strong></div>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <LockedCard title="Acquisition Analytics" onUpgrade={upgrade}
          blurb="See total spent over time, average acquisition cost, spending by month, category and collection — e.g. how much you invested in the last 12 months." />
      )}

      {/* 6. Collection Insights — Free basics + Collector+ */}
      <Section title="Collection Insights">
        <div className="nv-col-insights">
          <div className="nv-col-insight"><span>Most Valuable Item</span><strong>{hasMarket && mostValuableItem ? `${mostValuableItem.name} · ${money(mostValuableItem.currentMarketValue)}` : (mostValuableItem ? mostValuableItem.name : '—')}</strong></div>
          <div className="nv-col-insight"><span>Most Collected Category</span><strong>{mostCollectedCategory ? `${mostCollectedCategory[0]} · ${mostCollectedCategory[1]} items` : '—'}</strong></div>
          <div className="nv-col-insight"><span>Largest Collection</span><strong>{largestCollection ? `${largestCollection.name} · ${largestCollection.itemCount} items` : '—'}</strong></div>
          <div className="nv-col-insight"><span>Most Recently Added</span><strong>{mostRecent ? mostRecent.name : '—'}</strong></div>
        </div>
      </Section>
      {hasPlus ? (
        <Section title="Performance Insights" plus>
          {!hasMarket ? <p className="nv-col-muted">Not enough valuation data yet.</p> : (
            <div className="nv-col-insights">
              <div className="nv-col-insight"><span>Biggest Gain</span><strong>{largestGainItem ? `${largestGainItem.name} · ${signed(largestGainItem.profitLoss)}` : '—'}</strong></div>
              <div className="nv-col-insight"><span>Biggest Loss</span><strong>{largestLossItem ? `${largestLossItem.name} · ${signed(largestLossItem.profitLoss)}` : '—'}</strong></div>
              <div className="nv-col-insight"><span>Best-Performing Item</span><strong>{bestItem ? `${bestItem.name} · ${signedPct(bestItem.roi)}` : '—'}</strong></div>
              <div className="nv-col-insight"><span>Best-Performing Category</span><strong>{bestCategory ? `${bestCategory.name} · ${signedPct(bestCategory.roi)}` : '—'}</strong></div>
              <div className="nv-col-insight"><span>Best-Performing Collection</span><strong>{bestCollection ? `${bestCollection.name} · ${signedPct(bestCollection.roi)}` : '—'}</strong></div>
            </div>
          )}
        </Section>
      ) : (
        <LockedCard title="Performance Insights" onUpgrade={upgrade}
          blurb="Biggest gains and losses, best-performing item, category and collection, and your best purchases by acquisition price vs current value." />
      )}

      {/* 7. Winners & Losers — Collector+ */}
      {hasPlus ? (
        <Section title="Winners & Losers" plus right={
          <div className="nv-col-seg">
            <button type="button" className={`nv-col-seg-btn${wlTab === 'gainers' ? ' is-active' : ''}`} onClick={() => setWlTab('gainers')}>Top Gainers</button>
            <button type="button" className={`nv-col-seg-btn${wlTab === 'losers' ? ' is-active' : ''}`} onClick={() => setWlTab('losers')}>Top Losers</button>
          </div>
        }>
          {wlRows.length === 0 ? <p className="nv-col-muted">Not enough valuation data yet.</p> : (
            <table className="nv-col-table">
              <thead><tr><th>Item</th><th>Paid</th><th>Current</th><th>Gain/Loss</th><th>ROI</th></tr></thead>
              <tbody>
                {wlRows.map((r, i) => (
                  <tr key={`wl-${i}`}>
                    <td className="nv-col-table-name">{r.name}</td>
                    <td>{money(r.invested)}</td>
                    <td>{money(r.value)}</td>
                    <td className={r.gain >= 0 ? 'pos' : 'neg'}>{signed(r.gain)}</td>
                    <td className={r.roi >= 0 ? 'pos' : 'neg'}>{signedPct(r.roi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      ) : (
        <LockedCard title="Winners & Losers" onUpgrade={upgrade}
          blurb="Your top gainers and losers ranked by NORDVIK's pricing data — paid vs current value, gain/loss and ROI per item." />
      )}

      {/* 8. Category Performance — Collector+ */}
      {hasPlus ? (
        <Section title="Category Performance" plus>
          {!hasMarket ? <p className="nv-col-muted">Not enough valuation data yet.</p> : (
            <table className="nv-col-table">
              <thead><tr><th>Category</th><th>Unique</th><th>Invested</th><th>Value</th><th>Gain</th><th>ROI</th></tr></thead>
              <tbody>
                {catPerf.map((c) => (
                  <tr key={`cp-${c.name}`}>
                    <td className="nv-col-table-name">{c.name}</td>
                    <td>{c.unique}</td>
                    <td>{money(c.invested)}</td>
                    <td>{money(c.value)}</td>
                    <td className={c.gain >= 0 ? 'pos' : 'neg'}>{signed(c.gain)}</td>
                    <td className={c.roi >= 0 ? 'pos' : 'neg'}>{signedPct(c.roi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      ) : (
        <LockedCard title="Category Performance" onUpgrade={upgrade}
          blurb="Invested, value, gain and ROI for every category — then drill into your taxonomy (e.g. Building Blocks → LEGO → Star Wars)." />
      )}

      {/* 9. Custom Collection Performance — Free basics + Collector+ */}
      <Section title="Custom Collection Performance" right={!hasPlus ? <PlusTag /> : null}>
        {customCollectionPerformance.length === 0 ? <p className="nv-col-muted">Create custom collections to track them here.</p> : (
          <table className="nv-col-table">
            <thead><tr><th>Collection</th><th>Items</th><th>Value</th>{hasPlus && <th>Invested</th>}{hasPlus && <th>P/L</th>}{hasPlus && <th>ROI</th>}</tr></thead>
            <tbody>
              {customCollectionPerformance.map((c) => (
                <tr key={`ccp-${c.id}`}>
                  <td className="nv-col-table-name">{c.name}</td>
                  <td>{c.itemCount}</td>
                  <td>{hasMarket ? money(c.currentMarketValue) : '—'}</td>
                  {hasPlus && <td>{money(c.totalInvested)}</td>}
                  {hasPlus && <td className={(c.currentMarketValue - c.totalInvested) >= 0 ? 'pos' : 'neg'}>{hasMarket ? signed(c.currentMarketValue - c.totalInvested) : '—'}</td>}
                  {hasPlus && <td className={(c.roi || 0) >= 0 ? 'pos' : 'neg'}>{signedPct(c.roi)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!hasPlus && <p className="nv-col-muted nv-col-lock-inline">Invested, profit/loss, ROI and historical performance per collection unlock with Collector+.</p>}
      </Section>

      {/* 10. Completion Analytics — Collector+ */}
      {hasPlus ? (
        <CompletionAnalyticsPanel userId={currentUser?.id} formatUsd={formatUsd} />
      ) : (
        <LockedCard title="Completion Analytics" onUpgrade={upgrade}
          blurb={'Track collections closest to completion and the estimated cost to complete them — e.g. "You’re 3 items away. Estimated cost: $127."'} />
      )}
    </div>
  )
}
