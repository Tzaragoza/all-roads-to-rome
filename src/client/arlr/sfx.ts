// Optional flavour sounds, synthesised with WebAudio (no asset files, no licensing).
// On by default (switch off in the header); browsers only allow audio after a user gesture anyway.

export type Sfx = 'road' | 'march' | 'garrison' | 'recruit' | 'revolt' | 'burn' | 'turn' | 'error' | 'win' | 'tick' | 'threat' | 'seal' | 'coin' | 'fanfare' | 'scroll' | 'siege' | 'clear' | 'clack' | 'dusk' | 'medal' | 'crack' | 'stow' | 'raze' | 'clang' | 'call' | 'lastturn';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem('arlr.sound', on ? '1' : '0'); } catch { /* storage unavailable */ }
}
export function soundOn(): boolean {
  try { enabled = localStorage.getItem('arlr.sound') !== '0'; } catch { /* keep default */ }
  return enabled;
}

/**
 * Every sound goes through a gain set for its kind (LEVEL), so they sit in two tiers: actions quiet, events louder.
 * Set by rendering each sound in an OfflineAudioContext and comparing loudness (RMS of the sounding part), 16 Nov 2026.
 */
export const LEVEL: Partial<Record<Sfx, number>> = {
  // actions (quiet tier)
  road: 1.25, march: 0.42, garrison: 0.89, recruit: 0.75, turn: 0.85, error: 0.65, seal: 0.4, coin: 1.1, scroll: 1.17, clear: 1.41, clack: 1.1, medal: 1.15, crack: 0.6, stow: 1.28,
  // events (louder tier); the threat keeps more than its measured share: its drums carry the warning
  revolt: 0.71, burn: 1.6, win: 1.21, threat: 0.7, fanfare: 1.49, dusk: 1.52,
};
let bus: GainNode | null = null;
function out(c: AudioContext): AudioNode { return bus ?? c.destination; }
/** When the last battle sound (cut, clang, raze, bell) began: tick chimes are ducked under it. */
let battleAt = -1;
const BATTLE: Sfx[] = ['revolt', 'burn', 'clang', 'raze', 'siege', 'threat'];

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext, t: number, dur: number, freq: number, gain: number, q = 1, sweepTo?: number) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out(c));
  src.start(t); src.stop(t + dur);
}

function tone(c: AudioContext, t: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(400, freq * 4);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out(c));
  o.start(t); o.stop(t + dur + 0.05);
}

/** `n`: for 'tick', the n-th payment of a turn (each rings a little higher). */
/** A deep war-drum hit. */
function drum(c: AudioContext, t: number, g = 0.7, f = 72) {
  tone(c, t, 0.45, f, g, 'sine', f * 0.55);
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.08), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), lp = c.createBiquadFilter(), v = c.createGain();
  src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 180; v.gain.setValueAtTime(g * 0.5, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(lp).connect(v).connect(out(c)); src.start(t); src.stop(t + 0.08);
}
/** The carnyx, the Gauls' war trumpet: buzzing sawtooths through a distortion curve and a moving vowel-like filter, with a lazy waver. */
function carnyx(c: AudioContext, t: number, len = 1.05, base = 98) {
  const shaper = c.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 512 - 1) * 3.2);
  shaper.curve = curve;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1300, t + 0.25); bp.frequency.linearRampToValueAtTime(900, t + len);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const v = c.createGain(); v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.32, t + 0.09); v.gain.setValueAtTime(0.32, t + len - 0.25); v.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.5; vg.gain.value = base * 0.025; vib.connect(vg);
  for (const [mult, g] of [[1, 0.5], [1.006, 0.4], [2, 0.18]] as const) {
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * mult * 0.75, t); o.frequency.exponentialRampToValueAtTime(base * mult, t + 0.14);
    o.frequency.setValueAtTime(base * mult, t + len - 0.3); o.frequency.exponentialRampToValueAtTime(base * mult * 0.92, t + len);
    vg.connect(o.frequency); og.gain.value = g; o.connect(og).connect(shaper); o.start(t); o.stop(t + len + 0.05);
  }
  shaper.connect(bp).connect(lp).connect(v).connect(out(c));
  const dry = c.createGain(); dry.gain.value = 0.25; shaper.connect(dry).connect(v);
  vib.start(t); vib.stop(t + len + 0.05);
}

