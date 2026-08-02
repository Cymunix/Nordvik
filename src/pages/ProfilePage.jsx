import React from 'react'
import { supabase } from '../lib/supabaseClient'

/* ── helpers ── */
const storageImg = (path) =>
  path
    ? (path.startsWith('http')
        ? path
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/item-images/${path}`)
    : null

const itemLabel = (item) =>
  [item.subject, item.print_type, item.card_number ? `#${item.card_number}` : null].filter(Boolean).join(' — ')
  || item.collectible_set || 'Item'

export default function ProfilePage({ scope }) {
  const {
    PROFILE_ACHIEVEMENTS,
    catalogCategories,
    currentUser,
    friendSearchLoading,
    friendSearchQuery,
    friendSearchResults,
    handleAcceptFriendRequest,
    handleDeclineFriendRequest,
    handleFriendSearch,
    handleOpenProfileItem,
    handleRemoveFriend,
    handleSendFriendRequest,
    isFriendSearchOpen,
    openAuth,
    profile,
    profileFriendRequests,
    profileFriends,
    profileIsLoading,
    profileMostValuable,
    profileRecentItems,
    profileSentToIds,
    profileStats,
    setCurrentScreen,
    setFriendSearchQuery,
    setFriendSearchResults,
    setIsFriendSearchOpen,
  } = scope

  const [activeTab, setActiveTab] = React.useState('overview')
  const favStripRef = React.useRef(null)
  // Catalogue-wide item total — denominator for the "how much of everything do
  // I have" bars.
  const [catalogItemTotal, setCatalogItemTotal] = React.useState(0)
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { count } = await supabase.from('items').select('item_id', { count: 'exact', head: true })
      if (!cancelled) setCatalogItemTotal(count || 0)
    })().catch(() => { /* leave at 0 → bars show the raw count */ })
    return () => { cancelled = true }
  }, [])

  // Sets = what the Completion feature tracks: a "Set" is a Property (the group
  // an item appears in — item_properties), NOT the sparse legacy collectible_sets
  // table. A set is "completed" when the user owns every catalogue item in it.
  const [setStats, setSetStats] = React.useState({ completed: 0, total: 0 })
  React.useEffect(() => {
    if (!currentUser?.id) { setSetStats({ completed: 0, total: 0 }); return }
    let cancelled = false
    ;(async () => {
      const { data: owned } = await supabase
        .from('owned_copies').select('catalog_item_id').eq('user_id', currentUser.id)
      const ownedSet = new Set((owned || []).map(r => r.catalog_item_id).filter(Boolean))

      const totalByProp = new Map()
      const ownedByProp = new Map()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('item_properties').select('item_id, property_id').range(from, from + 999)
        if (error || !data || !data.length) break
        for (const row of data) {
          totalByProp.set(row.property_id, (totalByProp.get(row.property_id) || 0) + 1)
          if (ownedSet.has(row.item_id)) ownedByProp.set(row.property_id, (ownedByProp.get(row.property_id) || 0) + 1)
        }
        if (data.length < 1000) break
      }
      let completed = 0
      for (const [pid, total] of totalByProp) {
        if (total > 0 && (ownedByProp.get(pid) || 0) >= total) completed += 1
      }
      if (!cancelled) setSetStats({ completed, total: totalByProp.size })
    })().catch(() => { /* leave at 0 */ })
    return () => { cancelled = true }
  }, [currentUser?.id])

  if (!currentUser || !profile) {
    return (
      <section className="nv-profile" aria-label="My Profile">
        <div className="nv-profile-empty">
          <p className="subtitle">Sign in to view your profile.</p>
          <button type="button" className="auth-submit" onClick={() => openAuth('signin')}>Log in</button>
        </div>
      </section>
    )
  }

  const displayName = profile.display_name || currentUser.email?.split('@')[0] || 'Collector'
  const tierLabel = profile.subscription_tier
    ? profile.subscription_tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Collector'
  const avatarInitial = (displayName || '?')[0].toUpperCase()

  const joinDate = currentUser.created_at ? new Date(currentUser.created_at) : null
  const joinLabel = joinDate
    ? joinDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null
  const joinedAgo = (() => {
    if (!joinDate) return null
    const months = Math.max(0, Math.round((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    if (months < 1) return 'Joined recently'
    if (months < 12) return `Joined ${months} month${months === 1 ? '' : 's'} ago`
    const years = Math.floor(months / 12)
    return `Joined ${years} year${years === 1 ? '' : 's'} ago`
  })()

  const stats = profileStats
  const unlockedAch = stats ? PROFILE_ACHIEVEMENTS.filter(a => a.check(stats)) : []
  const totalItems = stats?.totalItems ?? 0
  const uniqueItems = stats?.uniqueItems ?? 0
  const totalValue = stats?.totalValue ?? 0
  const wishlistCount = stats?.wishlistCount ?? 0
  const categoryBreakdown = stats?.categoryBreakdown || []
  const collectionsCount = categoryBreakdown.length
  const setsCompleted = setStats.completed

  const catName = (catId) => catalogCategories.find(c => c.id === catId)?.name || 'Unknown'
  const goto = (screen) => () => setCurrentScreen(screen)

  const favItems = (profileMostValuable?.length ? profileMostValuable : profileRecentItems || []).slice(0, 12)
  const scrollFav = (dir) => () => {
    const el = favStripRef.current
    if (el) el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' })
  }

  const headerStats = [
    { val: collectionsCount.toLocaleString(), lbl: 'Collections' },
    { val: setsCompleted.toLocaleString(), lbl: 'Sets Completed' },
    { val: `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, lbl: 'Collection Value' },
    { val: `${unlockedAch.length} / ${PROFILE_ACHIEVEMENTS.length}`, lbl: 'Achievements' },
  ]

  // Real overview: each row is "what you have" out of "what exists".
  const overviewRows = [
    { key: 'items', label: 'Items Owned', value: uniqueItems, target: catalogItemTotal, fill: 'items' },
    { key: 'sets', label: 'Sets Completed', value: setsCompleted, target: setStats.total, fill: 'sets' },
    { key: 'wish', label: 'Wishlist Items', value: wishlistCount, target: catalogItemTotal, fill: 'wish' },
    { key: 'ach', label: 'Achievements', value: unlockedAch.length, target: PROFILE_ACHIEVEMENTS.length, fill: 'ach' },
  ]

  const tabs = [
    { key: 'overview', label: 'Overview', ico: '📊' },
    { key: 'collection', label: 'Collection Overview', ico: '🗂️' },
    { key: 'achievements', label: 'Achievements', ico: '🏆' },
    { key: 'wishlist', label: 'Wishlist', ico: '❤️' },
    { key: 'friends', label: 'Friends', ico: '👥' },
    { key: 'activity', label: 'Activity', ico: '📡' },
  ]

  /* ── reusable blocks ── */
  const FriendsPanel = (
    <div className="nv-panel">
      <div className="nv-panel-head">
        <h2 className="nv-panel-title"><span className="nvp-ico">👥</span> Friends{profileFriends.length ? ` (${profileFriends.length})` : ''}</h2>
        <button type="button" className="nv-panel-link" onClick={() => { setIsFriendSearchOpen(s => !s); setFriendSearchQuery(''); setFriendSearchResults([]) }}>
          {isFriendSearchOpen ? 'Cancel' : 'View All Friends'}
        </button>
      </div>

      {profileFriendRequests.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p className="nv-profile-muted" style={{ padding: '0 2px 6px' }}>{profileFriendRequests.length} pending {profileFriendRequests.length === 1 ? 'request' : 'requests'}</p>
          {profileFriendRequests.map(req => (
            <div key={req.friendshipId} className="nv-friend-row">
              <div className="nv-friend-av">{req.avatar_url ? <img src={req.avatar_url} alt="" /> : <span>{(req.display_name || '?')[0].toUpperCase()}</span>}</div>
              <div className="nv-friend-main"><div className="nv-friend-name">{req.display_name || 'Unknown'}</div></div>
              <button type="button" className="nv-panel-link" onClick={() => handleAcceptFriendRequest(req)}>Accept</button>
              <button type="button" className="nv-panel-link" onClick={() => handleDeclineFriendRequest(req.friendshipId)}>Decline</button>
            </div>
          ))}
        </div>
      )}

      {isFriendSearchOpen && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            className="profile-friend-search-input"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, background: '#0e1620', border: '1px solid rgba(120,150,190,0.16)', color: '#e8eef6' }}
            placeholder="Search by display name…"
            value={friendSearchQuery}
            onChange={e => handleFriendSearch(e.target.value)}
            autoFocus
          />
          {friendSearchLoading && <p className="nv-profile-muted">Searching…</p>}
          {!friendSearchLoading && friendSearchQuery && friendSearchResults.length === 0 && <p className="nv-profile-muted">No users found.</p>}
          {friendSearchResults.map(user => {
            const alreadyFriend = profileFriends.some(f => f.userId === user.id)
            const sent = profileSentToIds.has(user.id) || user._sent
            const incoming = profileFriendRequests.some(r => r.userId === user.id)
            return (
              <div key={user.id} className="nv-friend-row">
                <div className="nv-friend-av">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{(user.display_name || '?')[0].toUpperCase()}</span>}</div>
                <div className="nv-friend-main"><div className="nv-friend-name">{user.display_name || 'Unknown'}</div></div>
                {alreadyFriend ? <span className="nv-friend-sub">Friends</span>
                  : incoming ? <span className="nv-friend-sub">Requested you</span>
                  : sent ? <span className="nv-friend-sub">Request sent</span>
                  : <button type="button" className="nv-panel-link" onClick={() => handleSendFriendRequest(user.id)}>Add Friend</button>}
              </div>
            )
          })}
        </div>
      )}

      {profileFriends.length > 0 ? (
        profileFriends.map(friend => (
          <div key={friend.friendshipId} className="nv-friend-row">
            <div className="nv-friend-av">{friend.avatar_url ? <img src={friend.avatar_url} alt="" /> : <span>{(friend.display_name || '?')[0].toUpperCase()}</span>}</div>
            <div className="nv-friend-main">
              <div className="nv-friend-name">{friend.display_name || 'Unknown'}</div>
              <div className="nv-friend-sub">Collector</div>
            </div>
            <button type="button" className="nv-friend-chevron" title="Remove friend" onClick={() => handleRemoveFriend(friend.friendshipId, friend.userId)}>✕</button>
          </div>
        ))
      ) : !isFriendSearchOpen && profileFriendRequests.length === 0 && (
        <p className="nv-profile-muted">No friends yet — use View All Friends to connect with other collectors.</p>
      )}

      <button type="button" className="nv-rail-find" onClick={() => { setIsFriendSearchOpen(true); setFriendSearchQuery(''); setFriendSearchResults([]) }}>
        ＋ Find Friends
      </button>
    </div>
  )

  const AchievementsPanel = (full) => {
    const list = full ? PROFILE_ACHIEVEMENTS : unlockedAch.slice(0, 4)
    return (
      <div className="nv-panel">
        <div className="nv-panel-head">
          <h2 className="nv-panel-title"><span className="nvp-ico">🏆</span> {full ? 'Achievements' : 'Recent Achievements'}</h2>
          {!full && <button type="button" className="nv-panel-link" onClick={() => setActiveTab('achievements')}>View All</button>}
          {full && <span className="nv-profile-muted" style={{ padding: 0 }}>{unlockedAch.length} / {PROFILE_ACHIEVEMENTS.length} unlocked</span>}
        </div>
        {full ? (
          <div className="nv-ach-grid">
            {PROFILE_ACHIEVEMENTS.map(a => {
              const on = stats ? a.check(stats) : false
              return (
                <div key={a.id} className={`nv-ach-card${on ? ' is-on' : ''}`} title={a.desc}>
                  <div className="nv-ach-card-ico">{on ? a.icon : '🔒'}</div>
                  <div className="nv-ach-card-name">{a.name}</div>
                  <div className="nv-ach-card-desc">{a.desc}</div>
                </div>
              )
            })}
          </div>
        ) : list.length ? list.map(a => (
          <div key={a.id} className="nv-ach-row">
            <div className="nv-ach-badge">{a.icon}</div>
            <div className="nv-ach-main">
              <div className="nv-ach-name">{a.name}</div>
              <div className="nv-ach-desc">{a.desc}</div>
            </div>
          </div>
        )) : <p className="nv-profile-muted">No achievements unlocked yet.</p>}
      </div>
    )
  }

  const QuickActions = (
    <div className="nv-panel">
      <div className="nv-panel-head"><h2 className="nv-panel-title"><span className="nvp-ico">⚡</span> Quick Actions</h2></div>
      <div className="nv-qa-list">
        <button type="button" className="nv-qa-btn" onClick={goto('collection')}><span className="nv-qa-ico nv-qa-ico--add">＋</span> Add New Item</button>
        <button type="button" className="nv-qa-btn" onClick={goto('collection')}><span className="nv-qa-ico nv-qa-ico--scan">▦</span> Scan Barcode / UPC</button>
        <button type="button" className="nv-qa-btn" onClick={goto('wishlist')}><span className="nv-qa-ico nv-qa-ico--wish">♥</span> View Wishlist</button>
        <button type="button" className="nv-qa-btn" onClick={goto('catalog')}><span className="nv-qa-ico nv-qa-ico--browse">▤</span> Browse Catalog</button>
      </div>
    </div>
  )

  const CollectionOverviewPanel = (
    <div className="nv-panel">
      <div className="nv-panel-head">
        <h2 className="nv-panel-title"><span className="nvp-ico">📊</span> Collection Overview</h2>
        <button type="button" className="nv-panel-link" onClick={() => setActiveTab('collection')}>View Details</button>
      </div>
      <div className="nv-ov-list">
        {overviewRows.map(row => {
          const pct = row.target > 0 ? Math.min(100, Math.round((row.value / row.target) * 100)) : 0
          return (
            <div key={row.key} className="nv-ov-row">
              <span className="nv-ov-label">{row.label}</span>
              <div className="nv-ov-track"><div className={`nv-ov-fill nv-ov-fill--${row.fill}`} style={{ width: `${pct}%` }} /></div>
              <span className="nv-ov-vals">
                <strong>{row.value.toLocaleString()}</strong>{row.target > 0 ? ` / ${row.target.toLocaleString()}` : ''}
                <span className="nv-ov-pct">{pct}%</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <section className="nv-profile" aria-label="My Profile">
      {/* ── Identity header ── */}
      <div className="nv-profile-header">
        <button type="button" className="nv-profile-edit-btn" onClick={goto('settings')}>✎ Edit Profile</button>
        <div className="nv-profile-header-row">
          <div className="nv-profile-avatar">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="avatar" /> : avatarInitial}
            <span className="nv-profile-avatar-edit" onClick={goto('settings')} role="button" aria-label="Edit avatar">✎</span>
          </div>
          <div className="nv-profile-id">
            <h1 className="nv-profile-name">{displayName}</h1>
            <p className="nv-profile-title">{tierLabel}</p>
            <div className="nv-profile-meta">
              {joinLabel && <div className="nv-profile-meta-row"><span className="nvp-ico">◷</span> Collector since {joinLabel}</div>}
              {profile.location && <div className="nv-profile-meta-row"><span className="nvp-ico">⚲</span> {profile.location}</div>}
              {joinedAgo && <div className="nv-profile-meta-row"><span className="nvp-ico">◴</span> {joinedAgo}</div>}
            </div>
          </div>
          <div className="nv-profile-header-stats">
            {headerStats.map(s => (
              <div key={s.lbl} className="nv-profile-hstat">
                <span className="nv-profile-hstat-val">{s.val}</span>
                <span className="nv-profile-hstat-lbl">{s.lbl}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <nav className="nv-profile-tabs" aria-label="Profile sections">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`nv-profile-tab${activeTab === tab.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="nvp-ico">{tab.ico}</span> {tab.label}
          </button>
        ))}
      </nav>

      {profileIsLoading ? (
        <div className="nv-panel"><p className="nv-profile-muted">Loading stats…</p></div>
      ) : activeTab === 'achievements' ? (
        AchievementsPanel(true)
      ) : activeTab === 'friends' ? (
        FriendsPanel
      ) : activeTab === 'wishlist' ? (
        <div className="nv-panel">
          <div className="nv-panel-head"><h2 className="nv-panel-title"><span className="nvp-ico">❤️</span> Wishlist</h2>
            <button type="button" className="nv-panel-link" onClick={goto('wishlist')}>Open Wishlist</button></div>
          <p className="nv-profile-muted">{wishlistCount.toLocaleString()} item{wishlistCount === 1 ? '' : 's'} on your wishlist.</p>
        </div>
      ) : activeTab === 'activity' ? (
        <div className="nv-panel">
          <div className="nv-panel-head"><h2 className="nv-panel-title"><span className="nvp-ico">📡</span> Activity</h2></div>
          {profileRecentItems?.length ? profileRecentItems.slice(0, 10).map((item, i) => (
            <div key={`${item.item_id}-${i}`} className="nv-ach-row" onClick={() => handleOpenProfileItem(item)} style={{ cursor: 'pointer' }}>
              <div className="nv-ach-badge">＋</div>
              <div className="nv-ach-main">
                <div className="nv-ach-name">Added {itemLabel(item)}</div>
                {item.created_at && <div className="nv-ach-desc">{new Date(item.created_at).toLocaleDateString()}</div>}
              </div>
            </div>
          )) : <p className="nv-profile-muted">No recent activity.</p>}
        </div>
      ) : (
        /* ── Overview & Collection Overview tabs share the dashboard body ── */
        <div className="nv-profile-body">
          <div className="nv-profile-col">
            {/* About Me */}
            <div className="nv-panel">
              <div className="nv-panel-head"><h2 className="nv-panel-title"><span className="nvp-ico">👤</span> About Me</h2></div>
              {profile.bio
                ? String(profile.bio).split('\n').filter(Boolean).map((line, i) => <p key={i} className="nv-about-text">{line}</p>)
                : <p className="nv-about-text">Passionate collector. Tell other collectors about yourself and the grails you’re chasing.</p>}
              <button type="button" className="nv-about-edit" onClick={goto('settings')}>✎ Edit Bio</button>
            </div>

            {CollectionOverviewPanel}

            {/* Favorite Items */}
            <div className="nv-panel">
              <div className="nv-panel-head">
                <h2 className="nv-panel-title"><span className="nvp-ico">★</span> Favorite Items</h2>
                <button type="button" className="nv-panel-link" onClick={goto('collection')}>View All Favorites</button>
              </div>
              {favItems.length ? (
                <div className="nv-fav-wrap">
                  <button type="button" className="nv-fav-arrow nv-fav-arrow--l" onClick={scrollFav(-1)} aria-label="Scroll left">‹</button>
                  <div className="nv-fav-strip" ref={favStripRef}>
                    {favItems.map((item, i) => {
                      const url = storageImg(item.front_image_path)
                      return (
                        <button key={`${item.item_id}-${i}`} type="button" className="nv-fav-card" onClick={() => handleOpenProfileItem(item)}>
                          <div className="nv-fav-thumb">
                            {url ? <img src={url} alt={itemLabel(item)} /> : <span className="nv-fav-thumb-empty">?</span>}
                            <span className="nv-fav-heart">♥</span>
                          </div>
                          <span className="nv-fav-label">{itemLabel(item)}</span>
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" className="nv-fav-arrow nv-fav-arrow--r" onClick={scrollFav(1)} aria-label="Scroll right">›</button>
                </div>
              ) : <p className="nv-profile-muted">No favorites yet.</p>}
            </div>

            {/* My Collections */}
            <div className="nv-panel">
              <div className="nv-panel-head">
                <h2 className="nv-panel-title"><span className="nvp-ico">🗂️</span> My Collections</h2>
                <button type="button" className="nv-panel-link" onClick={goto('collection')}>View All Collections</button>
              </div>
              {categoryBreakdown.length ? (
                <div className="nv-coll-grid">
                  {categoryBreakdown.map(([catId, count]) => {
                    const pct = Math.round((count / (uniqueItems || 1)) * 100)
                    return (
                      <button key={catId} type="button" className="nv-coll-card" onClick={goto('collection')}>
                        <div className="nv-coll-cover">{catName(catId)[0]?.toUpperCase() || '▦'}</div>
                        <div className="nv-coll-body">
                          <p className="nv-coll-name">{catName(catId)}</p>
                          <div className="nv-coll-meta"><span>{count.toLocaleString()} items</span><span className="nv-coll-pct">{pct}%</span></div>
                          <div className="nv-coll-track"><div className="nv-coll-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : <p className="nv-profile-muted">Add items to start building collections.</p>}
            </div>
          </div>

          {/* ── Right rail ── */}
          <div className="nv-profile-col">
            {FriendsPanel}
            {AchievementsPanel(false)}
            {QuickActions}
          </div>
        </div>
      )}
    </section>
  )
}
