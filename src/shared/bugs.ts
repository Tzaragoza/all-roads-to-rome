// Bug reports: the shape shared by the client (src/client/arlr/bug.ts) and the server (src/server/core/bugs.ts).

export const BUG_LIMITS = { text: 2000, perUser: 5, anonPerDay: 30, actions: 600 } as const;
export type BugStatus = 'new' | 'done';

/** Gathered by the client when the report is sent: what a moderator needs to see and replay the problem. */
export type BugContext = {
  version: string;
  /** The post's day (or 'demo'), and what was on screen. */
  day: string; mode: string; view: string;
  skirmish: number | null; skin: string;
  turn: number; denarii: number; glory: number;
  screen: string; agent: string;
  /** The campaign's action log, only if the player ticked "attach my game". */
  actions: unknown[] | null;
};

export type BugReport = { id: string; at: number; user: string | null; text: string; ctx: BugContext; status: BugStatus };
