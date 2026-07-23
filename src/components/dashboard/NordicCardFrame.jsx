// NordicCardFrame — the supplied Nordic frame's four corner ornaments,
// isolated from their background and applied as a transparent overlay in each
// card corner. The artwork itself is unchanged (extracted, not recreated); it
// was keyed off the navy background and recoloured to a muted blue-grey at
// build time (public/nordic-corner-*.png). Sits behind content, is clipped by
// the card edges, and never intercepts pointers.
// Reuse: drop <NordicCardFrame/> into any position:relative; overflow:hidden box.
export default function NordicCardFrame({ className = '' }) {
  return (
    <span className={`nv-frame${className ? ` ${className}` : ''}`} aria-hidden="true">
      <img className="nv-frame-c nv-frame-tr" src="/nordic-corner-tr.png" alt="" />
      <img className="nv-frame-c nv-frame-br" src="/nordic-corner-br.png" alt="" />
      <span className="nv-frame-edge-r" />
    </span>
  )
}
