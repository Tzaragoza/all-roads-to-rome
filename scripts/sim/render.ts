// Debug renderer: scenario + state -> SVG string. Not the production client.
import { initialState, protectedTowns, supplied, visibleEvents } from '../../src/shared/engine';
import type { Scenario, State } from '../../src/shared/engine';

const TRIBE_FILL = ['#c9a227', '#5b8c5a', '#7a5c99', '#b5651d', '#3f7f9f'];

export function renderSvg(sc: Scenario, s: State = initialState(sc), scale = 5): string {
  const sup = supplied(sc, s), prot = protectedTowns(sc, s);
  const W = sc.width * scale, H = sc.height * scale + 60;
  const P = (t: number) => [sc.towns[t]!.x * scale, sc.towns[t]!.y * scale] as const;
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Georgia,serif">`,
    `<rect width="100%" height="100%" fill="#f3ead6"/>`];
  for (const r of sc.roads) {
    const [x1, y1] = P(r.a), [x2, y2] = P(r.b);
    const built = s.built[r.id];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${built ? '#3b2f1e' : '#9c8f74'}" stroke-width="${built ? 4 : 2}" ${built ? '' : 'stroke-dasharray="4 5"'}/>`);
  }
  for (const t of sc.towns) {
    const [x, y] = P(t.id);
    const fill = t.id === sc.castra ? '#8b1a1a' : TRIBE_FILL[t.tribe % TRIBE_FILL.length];
    parts.push(`<circle cx="${x}" cy="${y}" r="${t.id === sc.castra ? 11 : 6 + t.value * 2}" fill="${fill}" opacity="${sup[t.id] ? 1 : 0.55}" stroke="${prot[t.id] ? '#000' : '#fff'}"/>`);
    parts.push(`<text x="${x}" y="${y - 13}" font-size="11" text-anchor="middle">${t.name} ${'•'.repeat(t.value)}</text>`);
  }
  const ev = visibleEvents(sc, s.turn).map((e) => `T${e.turn} ${e.kind} ${sc.tribes[e.tribe]!.name}`).join(' | ');
  parts.push(`<text x="10" y="${H - 22}" font-size="11">${sc.decree.faction}: ${sc.decree.text}</text>`);
  parts.push(`<text x="10" y="${H - 6}" font-size="11">Forecast: ${ev || 'quiet'}</text></svg>`);
  return parts.join('\n');
}
