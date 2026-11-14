import type { Road, RoadId, TownId } from './types';

export type Adj = Array<Array<{ to: TownId; road: RoadId }>>;

export function adjacency(n: number, roads: readonly Road[], include: (r: Road) => boolean = () => true): Adj {
  const adj: Adj = Array.from({ length: n }, () => []);
  for (const r of roads) {
    if (!include(r)) continue;
    adj[r.a]!.push({ to: r.b, road: r.id });
    adj[r.b]!.push({ to: r.a, road: r.id });
  }
  return adj;
}

/** BFS hop distances from src (Infinity if unreachable). */
export function bfs(adj: Adj, src: TownId): number[] {
  const dist = new Array<number>(adj.length).fill(Infinity);
  dist[src] = 0;
  const q = [src];
  for (let i = 0; i < q.length; i++) {
    const u = q[i]!;
    for (const { to } of adj[u]!) if (dist[to] === Infinity) { dist[to] = dist[u]! + 1; q.push(to); }
  }
  return dist;
}

/**
 * Bridges of an undirected multigraph (iterative Tarjan, edge-id aware so parallel
 * edges are handled). Returns the set of bridge road ids.
 */
export function bridges(adj: Adj): Set<RoadId> {
  const n = adj.length;
  const disc = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const out = new Set<RoadId>();
  let time = 0;
  for (let s = 0; s < n; s++) {
    if (disc[s] !== -1) continue;
    // stack frames: [node, parentRoad, nextNeighbourIndex]
    const stack: Array<[number, number, number]> = [[s, -1, 0]];
    disc[s] = low[s] = time++;
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const [u, pr] = frame;
      const nbrs = adj[u]!;
      if (frame[2] < nbrs.length) {
        const { to: v, road } = nbrs[frame[2]++]!;
        if (road === pr) continue;
        if (disc[v] === -1) {
          disc[v] = low[v] = time++;
          stack.push([v, road, 0]);
        } else {
          low[u] = Math.min(low[u]!, disc[v]!);
        }
      } else {
        stack.pop();
        if (stack.length) {
          const p = stack[stack.length - 1]![0];
          low[p] = Math.min(low[p]!, low[u]!);
          if (low[u]! > disc[p]!) out.add(pr);
        }
      }
    }
  }
  return out;
}
