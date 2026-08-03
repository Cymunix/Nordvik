import React from 'react'
import { supabase } from '../lib/supabaseClient'

// ── Lazy OpenCV.js loader ──────────────────────────────────────────────
// ~11MB single-file build (WASM embedded), self-hosted at /opencv.js and loaded
// only when the user asks to auto-detect cards, so it never touches normal app
// load. Self-hosted (same origin) so no CDN/CSP surprises. If it ever fails to
// init, the tool still works fully via manual crop boxes.
let cvPromise = null
function loadOpenCV() {
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) return Promise.resolve()
  if (cvPromise) return cvPromise
  cvPromise = new Promise((resolve, reject) => {
    const finish = () => {
      const g = window.cv
      if (g && g.Mat) { resolve(); return true }
      return false
    }
    const script = document.createElement('script')
    script.src = '/opencv.js'
    script.async = true
    script.onload = () => {
      const g = window.cv
      if (finish()) return
      // The UMD build assigns window.cv immediately but compiles WASM async.
      if (g && typeof g.then === 'function') { g.then(() => resolve()); return }
      if (g && typeof g === 'object') { g.onRuntimeInitialized = () => resolve() }
      // Fallback poll in case onRuntimeInitialized isn't honored.
      const t0 = Date.now()
      const poll = () => {
        if (finish()) return
        if (Date.now() - t0 > 40000) { cvPromise = null; reject(new Error('OpenCV took too long to initialize.')); return }
        setTimeout(poll, 100)
      }
      poll()
    }
    script.onerror = () => { cvPromise = null; reject(new Error('Could not load OpenCV.')) }
    document.body.appendChild(script)
  })
  return cvPromise
}

// Intersection-over-union — used to drop near-duplicate detected boxes.
function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

let boxSeq = 1
const newBox = (b) => ({ id: boxSeq++, itemId: '', ...b })

