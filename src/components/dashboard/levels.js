// Collector XP / Level — a deterministic score derived from the user's REAL
// activity (no stored XP, no fabricated numbers). Canonical earning rules:
export const XP_RULES = {
  uniqueItem: 50,        // each new unique item
  wishlistItem: 50,      // each item added to the wishlist
  achievement: 1000,     // each achievement unlocked
  duplicate: 10,         // each duplicate copy
  firstPhoto: 50,        // adding the first photo to an item
  completeDetails: 25,   // completing an item's details
  set25: 100,            // crossing 25% set completion
  set50: 250,            // crossing 50%
  set75: 500,            // crossing 75%
  setComplete: 1000,     // completing a set (100%)
  sale: 250,             // completing a sale
  eventCheckIn: 250,     // attending / checking into an event
}

// Cumulative milestone XP awarded for a single set at a given completion
// fraction (0..1): each threshold crossed adds its reward.
export function setCompletionMilestoneXp(fraction) {
  let xp = 0
  if (fraction >= 0.25) xp += XP_RULES.set25
  if (fraction >= 0.50) xp += XP_RULES.set50
  if (fraction >= 0.75) xp += XP_RULES.set75
  if (fraction >= 1) xp += XP_RULES.setComplete
  return xp
}

// Total XP from all earners. Inputs with no data source yet default to 0.
export function computeCollectorXp({
  uniqueItems = 0,
  wishlistItems = 0,
  duplicates = 0,
  photosAdded = 0,
  completeDetails = 0,
  setMilestoneXp = 0,
  salesCount = 0,
  eventCheckIns = 0,
}) {
  return Math.round(
    uniqueItems * XP_RULES.uniqueItem +
    wishlistItems * XP_RULES.wishlistItem +
    duplicates * XP_RULES.duplicate +
    photosAdded * XP_RULES.firstPhoto +
    completeDetails * XP_RULES.completeDetails +
    setMilestoneXp +
    salesCount * XP_RULES.sale +
    eventCheckIns * XP_RULES.eventCheckIn,
  )
}

// Cumulative XP required to *reach* each level. Index 0 → Level 1 (0 XP).
// Levels run 1–60; this is the canonical progression table.
const XP_TABLE = [
  0, 800, 1900, 3300, 5300, 7900, 11100, 14900, 19300, 24300,
  30100, 36700, 44100, 52300, 61300, 71100, 81700, 93100, 105300, 118300,
  132100, 146700, 162100, 178300, 195300, 213100, 231700, 251100, 271300, 292300,
  314100, 337100, 361300, 386700, 413300, 441100, 470100, 500300, 531700, 564300,
  598100, 633100, 669300, 706700, 745300, 785100, 826100, 868300, 911700, 958300,
  1002100, 1049100, 1097300, 1146700, 1197300,
]
const MAX_LEVEL = XP_TABLE.length // 55

// Rank names by level band (highest first).
const ROLE_BANDS = [
  { min: 55, label: 'NORDVIK Legend' },
  { min: 51, label: 'Legendary Curator' },
  { min: 46, label: 'Grand Curator' },
  { min: 41, label: 'Master Curator' },
  { min: 36, label: 'Master Collector' },
  { min: 31, label: 'Specialist' },
  { min: 26, label: 'Connoisseur' },
  { min: 21, label: 'Archivist' },
  { min: 16, label: 'Curator' },
  { min: 11, label: 'Collector' },
  { min: 6, label: 'Seeker' },
  { min: 1, label: 'Novice Collector' },
]

export function computeLevelInfo(stats) {
  return levelInfoFromXp(computeCollectorXp(stats))
}

export function levelInfoFromXp(xpInput) {
  const xp = Math.max(0, Math.round(xpInput || 0))

  // Highest level whose XP threshold has been met (levels are 1-indexed).
  let level = 1
  for (let i = 0; i < XP_TABLE.length; i += 1) {
    if (xp >= XP_TABLE[i]) level = i + 1
    else break
  }

  const floorXp = XP_TABLE[level - 1]
  const atMax = level >= MAX_LEVEL
  const nextXp = atMax ? floorXp : XP_TABLE[level]
  const span = Math.max(1, nextXp - floorXp)
  const intoLevel = Math.max(0, xp - floorXp)
  const pct = atMax ? 100 : Math.min(100, Math.round((intoLevel / span) * 100))
  const role = ROLE_BANDS.find((band) => level >= band.min)?.label || 'Novice Collector'

  return {
    xp,
    level,
    role,
    pct,
    intoLevel: atMax ? intoLevel : intoLevel,
    toNext: atMax ? 0 : Math.max(0, nextXp - xp),
    nextLevelXp: nextXp,
    atMax,
  }
}
