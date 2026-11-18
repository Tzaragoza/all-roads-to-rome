// Every written mention of the two resources carries its symbol: "glory" gets the gold star, "denarii" the map's
// gold D coin (coin.ts).
// Done once, on the DOM, so no template can forget it: a MutationObserver decorates whatever the game renders.
// Skips the board (SVG), form fields, and mentions that already sit next to their symbol ("★★★ glory", "(coin) 8 denarii").
import { coinEl } from './coin';

const WORD = /\b(glory|denarii|denarius)\b/gi;
const SYM = { glory: '★', coin: '¤' } as const; // '¤' only marks a coin in textBefore()
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TITLE', 'CODE']);

const kindOf = (w: string): keyof typeof SYM => (w.toLowerCase() === 'glory' ? 'glory' : 'coin');

/** Text just before this node inside its block (previous siblings), to spot a symbol already there. */
function textBefore(n: Node, max = 16): string {
  let out = '';
  for (let p = n.previousSibling; p && out.length < max; p = p.previousSibling) {
    const coin = p instanceof Element && (p.matches('.dcoin, .rico.coin') || !!p.querySelector('.dcoin'));
    out = (coin ? '¤' : '') + (p instanceof SVGElement ? '' : p.textContent ?? '') + out;
  }
  return out.slice(-max);
}

function skipped(n: Node): boolean {
  for (let e = n.parentElement; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e instanceof SVGElement || e.hasAttribute('data-noico') || e.isContentEditable) return true;
    if (e.classList.contains('rico') || e.classList.contains('dcoin')) return true;
  }
  return false;
}

/** Decorate one text node; returns true when it changed the DOM. */
function decorateText(t: Text): boolean {
  const s = t.data;
  WORD.lastIndex = 0;
  if (!WORD.test(s) || skipped(t)) return false;
  WORD.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, changed = false, m: RegExpExecArray | null;
  while ((m = WORD.exec(s))) {
    const k = kindOf(m[1]!), sym = SYM[k];
    const before = (last === 0 ? textBefore(t) : '') + s.slice(0, m.index);
    if (before.slice(-14).includes(sym)) continue; // already shown ("★★★ glory", "🪙8 denarii")
    frag.append(s.slice(last, m.index));
    let i: Element;
    if (k === 'coin') { i = coinEl(); i.classList.add('rico', 'coin'); } else { i = document.createElement('i'); i.className = 'rico glory'; i.setAttribute('aria-hidden', 'true'); i.textContent = sym; }
    frag.append(i, m[0]);
    last = m.index + m[0].length;
    changed = true;
  }
  if (!changed) return false;
  frag.append(s.slice(last));
  t.replaceWith(frag);
  return true;
}

export function decorateResources(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) { decorateText(node as Text); return; }
  if (!(node instanceof Element) || node instanceof SVGElement) return;
  const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const todo: Text[] = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/glory|denari/i.test((n as Text).data)) todo.push(n as Text);
  // legacy 🪙 in any text (event chips, notes): the map's coin instead
  const walk2 = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), emo: Text[] = [];
  for (let n = walk2.nextNode(); n; n = walk2.nextNode()) if ((n as Text).data.includes('🪙') && !skipped(n)) emo.push(n as Text);
  for (const t of emo) { const parts = t.data.split('🪙'), f = document.createDocumentFragment(); parts.forEach((x, k) => { if (k) f.append(coinEl()); f.append(x); }); t.replaceWith(f); }
  for (const t of todo) decorateText(t);
}

/** Keep `root` decorated as the game re-renders; returns the disconnect function. */
export function watchResources(root: HTMLElement): () => void {
  decorateResources(root);
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'characterData') { decorateResources(r.target); continue; }
      r.addedNodes.forEach((n) => { if (!(n instanceof Element && (n.classList.contains('rico') || n.classList.contains('dcoin')))) decorateResources(n); });
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}
