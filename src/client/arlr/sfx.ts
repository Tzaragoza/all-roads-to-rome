// Optional flavour sounds, synthesised with WebAudio (no asset files, no licensing).
// On by default (switch off in the header); browsers only allow audio after a user gesture anyway.

export type Sfx = 'road' | 'march' | 'garrison' | 'recruit' | 'revolt' | 'burn' | 'turn' | 'error' | 'win';

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

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext, t: number, dur: number, freq: number, gain: number, q = 1) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t); src.stop(t + dur);
}

function tone(c: AudioContext, t: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(400, freq * 4);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export function play(s: Sfx) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  switch (s) {
    case 'road': // two spade strikes into gravel
      noise(c, t, 0.12, 900, 0.5, 0.8); noise(c, t + 0.16, 0.12, 700, 0.45, 0.8); break;
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
    case 'error':
      tone(c, t, 0.12, 180, 0.15, 'square'); break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(c, t + i * 0.14, 0.35, f, 0.2, 'triangle')); break;
  }
}