export default function SheetSplitterPage({ scope }) {
  const { setCurrentScreen, isPlatformAdmin } = scope

  const [categories, setCategories] = React.useState([])
  const [subcategories, setSubcategories] = React.useState([])
  const [categoryId, setCategoryId] = React.useState('')
  const [subcategoryId, setSubcategoryId] = React.useState('')
  const [cards, setCards] = React.useState([])
  const [cardsLoading, setCardsLoading] = React.useState(false)

  const [imgSrc, setImgSrc] = React.useState('')
  const [imgDims, setImgDims] = React.useState({ w: 0, h: 0 })
  const [boxes, setBoxes] = React.useState([])
  const [detecting, setDetecting] = React.useState(false)
  const [detectError, setDetectError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saveMsg, setSaveMsg] = React.useState('')
  const [progress, setProgress] = React.useState(0)

  const imgRef = React.useRef(null)
  const stageRef = React.useRef(null)
  const dragRef = React.useRef(null)

  // Load categories once.
  React.useEffect(() => {
    supabase.from('categories').select('category_id, name').order('name')
      .then(({ data }) => setCategories(data || []))
  }, [])

  // Subcategories follow the chosen category.
  React.useEffect(() => {
    setSubcategoryId('')
    setSubcategories([])
    if (!categoryId) return
    supabase.from('subcategories').select('subcategory_id, name').eq('category_id', categoryId).order('name')
      .then(({ data }) => setSubcategories(data || []))
  }, [categoryId])

  // Candidate cards for matching follow category + subcategory.
  React.useEffect(() => {
    setCards([])
    if (!categoryId || !subcategoryId) return
    setCardsLoading(true)
    supabase.from('items').select('item_id, name, card_number')
      .eq('category_id', categoryId).eq('subcategory_id', subcategoryId)
      .order('card_number', { nullsFirst: false })
      .then(({ data }) => { setCards(data || []); setCardsLoading(false) })
  }, [categoryId, subcategoryId])

  const cardLabel = (c) => `${c.name || 'Unnamed'}${c.card_number ? ` — #${c.card_number}` : ''}`

  const onPickFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBoxes([]); setDetectError(''); setSaveMsg('')
    const reader = new FileReader()
    reader.onload = () => setImgSrc(String(reader.result))
    reader.readAsDataURL(file)
  }

  const onImgLoad = () => {
    const el = imgRef.current
    if (el) setImgDims({ w: el.naturalWidth, h: el.naturalHeight })
  }

  // Map between natural-image pixels and on-screen display pixels.
  const displayScale = () => {
    const el = imgRef.current
    if (!el || !imgDims.w) return 1
    return el.clientWidth / imgDims.w
  }

  const runAutoDetect = async () => {
    if (!imgRef.current || !imgDims.w) return
    setDetecting(true); setDetectError('')
    try {
      await loadOpenCV()
      const cv = window.cv
      const src = cv.imread(imgRef.current)
      const gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)
      const edges = new cv.Mat()
      cv.Canny(gray, edges, 40, 130)
      const kernel = cv.Mat.ones(7, 7, cv.CV_8U)
      cv.dilate(edges, edges, kernel)
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      const imgArea = src.rows * src.cols
      const found = []
      for (let i = 0; i < contours.size(); i += 1) {
        const r = cv.boundingRect(contours.get(i))
        const area = r.width * r.height
        const ar = r.width / r.height
        // Card-ish: portrait rectangle, a sensible fraction of the sheet.
        if (area > imgArea * 0.008 && area < imgArea * 0.9 && ar > 0.45 && ar < 1.05) {
          found.push({ x: r.x, y: r.y, w: r.width, h: r.height })
        }
      }
      // Drop near-duplicates (nested/overlapping contours).
      const kept = []
      found.sort((a, b) => b.w * b.h - a.w * a.h)
      for (const f of found) if (!kept.some((k) => iou(k, f) > 0.5)) kept.push(f)
      src.delete(); gray.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete()
      if (!kept.length) setDetectError('No cards detected — draw boxes manually with “Add box”.')
      setBoxes(kept.sort((a, b) => (a.y - b.y) || (a.x - b.x)).map(newBox))
    } catch (err) {
      setDetectError(`${err.message || 'Auto-detect failed'} — you can still add boxes manually.`)
    } finally {
      setDetecting(false)
    }
  }

  const addManualBox = () => {
    const w = Math.round(imgDims.w * 0.18)
    const h = Math.round(w / 0.71)
    setBoxes((prev) => [...prev, newBox({ x: Math.round(imgDims.w * 0.1), y: Math.round(imgDims.h * 0.1), w, h })])
  }
  const removeBox = (id) => setBoxes((prev) => prev.filter((b) => b.id !== id))
  const setBoxItem = (id, itemId) => setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, itemId } : b)))

  // Pointer drag/resize on the stage overlay.
  const onBoxPointerDown = (e, box, mode) => {
    e.preventDefault(); e.stopPropagation()
    const scale = displayScale()
    dragRef.current = { id: box.id, mode, startX: e.clientX, startY: e.clientY, box: { ...box }, scale }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.startX) / d.scale
    const dy = (e.clientY - d.startY) / d.scale
    setBoxes((prev) => prev.map((b) => {
      if (b.id !== d.id) return b
      if (d.mode === 'move') {
        return { ...b, x: clamp(d.box.x + dx, 0, imgDims.w - b.w), y: clamp(d.box.y + dy, 0, imgDims.h - b.h) }
      }
      return { ...b, w: clamp(d.box.w + dx, 20, imgDims.w - b.x), h: clamp(d.box.h + dy, 20, imgDims.h - b.y) }
    }))
  }
  const onPointerUp = () => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  // Crop one box out of the source image at full resolution.
  const cropBlob = (box) => new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(box.w); canvas.height = Math.round(box.h)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgRef.current, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h)
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
  })

  const cropDataUrl = (box) => {
    if (!imgRef.current || !box.w) return ''
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(box.w); canvas.height = Math.round(box.h)
    const ctx = canvas.getContext('2d')
    try { ctx.drawImage(imgRef.current, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h) } catch { return '' }
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  const matchedCount = boxes.filter((b) => b.itemId).length

  const saveAll = async () => {
    const toSave = boxes.filter((b) => b.itemId)
    if (!toSave.length) return
    setSaving(true); setSaveMsg(''); setProgress(0)
    let done = 0, failed = 0
    for (const box of toSave) {
      try {
        const blob = await cropBlob(box)
        const path = `items/${box.itemId}/${Date.now()}_sheet_${box.id}.jpg`
        const { error: upErr } = await supabase.storage.from('item-images').upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        // Append after existing images: use a high-ish position so it doesn't
        // clobber a primary image; admins can reorder in the item editor.
        const { count } = await supabase.from('item_images')
          .select('*', { count: 'exact', head: true }).eq('item_id', box.itemId)
        const { error: insErr } = await supabase.from('item_images')
          .insert({ item_id: box.itemId, image_path: path, position: count || 0 })
        if (insErr) throw insErr
        done += 1
      } catch {
        failed += 1
      }
      setProgress(Math.round(((done + failed) / toSave.length) * 100))
    }
    setSaving(false)
    setSaveMsg(`Attached ${done} image${done === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.`)
    if (done) setBoxes((prev) => prev.filter((b) => !(b.itemId && !failed)))
  }

  if (!isPlatformAdmin) {
    return (
      <section className="sheet-splitter" aria-label="Sheet Splitter">
        <p className="ss-muted">Sheet Splitter is an admin tool.</p>
        <button type="button" className="ss-btn" onClick={() => setCurrentScreen('catalog')}>← Back to Catalogue</button>
      </section>
    )
  }

  const scale = displayScale()
  const ready = categoryId && subcategoryId && imgSrc

  return (
    <section className="sheet-splitter" aria-label="Sheet Splitter">
      <div className="ss-head">
        <button type="button" className="ss-back" onClick={() => setCurrentScreen('catalog')}>← Catalogue</button>
        <h1 className="ss-title">Sheet Splitter</h1>
        <p className="ss-sub">Upload a sheet of cards, split it into individual images, and attach each to a card.</p>
      </div>

      {/* Step 1 — scope */}
      <div className="ss-panel">
        <h2 className="ss-panel-title">1 · Choose category &amp; subcategory</h2>
        <div className="ss-row">
          <label className="ss-field">
            <span>Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select…</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </label>
          <label className="ss-field">
            <span>Subcategory</span>
            <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId}>
              <option value="">{categoryId ? 'Select…' : 'Pick a category first'}</option>
              {subcategories.map((s) => <option key={s.subcategory_id} value={s.subcategory_id}>{s.name}</option>)}
            </select>
          </label>
          <div className="ss-field ss-field--info">
            <span>Cards to match against</span>
            <strong>{cardsLoading ? 'Loading…' : `${cards.length} card${cards.length === 1 ? '' : 's'}`}</strong>
          </div>
        </div>
      </div>

      {/* Step 2 — sheet + boxes */}
      <div className="ss-panel">
        <h2 className="ss-panel-title">2 · Upload the sheet &amp; mark cards</h2>
        <div className="ss-row ss-row--tools">
          <label className="ss-btn ss-btn--file">
            {imgSrc ? 'Replace sheet…' : 'Upload sheet image…'}
            <input type="file" accept="image/*" onChange={onPickFile} hidden />
          </label>
          <button type="button" className="ss-btn" disabled={!imgSrc || detecting} onClick={runAutoDetect}>
            {detecting ? 'Detecting…' : '✨ Auto-detect cards'}
          </button>
          <button type="button" className="ss-btn" disabled={!imgSrc} onClick={addManualBox}>+ Add box</button>
          {boxes.length > 0 && <span className="ss-count">{boxes.length} box{boxes.length === 1 ? '' : 'es'} · {matchedCount} matched</span>}
        </div>
        {detectError && <p className="ss-warn">{detectError}</p>}

        {imgSrc ? (
          <div className="ss-stage" ref={stageRef}>
            <img ref={imgRef} src={imgSrc} alt="sheet" className="ss-sheet-img" onLoad={onImgLoad} draggable={false} />
            {boxes.map((box, i) => (
              <div
                key={box.id}
                className={`ss-box${box.itemId ? ' is-matched' : ''}`}
                style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
                onPointerDown={(e) => onBoxPointerDown(e, box, 'move')}
              >
                <span className="ss-box-num">{i + 1}</span>
                <button type="button" className="ss-box-del" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeBox(box.id)}>✕</button>
                <span className="ss-box-resize" onPointerDown={(e) => onBoxPointerDown(e, box, 'resize')} />
              </div>
            ))}
          </div>
        ) : (
          <div className="ss-drop">Upload a sheet image to begin.</div>
        )}
      </div>

      {/* Step 3 — match + save */}
      {boxes.length > 0 && (
        <div className="ss-panel">
          <h2 className="ss-panel-title">3 · Match each crop to a card</h2>
          <div className="ss-matches">
            {boxes.map((box, i) => {
              const url = cropDataUrl(box)
              return (
                <div key={box.id} className="ss-match">
                  <span className="ss-match-num">{i + 1}</span>
                  <div className="ss-match-thumb">{url ? <img src={url} alt={`crop ${i + 1}`} /> : <span>?</span>}</div>
                  <input
                    className="ss-match-input"
                    list={`ss-cards-${box.id}`}
                    placeholder="Type a card name or #number…"
                    defaultValue={box.itemId ? cardLabel(cards.find((c) => c.item_id === box.itemId) || {}) : ''}
                    onChange={(e) => {
                      const match = cards.find((c) => cardLabel(c) === e.target.value)
                      setBoxItem(box.id, match ? match.item_id : '')
                    }}
                  />
                  <datalist id={`ss-cards-${box.id}`}>
                    {cards.slice(0, 1000).map((c) => <option key={c.item_id} value={cardLabel(c)} />)}
                  </datalist>
                  <span className={`ss-match-state${box.itemId ? ' ok' : ''}`}>{box.itemId ? '✓ matched' : 'unmatched'}</span>
                </div>
              )
            })}
          </div>
          <div className="ss-save-row">
            <button type="button" className="ss-btn ss-btn--primary" disabled={!ready || !matchedCount || saving} onClick={saveAll}>
              {saving ? `Saving… ${progress}%` : `Attach ${matchedCount} image${matchedCount === 1 ? '' : 's'}`}
            </button>
            {saveMsg && <span className="ss-save-msg">{saveMsg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
