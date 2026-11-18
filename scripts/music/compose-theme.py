# Usage: pip install numpy scipy soundfile && python3 scripts/music/compose-theme.py && ffmpeg -i theme.wav -c:a libvorbis -q:a 3.5 src/client/arlr/music/theme.ogg
# Original loop for "All Roads Lead to Rome": D Dorian, 66 BPM, lyre + reed/bone flute + drone + frame drum.
# Everything is synthesised here (no samples). The render wraps its own tail onto the start, so it loops seamlessly.
import numpy as np
import soundfile as sf

SR = 44100
BPM = 66
BEAT = 60 / BPM
BARS = 24
L = int(round(BARS * 4 * BEAT * SR))
TAIL = int(6 * SR)
rng = np.random.default_rng(7)

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def hz(n: str) -> float:
    name, octv = n[:-1], int(n[-1])
    return 440.0 * 2 ** ((NOTE[name] + 12 * (octv + 1) - 69) / 12)

L_ch = np.zeros((2, L + TAIL))
def put(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    n = min(len(sig), L_ch.shape[1] - i)
    lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L_ch[0, i:i + n] += sig[:n] * gain * lg
    L_ch[1, i:i + n] += sig[:n] * gain * rg

# ---------------------------------------------------------------- instruments
def lyre(f, dur=3.2, bright=0.5):
    """Karplus-Strong pluck with a gut-string damping and a small wooden body resonance."""
    n = int(dur * SR); p = int(round(SR / f - 0.5))  # the averaging filter adds half a sample of delay
    from scipy.signal import lfilter, iirpeak
    x = np.zeros(n); x[:p] = rng.uniform(-1, 1, p) * np.hanning(p) ** 0.3
    damp = 0.996 - 0.002 * (1 - bright)
    a = np.zeros(p + 2); a[0] = 1; a[p] = -damp / 2; a[p + 1] = -damp / 2
    out = lfilter([1.0], a, x)  # Karplus-Strong as a feedback comb
    # body: two soft resonances
    for fc, q, g in ((220, 4, 0.25), (520, 5, 0.15)):
        b, a = iirpeak(fc, q, SR); out = out + g * lfilter(b, a, out)
    env = np.minimum(1, np.arange(n) / (0.004 * SR))
    return out * env

def flute(f, dur, vib=True):
    """Breathy end-blown flute: weak harmonics, chiff, breath noise around the pitch, late vibrato."""
    n = int(dur * SR); t = np.arange(n) / SR
    scoop = 1 - 0.012 * np.exp(-t / 0.06)
    v = (0.006 * np.sin(2 * np.pi * 4.8 * t) * np.clip((t - 0.35) / 0.4, 0, 1)) if vib else 0
    ph = 2 * np.pi * np.cumsum(f * scoop * (1 + v)) / SR
    tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    from scipy.signal import butter, lfilter
    b, a = butter(2, [max(50, f * 0.7) / (SR / 2), min(f * 2.6, SR / 2 - 100) / (SR / 2)], 'band')
    breath = lfilter(b, a, rng.normal(0, 1, n)) * 0.35
    chiff = rng.normal(0, 1, n) * np.exp(-t / 0.025) * 0.25
    att, rel = 0.09, 0.18
    env = np.clip(t / att, 0, 1) * np.clip((dur - t) / rel, 0, 1)
    env *= 1 + 0.08 * np.sin(2 * np.pi * 0.7 * t)  # breath pressure
    return (tone + breath + chiff) * env * 0.5

def drone(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    from scipy.signal import butter, lfilter
    b, a = butter(2, [f * 0.9 / (SR / 2), f * 4 / (SR / 2)], 'band')
    s += lfilter(b, a, rng.normal(0, 1, n)) * 0.25
    return s * (0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t))

def drum(strength=1.0, low=True):
    n = int(0.6 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (70 if low else 140) * t * (1 + 0.5 * np.exp(-t / 0.03))) * np.exp(-t / (0.25 if low else 0.08))
    from scipy.signal import butter, lfilter
    b, a = butter(2, [600 / (SR / 2), 3000 / (SR / 2)], 'band')
    skin = lfilter(b, a, rng.normal(0, 1, n)) * np.exp(-t / 0.02) * 0.4
    return (body + skin) * strength * 0.6

# ---------------------------------------------------------------- score (original, D Dorian)
CH = {  # lyre arpeggio tones per chord, low to high
    'Dm': ['D3', 'A3', 'D4', 'F4', 'A4'], 'C': ['C3', 'G3', 'C4', 'E4', 'G4'], 'Am': ['A2', 'E3', 'A3', 'C4', 'E4'],
    'F': ['F2', 'C3', 'F3', 'A3', 'C4'], 'G': ['G2', 'D3', 'G3', 'B3', 'D4'], 'Em': ['E3', 'B3', 'E4', 'G4', 'B4'],
}
prog = ['Dm', 'Dm', 'C', 'Dm',   # intro (lyre alone)
        'Dm', 'C', 'Dm', 'Am', 'F', 'C', 'G', 'Dm',   # A
        'F', 'C', 'Dm', 'Am', 'Dm', 'G', 'C', 'Am',   # B
        'Dm', 'C', 'Am', 'Dm']  # outro, back to the top
# flute melody: (bar, beat, note, beats) — A section from bar 4, B from bar 12, answer phrase in the outro
mel = [
    (4, 0, 'A4', 1.5), (4, 1.5, 'G4', .5), (4, 2, 'F4', 1), (4, 3, 'E4', 1),
    (5, 0, 'D4', 2), (5, 2, 'E4', 1), (5, 3, 'F4', 1),
    (6, 0, 'G4', 1.5), (6, 1.5, 'F4', .5), (6, 2, 'E4', 2),
    (7, 0, 'C5', 1), (7, 1, 'B4', 1), (7, 2, 'A4', 2),
    (8, 0, 'F4', 1.5), (8, 1.5, 'G4', .5), (8, 2, 'A4', 2),
    (9, 0, 'G4', 1), (9, 1, 'E4', 1), (9, 2, 'C4', 2),
    (10, 0, 'D4', 1), (10, 1, 'E4', 1), (10, 2, 'B4', 2),
    (11, 0, 'A4', 3.5),
    (12, 0, 'C5', 1.5), (12, 1.5, 'A4', .5), (12, 2, 'F4', 2),
    (13, 0, 'E4', 1), (13, 1, 'G4', 1), (13, 2, 'C5', 1), (13, 3, 'B4', 1),
    (14, 0, 'A4', 1.5), (14, 1.5, 'D5', .5), (14, 2, 'C5', 1), (14, 3, 'A4', 1),
    (15, 0, 'E4', 3),
    (16, 0, 'F4', 1), (16, 1, 'A4', 1), (16, 2, 'D5', 2),
    (17, 0, 'B4', 1.5), (17, 1.5, 'A4', .5), (17, 2, 'G4', 2),
    (18, 0, 'E4', 1), (18, 1, 'G4', 1), (18, 2, 'F4', 1), (18, 3, 'E4', 1),
    (19, 0, 'C4', 1.5), (19, 1.5, 'D4', .5), (19, 2, 'E4', 2),
    (20, 0, 'D4', 3.5),
    (22, 2, 'E4', 1), (22, 3, 'C4', 1),
    (23, 0, 'D4', 3),
]
# a second, lower flute doubles some long notes a fifth/third below in the B section (heterophony)
low = [(b, bt, n, d) for (b, bt, n, d) in mel if 12 <= b <= 19 and d >= 2]
DOWN = {'C5': 'F4', 'D5': 'A4', 'A4': 'D4', 'G4': 'C4', 'F4': 'D4', 'E4': 'A3', 'B4': 'G4', 'D4': 'A3'}

bar_t = lambda b, beat=0.0: (b * 4 + beat) * BEAT
for b, c in enumerate(prog):
    tones = CH[c]
    pattern = [0, 2, 1, 3, 4, 3, 2, 1] if b % 2 == 0 else [0, 2, 3, 4, 2, 3, 1, 2]
    for k, idx in enumerate(pattern):  # eighth-note arpeggio, gently swung and humanised
        t = bar_t(b, k * 0.5 + (0.06 if k % 2 else 0)) + rng.normal(0, 0.006)
        vel = (0.9 if k == 0 else 0.55 + 0.15 * (k % 4 == 2)) * (0.85 if b < 4 else 1)
        put(lyre(hz(tones[idx]), 2.8, bright=0.4 + 0.3 * vel), max(0, t), pan=-0.25 + 0.1 * (idx - 2), gain=0.32 * vel)
    if b % 4 == 3:  # a strummed chord closing each four-bar phrase
        for j, n in enumerate(tones[1:]):
            put(lyre(hz(n), 3.5, 0.6), bar_t(b, 3.5) + j * 0.025, pan=-0.2, gain=0.18)
    # frame drum from bar 4: low on 1, light on the "and" of 2, low on 3
    if 4 <= b < 22:
        put(drum(1.0, True), bar_t(b, 0), 0.1, 0.5)
        put(drum(0.5, False), bar_t(b, 1.5), 0.15, 0.4)
        put(drum(0.8, True), bar_t(b, 2), 0.1, 0.45)
        if b % 2: put(drum(0.35, False), bar_t(b, 3.5), 0.15, 0.4)

# drone on D/A through the whole loop, overlapping itself across the seam
seg = 8 * 4 * BEAT
for k in range(3):
    put(drone(hz('D2'), seg + 2) * np.r_[np.linspace(0, 1, SR), np.ones(int((seg + 2) * SR) - 2 * SR), np.linspace(1, 0, SR)], k * seg - 1 if k else 0, 0, 0.09)
    put(drone(hz('A2'), seg + 2) * np.r_[np.linspace(0, 1, SR), np.ones(int((seg + 2) * SR) - 2 * SR), np.linspace(1, 0, SR)], k * seg - 1 if k else 0, 0, 0.05)

for b, bt, n, d in mel:
    put(flute(hz(n), d * BEAT * 0.97), bar_t(b, bt), 0.2, 0.33)
for b, bt, n, d in low:
    put(flute(hz(DOWN[n]), d * BEAT * 0.95, vib=False), bar_t(b, bt) + 0.03, -0.35, 0.16)

# ---------------------------------------------------------------- room, loop seam, level
from scipy.signal import fftconvolve
ir_t = np.arange(int(2.6 * SR)) / SR
ir = np.stack([rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t / 0.55) for _ in range(2)])
ir[:, : int(0.012 * SR)] = 0
wet = np.stack([fftconvolve(L_ch[c], ir[c])[: L_ch.shape[1]] for c in range(2)])
wet *= np.sqrt((L_ch ** 2).mean()) / max(1e-9, np.sqrt((wet ** 2).mean())) * 0.35
mix = L_ch + wet
loop = mix[:, :L].copy()
loop[:, :TAIL] += mix[:, L:L + TAIL]  # wrap tails onto the start: seamless loop
loop -= loop.mean(axis=1, keepdims=True)
# gentle high cut for warmth
from scipy.signal import butter, sosfilt
pad = int(SR)
loop = sosfilt(butter(2, 6500 / (SR / 2), output='sos'), np.concatenate([loop[:, -pad:], loop], axis=1), axis=1)[:, pad:]  # circular, so the seam stays clean
rms = np.sqrt((loop ** 2).mean())
loop *= 10 ** (-20 / 20) / rms  # about -20 dBFS RMS, roughly -18 LUFS for this material
loop /= max(1, np.abs(loop).max() / 0.95)
sf.write('theme.wav', loop.T, SR)
print(f'{L / SR:.1f} s, peak {np.abs(loop).max():.2f}')
