// Background music, generated live with WebAudio: no audio files, no licensing, never the same twice.
// A slow, calm "ancient" texture in D Dorian: a low drone, a plucked lyre (Karplus–Strong string
// synthesis) wandering over a four-chord cycle, an occasional breathy flute and a rare, very soft
// frame drum, all through a short echo for space. ~66 beats per minute.
// A track dropped in ./music/ (see music/README.md) replaces the generated music.
// Off by default (remembered per device), started on the first tap because browsers forbid
// autoplay, paused while the tab is hidden.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fx: GainNode | null = null; // echo send
let timer: ReturnType<typeof setInterval> | undefined;
let enabled = false;
let started = false;
const plucks = new Map<number, AudioBuffer>();

const VOL = 0.3; // peaks around 0.13: quiet under the sound effects
const BEAT = 60 / 66;
const D3 = 146.83;
// D Dorian: D E F G A B C, as semitone offsets from D3, over two octaves
const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24];
// chord cycle (scale-degree roots): i (Dm) – VII (C) – i (Dm) – IV (G, the Dorian colour); 2 bars each
const CHORDS = [[0, 2, 4], [6, 8, 10], [0, 2, 4], [3, 5, 7]];
const hz = (semi: number) => D3 * 2 ** (semi / 12);

export function musicOn(): boolean {
  try { enabled = localStorage.getItem('arlr.music') === '1'; } catch { /* keep default */ }
  return enabled;
}

export function setMusic(on: boolean) {
  enabled = on;
  try { localStorage.setItem('arlr.music', on ? '1' : '0'); } catch { /* storage unavailable */ }
  if (on) start(); else stop();
}

/** Call from a user gesture (tap/click). Safe to call many times. */
export function startMusicOnGesture() {
  if (enabled && !started) start();
}

/** Karplus–Strong plucked string: a noise burst fed through a damped averaging delay line. */
function pluckBuffer(c: BaseAudioContext, freq: number): AudioBuffer {
  const key = Math.round(freq * 10);
  const hit = plucks.get(key);
  if (hit) return hit;
  const sr = c.sampleRate, len = Math.floor(sr * 3.2), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const n = Math.max(2, Math.round(sr / freq)), line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = (Math.random() * 2 - 1) * 0.6;
  let prevNoise = 0;
  for (let i = 0; i < n; i++) { const v = line[i]!; line[i] = 0.5 * (v + prevNoise); prevNoise = v; } // softer attack
  const damp = 0.996 - Math.min(0.006, freq / 120000);
  for (let i = 0, p = 0; i < len; i++) {
    const a = line[p]!, b = line[(p + 1) % n]!;
    d[i] = a;
    line[p] = damp * 0.5 * (a + b);
    p = (p + 1) % n;
  }
  plucks.set(key, buf);
  return buf;
}

function lyre(c: BaseAudioContext, t: number, semi: number, vel: number) {
  const src = c.createBufferSource(); src.buffer = pluckBuffer(c, hz(semi));
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const g = c.createGain(); g.gain.value = vel;
  src.connect(lp).connect(g); g.connect(master!); g.connect(fx!);
  src.start(t);
}

function flute(c: BaseAudioContext, t: number, semi: number, dur: number) {
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz(semi + 12);
  const vib = c.createOscillator(); vib.frequency.value = 4.6;
  const vg = c.createGain(); vg.gain.value = hz(semi + 12) * 0.006;
  vib.connect(vg).connect(o.frequency);
  // breath: filtered noise riding on the tone
  const nb = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = c.createBufferSource(); ns.buffer = nb;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz(semi + 12) * 2; bp.Q.value = 6;
  const ng = c.createGain(); ng.gain.value = 0.04;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.07, t + dur * 0.75);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); ns.connect(bp).connect(ng).connect(g);
  g.connect(master!); g.connect(fx!);
  o.start(t); vib.start(t); ns.start(t);
  o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05); ns.stop(t + dur + 0.05);
}

function drum(c: BaseAudioContext, t: number) {
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.35);
  const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(g).connect(master!); o.start(t); o.stop(t + 0.65);
}

function drone(c: BaseAudioContext) {
  // D2 + A2, slowly breathing; it plays as long as the music does
  for (const [f, v] of [[D3 / 2, 0.07], [D3 * 0.75, 0.035]] as const) {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = c.createGain(); g.gain.value = v;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.04;
    const lg = c.createGain(); lg.gain.value = v * 0.5;
    lfo.connect(lg).connect(g.gain);
    o.connect(lp).connect(g).connect(master!);
    o.start(); lfo.start();
  }
}

