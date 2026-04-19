import sys
import numpy as np
import soundfile as sf
from PIL import Image

IN, OUT = sys.argv[1], sys.argv[2]

COLS_PER_SEC = 22
FRAME_SIZE   = 2048
N_BANDS      = 8
BAND_EDGES_HZ = np.array([30, 80, 160, 320, 640, 1280, 2560, 5120, 12000])
ATTACK_SEC   = 0.010
DECAY_SEC    = 0.180
NORM_PCT     = 98.0

audio, sr = sf.read(IN)
if audio.ndim > 1:
    audio = audio.mean(axis=1)

hop = sr // COLS_PER_SEC
n_frames = max(1, (len(audio) - FRAME_SIZE) // hop + 1)
window = np.hanning(FRAME_SIZE)
freqs = np.fft.rfftfreq(FRAME_SIZE, d=1.0 / sr)
band_bins = np.clip(np.searchsorted(freqs, BAND_EDGES_HZ), 1, len(freqs) - 1)

rms       = np.zeros(n_frames, dtype=np.float32)
bands_raw = np.zeros((N_BANDS, n_frames), dtype=np.float32)
total_log = np.zeros(n_frames, dtype=np.float32)

for i in range(n_frames):
    chunk = audio[i * hop : i * hop + FRAME_SIZE]
    if len(chunk) < FRAME_SIZE:
        chunk = np.pad(chunk, (0, FRAME_SIZE - len(chunk)))
    rms[i] = np.sqrt(np.mean(chunk ** 2))
    mag = np.abs(np.fft.rfft(chunk * window))
    total_log[i] = np.log1p(mag.sum())
    for b in range(N_BANDS):
        lo, hi = band_bins[b], band_bins[b + 1]
        bands_raw[b, i] = np.log1p(mag[lo:hi].mean())

flux  = np.diff(total_log, prepend=total_log[0])
onset = np.maximum(0.0, flux)

dt        = 1.0 / COLS_PER_SEC
att_alpha = 1.0 - np.exp(-dt / ATTACK_SEC)
dec_alpha = 1.0 - np.exp(-dt / DECAY_SEC)
bands = np.zeros_like(bands_raw)
for b in range(N_BANDS):
    env = 0.0
    for i in range(n_frames):
        x = bands_raw[b, i]
        a = att_alpha if x > env else dec_alpha
        env = x * a + env * (1.0 - a)
        bands[b, i] = env


def percentile_norm(x, p=NORM_PCT):
    scale = np.percentile(x, p) + 1e-9
    return np.clip(x / scale, 0.0, 1.0)


for b in range(N_BANDS):
    bands[b] = percentile_norm(bands[b])
onset_n = percentile_norm(onset)
rms_n   = percentile_norm(rms)

img = np.zeros((N_BANDS, n_frames, 3), dtype=np.uint8)
img[..., 0] = (bands * 255).astype(np.uint8)
img[..., 1] = (onset_n[None, :] * 255).astype(np.uint8)
img[..., 2] = (rms_n[None, :] * 255).astype(np.uint8)

Image.fromarray(img, mode="RGB").save(OUT)
print(f"wrote {OUT}: {n_frames} cols x {N_BANDS} bands, {n_frames / COLS_PER_SEC:.2f}s")
