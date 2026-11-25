// 🐞 "Report a bug": a sheet over the game (opened from the rules sheet "?" and the results page). The report goes
// to the server (tRPC day.bug) with the context a moderator needs; moderators read it in the Senate archives.
import type { BugContext } from '../../shared/bugs';
import { BUG_LIMITS } from '../../shared/bugs';

export type BugSheet = { open: boolean; draft: string; attach: boolean; sending: boolean; sent: boolean; error: string };
export const bugState: BugSheet = { open: false, draft: '', attach: true, sending: false, sent: false, error: '' };

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The sheet's HTML ('' when closed). `canAttach`: there is a campaign whose moves can be attached. */
export function bugSheet(canAttach: boolean, loggedIn: boolean): string {
  const b = bugState;
  if (!b.open) return '';
  if (b.sent) return `<div class="sheet bugsheet"><div class="sheetbox bugbox"><button id="bugx" class="x" aria-label="Close">×</button>
    <h2>🐞 Thank you!</h2><p>Your report reached the moderators. ${loggedIn ? 'They may reply to you on Reddit.' : ''}</p>
    <div class="center"><button id="bugx2" class="primary">Back to the game</button></div></div></div>`;
  return `<div class="sheet bugsheet"><div class="sheetbox bugbox"><button id="bugx" class="x" aria-label="Close">×</button>
    <h2>🐞 Report a bug</h2>
    <p class="muted small">What happened, and what did you expect? Moderators read every report.</p>
    <textarea id="bugtext" rows="5" maxlength="${BUG_LIMITS.text}" placeholder="e.g. On turn 6 the gold went up to 21, then back to 19.">${esc(b.draft)}</textarea>
    ${canAttach ? `<label class="bugattach"><input type="checkbox" id="bugattach" ${b.attach ? 'checked' : ''}> Attach my moves in this campaign, so the moderators can replay it</label>` : ''}
    <div class="muted small">Sent with it: the day, the turn, your screen size, your browser and the game's version${loggedIn ? ', and your username' : ''}.</div>
    ${b.error ? `<div class="bugerr">${esc(b.error)}</div>` : ''}
    <div class="center"><button id="bugsend" class="primary" ${b.sending ? 'disabled' : ''}>${b.sending ? 'Sending…' : 'Send the report'}</button></div>
  </div></div>`;
}

/** Open, close, type, tick, send: one delegated listener set on the game root (re-renders keep the draft). */
export function wireBugSheet(root: HTMLElement, h: { render: () => void; context: () => BugContext; send?: (text: string, ctx: BugContext) => Promise<unknown> }) {
  root.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest('button')?.id;
    if (id === 'bugopen') { Object.assign(bugState, { open: true, sent: false, error: '' }); h.render(); root.querySelector<HTMLTextAreaElement>('#bugtext')?.focus(); }
    if (id === 'bugx' || id === 'bugx2') { bugState.open = false; if (bugState.sent) bugState.draft = ''; h.render(); }
    if (id === 'bugsend') void send();
  });
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'bugtext') bugState.draft = (t as HTMLTextAreaElement).value;
    if (t.id === 'bugattach') bugState.attach = (t as HTMLInputElement).checked;
  });
  async function send() {
    const text = bugState.draft.trim();
    if (text.length < 3) { bugState.error = 'Tell us a little about what went wrong first.'; h.render(); return; }
    if (!h.send) { bugState.error = 'You are offline: the report cannot be sent right now.'; h.render(); return; }
    bugState.sending = true; bugState.error = ''; h.render();
    try {
      const ctx = h.context();
      if (!bugState.attach) ctx.actions = null;
      await h.send(text, ctx);
      bugState.sent = true;
    } catch (err) {
      bugState.error = (err as Error).message || 'The report could not be sent. Try again in a moment.';
    }
    bugState.sending = false; h.render();
  }
}