/** One note of a Roman buccina (a natural horn): detuned saws, a little grit, the filter opening on the attack ("blat"), vibrato on long notes. */
function brass(c: AudioContext, t: number, f: number, len: number, gain = 0.2) {
  const shaper = c.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 512 - 1) * 2);
  shaper.curve = curve;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(f * 6, t + 0.05); lp.frequency.exponentialRampToValueAtTime(f * 3.5, t + Math.min(len, 0.3));
  const v = c.createGain(); v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  v.gain.setValueAtTime(gain * 0.8, t + Math.max(0.04, len - 0.08)); v.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.2; vg.gain.value = len > 0.3 ? f * 0.012 : 0; vib.connect(vg); vib.start(t); vib.stop(t + len + 0.05);
  for (const [m, g] of [[1, 0.5], [1.005, 0.35], [0.5, 0.2]] as const) {
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * m * 0.97, t); o.frequency.exponentialRampToValueAtTime(f * m, t + 0.04); // the lip slides up to the note
    vg.connect(o.frequency); og.gain.value = g; o.connect(og).connect(shaper); o.start(t); o.stop(t + len + 0.05);
  }
  shaper.connect(lp).connect(v).connect(out(c));
}

export function play(s: Sfx, n = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  // the level of this kind of sound; tick chimes duck under a battle sound that began less than 0.8 s ago
  const duck = s === 'tick' && battleAt >= 0 && c.currentTime - battleAt < 0.8 ? 0.4 : 1;
  if (BATTLE.includes(s)) battleAt = c.currentTime;
  bus = c.createGain(); bus.gain.value = (LEVEL[s] ?? 1) * duck; bus.connect(c.destination);
  switch (s) {
    case 'road': // three spades into gravel, in time with the three shovels on the map
      for (let i = 0; i < 3; i++) { noise(c, t + i * 0.11 + 0.08, 0.1, 800 - i * 90, 0.4, 0.8); noise(c, t + i * 0.11 + 0.14, 0.05, 2600, 0.12, 2); }
      break;
    case 'march': // drum taps
      for (let i = 0; i < 4; i++) { tone(c, t + i * 0.13, 0.1, 110, 0.5, 'triangle', 60); noise(c, t + i * 0.13, 0.05, 2000, 0.15); }
      break;
    case 'garrison': // hammer on timber
      for (let i = 0; i < 3; i++) { noise(c, t + i * 0.18, 0.07, 1400, 0.6, 4); tone(c, t + i * 0.18, 0.08, 320, 0.2, 'square', 200); }
      break;
    case 'recruit': // short brass call
      tone(c, t, 0.18, 392, 0.25, 'sawtooth'); tone(c, t + 0.2, 0.3, 523, 0.25, 'sawtooth'); break;
    case 'revolt': // low war horn
      tone(c, t, 0.9, 98, 0.35, 'sawtooth', 87); tone(c, t, 0.9, 147, 0.15, 'sawtooth', 131); break;
    case 'burn': // crackle
      for (let i = 0; i < 8; i++) noise(c, t + i * 0.06 + Math.random() * 0.03, 0.04, 3000 + Math.random() * 2000, 0.3, 3);
      break;
    case 'turn': // soft bell
      tone(c, t, 0.6, 660, 0.12); tone(c, t, 0.6, 990, 0.05); break;
    case 'tick': // a payment lands: a soft rising chime
      tone(c, t, 0.14, 660 * Math.pow(2, Math.min(n, 12) / 12), 0.06, 'triangle'); break;
    case 'threat': // a threat enters the forecast: war drums and the Gauls' carnyx
      drum(c, t, 0.6); carnyx(c, t + 0.08); drum(c, t + 0.5, 0.45); drum(c, t + 0.64, 0.55); drum(c, t + 0.92, 0.85, 62); break;
    case 'seal': // wax seal pressed on parchment
      tone(c, t, 0.18, 90, 0.5, 'sine', 50); noise(c, t, 0.08, 300, 0.4, 1); break;
    case 'coin':
      tone(c, t, 0.09, 1500 + n * 120, 0.03, 'square'); tone(c, t + 0.03, 0.12, 2250 + n * 160, 0.04); break;
    case 'fanfare': // a town joins Rome
      tone(c, t, 0.14, 523, 0.14, 'triangle'); tone(c, t + 0.12, 0.14, 659, 0.14, 'triangle'); tone(c, t + 0.24, 0.35, 784, 0.16, 'triangle'); break;
    case 'scroll': // a declined offer burns: a soft whoosh and a crackle
      noise(c, t, 0.5, 900, 0.25, 0.6);
      for (let i = 0; i < 9; i++) noise(c, t + 0.05 + i * 0.06 + Math.random() * 0.03, 0.04, 3200 + Math.random() * 1800, 0.22, 3);
      break;
    case 'siege': // a siege ticks down: a low bell and the crackle of the fires
      tone(c, t, 1.4, 196, 0.22); tone(c, t, 0.7, 541, 0.05); tone(c, t, 0.3, 1058, 0.02);
      for (let i = 0; i < 6; i++) noise(c, t + 0.05 + i * 0.07 + Math.random() * 0.03, 0.04, 3000 + Math.random() * 1500, 0.15, 3);
      break;
    case 'clear': // rubble lifts: stones scraped aside, then a small chime
      noise(c, t, 0.25, 600, 0.3, 0.7); noise(c, t + 0.12, 0.2, 900, 0.2, 0.7); tone(c, t + 0.45, 0.25, 1320, 0.05, 'triangle'); tone(c, t + 0.52, 0.3, 1760, 0.04, 'triangle'); break;
    case 'clack': // a voting token on wood
      tone(c, t, 0.06, 820, 0.08, 'square', 500); noise(c, t, 0.04, 2500, 0.25, 4); tone(c, t + 0.25, 0.14, 660, 0.07, 'triangle'); break;
    case 'dusk': // the day ends: a soft low chord
      tone(c, t, 1.8, 330, 0.1); tone(c, t, 1.6, 495, 0.04); tone(c, t + 0.1, 2, 165, 0.08); break;
    case 'medal': { // a medal struck: a bright bell, higher and fuller with the tier (n: 0 copper, 1 silver, 2 gold)
      const f0 = [880, 1047, 1319][n] ?? 880;
      tone(c, t, 0.9, f0, 0.09, 'triangle'); tone(c, t, 0.7, f0 * 2.76, 0.025); if (n >= 1) tone(c, t + 0.09, 0.8, f0 * 1.5, 0.05, 'triangle'); if (n >= 2) tone(c, t + 0.18, 1, f0 * 2, 0.05, 'triangle');
      break;
    }
    case 'crack': // the decree's wax seal snaps, a parchment swish
      noise(c, t, 0.05, 2600, 0.5, 1.5); tone(c, t, 0.12, 140, 0.18, 'sine', 70); noise(c, t + 0.06, 0.22, 1800, 0.12, 0.8, 4200); break;
    case 'stow': // the decree tucked into its banner
      noise(c, t, 0.18, 900, 0.12, 0.8, 2400); tone(c, t + 0.2, 0.18, 880, 0.05, 'triangle'); break;
    case 'raze': // a siege runs out: the roar of fire, timbers falling, crackle
      noise(c, t, 0.7, 300, 0.35, 0.6, 2400); tone(c, t, 0.6, 70, 0.25, 'sine', 40);
      for (let i = 0; i < 7; i++) noise(c, t + 0.25 + i * 0.08 + Math.random() * 0.04, 0.06, 220 + Math.random() * 200, 0.25, 2);
      for (let i = 0; i < 8; i++) noise(c, t + 0.1 + i * 0.09, 0.03, 3500, 0.12, 3);
      break;
    case 'clang': // a blow turned on a shield
      [1180, 1630, 2410, 3170].forEach((f, i) => tone(c, t, 0.55 - i * 0.08, f, 0.07 - i * 0.012, 'triangle'));
      tone(c, t, 0.15, 150, 0.25, 'sine', 90); noise(c, t, 0.05, 3000, 0.25, 1); break;
    case 'call': { // "March on Gaul": a short buccina call to arms (natural horn notes: G C E G), then the march drum
      const N: Array<[number, number, number]> = [[392, 0, 0.13], [392, 0.15, 0.13], [523, 0.3, 0.2], [659, 0.52, 0.16], [784, 0.7, 0.55]];
      for (const [f, at, len] of N) brass(c, t + at, f, len, 0.16);
      tone(c, t + 0.7, 0.35, 98, 0.35, 'triangle', 55); noise(c, t + 0.7, 0.12, 180, 0.35, 1);
      break;
    }
    case 'lastturn': // the last turn begins: one long low horn call, rising at the end
      brass(c, t, 262, 0.35, 0.14); brass(c, t + 0.38, 392, 0.7, 0.16); break;
    case 'error':
      tone(c, t, 0.12, 180, 0.15, 'square'); break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(c, t + i * 0.14, 0.35, f, 0.2, 'triangle')); break;
  }
}
