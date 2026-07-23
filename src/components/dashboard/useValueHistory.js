import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Records today's collection value/items snapshot for the signed-in user
// and returns real historical series + month-to-date deltas for the stat
// sparklines. History accrues over time; with a single data point the
// series is flat and deltas read as "—" (never fabricated).
const localDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function useValueHistory(userId, totalValue, totalItems) {
  const [history, setHistory] = useState([])
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (!userId) { setHistory([]); return }
    let cancelled = false
    ;(async () => {
      // Upsert today's point (idempotent per day).
      const { error: upsertError } = await supabase
        .from('collection_snapshots')
        .upsert(
          { user_id: userId, snapshot_date: localDate(), total_value: totalValue, total_items: totalItems, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,snapshot_date' },
        )
      if (cancelled) return
      // Table not migrated yet → degrade silently (no sparklines/deltas).
      if (upsertError) { setSupported(false); setHistory([]); return }

      const since = new Date()
      since.setDate(since.getDate() - 45)
      const { data } = await supabase
        .from('collection_snapshots')
        .select('snapshot_date, total_value, total_items')
        .eq('user_id', userId)
        .gte('snapshot_date', since.toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: true })
      if (cancelled) return
      setHistory(data || [])
    })()
    return () => { cancelled = true }
    // Re-run when the live totals change so today's point stays current.
  }, [userId, totalValue, totalItems])

  const valueSeries = history.map((h) => Number(h.total_value) || 0)
  const itemsSeries = history.map((h) => Number(h.total_items) || 0)

  // Month-to-date delta: compare today vs the earliest snapshot in this month.
  const monthPrefix = localDate().slice(0, 7)
  const monthRows = history.filter((h) => String(h.snapshot_date).startsWith(monthPrefix))
  const baseValue = monthRows.length ? Number(monthRows[0].total_value) || 0 : null
  const valueDeltaPct =
    baseValue && baseValue > 0 ? ((totalValue - baseValue) / baseValue) * 100 : null

  return { supported, history, valueSeries, itemsSeries, valueDeltaPct, hasHistory: history.length > 1 }
}
