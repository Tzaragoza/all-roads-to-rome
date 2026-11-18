// The Aegyptus skin's words: while the board is in the Egypt theme, every displayed text is re-read through
// egyptText (events, terrain, decrees, tooltips; town and tribe names are already swapped in the scenario).
// One DOM pass, like the resource symbols: no template has to know about the skin. SVG and fields are skipped.
import { egyptText } from '../../shared/egypt';
import { boardTheme } from './board-art';

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TITLE', 'CODE']);
const skipped = (n: Node) => { for (let e = n.parentElement; e; e = e.parentElement) if (SKIP.has(e.tagName) || e instanceof SVGElement || e.hasAttribute('data-noskin')) return true; return false; };

function pass(node: Node) {
  if (boardTheme() !== 'egypt') return;
  if (node.nodeType === Node.TEXT_NODE) { const t = node as Text; if (!skipped(t)) { const v = egyptText(t.data); if (v !== t.data) t.data = v; } return; }
  if (!(node instanceof Element) || node instanceof SVGElement) return;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n as Text; const v = egyptText(t.data); if (v !== t.data && !skipped(t)) t.data = v; }
}

export function watchSkin(root: HTMLElement): () => void {
  pass(root);
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver((list) => { for (const r of list) { if (r.type === 'characterData') pass(r.target); else r.addedNodes.forEach(pass); } });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}
