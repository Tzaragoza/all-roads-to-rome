// The denarius as drawn on the map (a gold coin with a D), for HTML text: one symbol everywhere, the same on
// every platform (the 🪙 emoji is a silver quarter on iOS and differs on every system).
export const COIN = '<svg class="dcoin" viewBox="-6.6 -6.6 13.2 13.2" aria-hidden="true"><circle r="5.2"/><text y="2.4">D</text></svg>';
export const coinEl = (): Element => {
  const t = document.createElement('template');
  t.innerHTML = COIN;
  return t.content.firstElementChild!;
};