// --- the composer: schedules a little ahead of time on a coarse timer
let nextBeat = 0, beat = 0, degree = 4;
function schedule(until?: number) {
  if (!ctx || !master) return;
  while (nextBeat < (until ?? ctx.currentTime + 0.6)) {
    const bar = Math.floor(beat / 4), inBar = beat % 4;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
    const t = nextBeat + (Math.random() - 0.5) * 0.02; // a human hand
    // lyre: a gentle random walk through the scale, pulled toward chord tones on strong beats
    const play = inBar === 0 ? 0.95 : inBar === 2 ? 0.7 : 0.4;
    if (Math.random() < play) {
      if (inBar === 0 || inBar === 2) {
        const target = chord[Math.floor(Math.random() * chord.length)]! + (Math.random() < 0.5 ? 7 : 0);
        degree += Math.sign(target - degree) * Math.min(2, Math.abs(target - degree));
      } else {
        degree += [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]!;
      }
      degree = Math.max(2, Math.min(SCALE.length - 3, degree));
      lyre(ctx, t, SCALE[degree]!, inBar === 0 ? 0.5 : 0.34);
      if (inBar === 0 && Math.random() < 0.35) lyre(ctx, t + 0.09, SCALE[Math.max(0, degree - 4)]!, 0.25); // a low fifth
      if (Math.random() < 0.12) lyre(ctx, t + BEAT / 2, SCALE[Math.min(SCALE.length - 1, degree + 1)]!, 0.22); // passing note
    }
    // flute: now and then a long chord tone at the start of a phrase
    if (inBar === 0 && bar % 4 === 2 && Math.random() < 0.6) flute(ctx, t, SCALE[chord[1]!]!, BEAT * 6); // flute() plays an octave up
    // frame drum: rare, very soft
    if (inBar === 0 && bar % 2 === 0 && Math.random() < 0.5) drum(ctx, t);
    nextBeat += BEAT;
    beat++;
  }
}

function buildGraph(c: BaseAudioContext) {
  master = c.createGain(); master.gain.value = 0; master.connect(c.destination);
  fx = c.createGain(); fx.gain.value = 0.35;
  for (const [time, fb] of [[0.37, 0.38], [0.53, 0.3]] as const) {
    const dl = c.createDelay(1); dl.delayTime.value = time;
    const f = c.createGain(); f.gain.value = fb;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    fx.connect(dl); dl.connect(lp).connect(f).connect(dl); lp.connect(master);
  }
  drone(c);
}

/** Render `seconds` of music offline (for previews and tests). Does not touch live playback. */
export async function renderPreview(seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
  const live = { ctx, master, fx, nextBeat, beat };
  const off = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate);
  ctx = off as unknown as AudioContext; plucks.clear();
  buildGraph(off);
  const m = master as GainNode | null;
  m?.gain.setValueAtTime(0, 0); m?.gain.setTargetAtTime(VOL, 0, 1.5);
  nextBeat = 0.2; beat = 0;
  schedule(seconds - 3);
  const out = await off.startRendering();
  ({ ctx, master, fx, nextBeat, beat } = live); plucks.clear();
  return out;
}

// A composed track, if one was dropped in ./music/: looped by an <audio> element.
const TRACKS = import.meta.glob('./music/*.{ogg,mp3,m4a,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const TRACK = Object.keys(TRACKS).sort().map((k) => TRACKS[k]!)[0];
const FILE_VOL = 0.35;
let audio: HTMLAudioElement | null = null;
/** True when a composed track replaces the generated music. */
export const hasTrack = () => !!TRACK;

function start() {
  if (TRACK) {
    try {
      audio ??= Object.assign(new Audio(TRACK), { loop: true, volume: FILE_VOL });
      void audio.play().catch(() => { started = false; });
      started = true;
    } catch { /* no audio available */ }
    return;
  }
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!master) buildGraph(ctx); // echo: two darkened feedback delays; plus the drone
    const m = master as GainNode | null;
    m?.gain.cancelScheduledValues(ctx.currentTime);
    m?.gain.setTargetAtTime(VOL, ctx.currentTime, 1.5); // fade in
    nextBeat = ctx.currentTime + 0.2;
    timer ??= setInterval(() => schedule(), 150);
    started = true;
  } catch { /* no audio available */ }
}

function stop() {
  if (audio) { audio.pause(); started = false; return; }
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.4); // fade out
  if (timer) { clearInterval(timer); timer = undefined; }
  started = false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!enabled) return;
    if (audio) { if (document.hidden) stop(); else start(); return; }
    if (!ctx) return;
    if (document.hidden) { stop(); void ctx.suspend(); } else { void ctx.resume(); start(); }
  });
}
