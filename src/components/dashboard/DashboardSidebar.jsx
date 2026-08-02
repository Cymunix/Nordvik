// Fixed dark NORDVIK sidebar — shared app chrome.
// Navigation is wired to the existing App handlers; nothing here owns
// data or routing state itself. Profile/account lives at the bottom.
import {
  IconDashboard,
  IconCollection,
  IconCatalogue,
  IconWishlist,
  IconStores,
  IconSales,
  IconMuseum,
  IconCommunity,
  IconFriends,
  IconLeaderboard,
  IconAchievements,
  IconNews,
  IconResources,
} from './icons'

export default function DashboardSidebar({
  activeScreen,
  currentUser,
  accountName,
  accountTier,
  avatarImage,
  avatarFallback,
  onBrand,
  onDashboard,
  onCollection,
  onCatalogue,
  onWishlist,
  onStores,
  onSalesEvents,
  onMuseum,
  onCommunity,
  onFriends,
  onLeaderboards,
  onAchievements,
  onNews,
  onResources,
  onProfile,
  onSettings,
  onSignOut,
  onSignIn,
  onGoPro,
  showProCard = true,
  level,
  role,
  xpPct = 0,
  xpLabel,
}) {
  // Primary collection-management group.
  const items = [
    { key: 'dashboard', label: 'Dashboard', Icon: IconDashboard, onClick: onDashboard, active: activeScreen === 'dashboard' },
    { key: 'catalogue', label: 'Catalogue', Icon: IconCatalogue, onClick: onCatalogue, active: activeScreen === 'catalogue' },
    { key: 'collection', label: 'My Collection', Icon: IconCollection, onClick: onCollection, active: activeScreen === 'collection' },
    { key: 'wishlist', label: 'Wishlist', Icon: IconWishlist, onClick: onWishlist, active: activeScreen === 'wishlist' },
    { key: 'stores', label: 'Stores', Icon: IconStores, onClick: onStores, active: activeScreen === 'stores' },
    { key: 'salesEvents', label: 'Sales & Events', Icon: IconSales, onClick: onSalesEvents, active: activeScreen === 'salesEvents' },
    { key: 'museum', label: 'Museum', Icon: IconMuseum, onClick: onMuseum, active: activeScreen === 'museum' },
  ]

  // Community group — separated by a divider below the primary group.
  const communityItems = [
    { key: 'community', label: 'Community', Icon: IconCommunity, onClick: onCommunity, active: activeScreen === 'community' },
    { key: 'friends', label: 'Friends', Icon: IconFriends, onClick: onFriends, active: activeScreen === 'friends' },
    { key: 'leaderboards', label: 'Leaderboards', Icon: IconLeaderboard, onClick: onLeaderboards, active: activeScreen === 'leaderboards' },
    { key: 'achievements', label: 'Achievements', Icon: IconAchievements, onClick: onAchievements, active: activeScreen === 'achievements' },
    { key: 'news', label: 'News', Icon: IconNews, onClick: onNews, active: activeScreen === 'news' },
    { key: 'resources', label: 'Resources', Icon: IconResources, onClick: onResources, active: activeScreen === 'resources' },
  ]

  return (
    <aside className="nv-sidebar" aria-label="Primary navigation">
      <button type="button" className="nv-brand" onClick={onBrand}>
        <span className="nv-brand-mark"><img src="/nordvik-logo.png" alt="NORDVIK" /></span>
        <span className="nv-brand-text">
          <span className="nv-brand-name">NORDVIK</span>
          <span className="nv-brand-tag">YOUR COLLECTION. LEGENDARY.</span>
        </span>
      </button>

      <nav className="nv-nav">
        {items.map(({ key, label, Icon, onClick, active }) => (
          <button
            key={key}
            type="button"
            className={`nv-nav-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={onClick}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <div className="nv-nav-divider" role="separator" />
        {communityItems.map(({ key, label, Icon, onClick, active }) => (
          <button
            key={key}
            type="button"
            className={`nv-nav-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={onClick}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="nv-nav-spacer" />

      {currentUser ? (
        <>
          <button type="button" className="nv-profile-card" onClick={onProfile}>
            <div className="nv-profile-top">
              <span className="nv-avatar nv-avatar-lg" aria-hidden="true">
                {avatarImage ? <img src={avatarImage} alt="" /> : <span>{avatarFallback}</span>}
              </span>
              <span className="nv-account-meta">
                <span className="nv-account-name">{accountName}</span>
                <span className="nv-account-tier">{role || accountTier}</span>
                {Number.isFinite(level) && <span className="nv-account-level">Level {level}</span>}
              </span>
            </div>
            {Number.isFinite(level) && (
              <div className="nv-xp">
                <div className="nv-xp-track"><div className="nv-xp-fill" style={{ width: `${xpPct}%` }} /></div>
                {xpLabel && <span className="nv-xp-label">{xpLabel}</span>}
              </div>
            )}
          </button>

          {showProCard && (
            <div className="nv-pro-card">
              <span className="nv-pro-title">◆ NORDVIK PRO</span>
              <span className="nv-pro-sub">Unlock advanced tools and deeper analytics.</span>
              <button type="button" className="nv-pro-btn" onClick={onGoPro}>Go Pro</button>
            </div>
          )}

          <div className="nv-sidebar-foot">
            <button type="button" onClick={onSettings}>Settings</button>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </>
      ) : (
        <div className="nv-account">
          <button type="button" className="nv-account-signin" onClick={onSignIn}>
            Start collecting
          </button>
        </div>
      )}
    </aside>
  )
}
