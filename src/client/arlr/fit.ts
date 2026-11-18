// Price tags inside buttons ("8 denarii") must never spill out of a narrow button (small phones, landscape bar).
// After each render: shrink the tag's text, then drop the word and keep the coin and number.

function fitOne(p: HTMLElement) {
  const btn = p.closest('button');
  if (!btn) return;
  p.style.fontSize = ''; p.classList.remove('short');
  const cs = getComputedStyle(btn);
  const room = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
  if (room <= 0 || p.offsetWidth <= room) return;
  const base = parseFloat(getComputedStyle(p).fontSize);
  for (const k of [0.92, 0.84, 0.76]) { p.style.fontSize = `${base * k}px`; if (p.offsetWidth <= room) return; }
  p.style.fontSize = ''; p.classList.add('short');
  for (const k of [0.92, 0.84, 0.76]) { if (p.offsetWidth <= room) return; p.style.fontSize = `${base * k}px`; }
}

export function fitPrices(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('button .price').forEach(fitOne);
}

/** Refit after every render and on resize; returns the disconnect function. */
export function watchFit(root: HTMLElement): () => void {
  let queued = false;
  const run = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fitPrices(root); }); };
  run();
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(run) : null;
  mo?.observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', run);
  return () => { mo?.disconnect(); window.removeEventListener('resize', run); };
}
