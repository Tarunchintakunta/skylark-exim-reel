"""Pull a live clip's blue sky, sea and fence toward the CG film's warm haze (STYLE.md: flat hazy warm-grey sky), before
the plant grade. Per pixel, the bluer it is than red (B-R over 6..30) the more it becomes warm grey of its own luminance,
lifted toward the haze, so the cold walls, steel and the dock stay as they were. Per frame, so a moving camera is fine.
  python3 scripts/sky-haze.py <in.mp4> <out.mp4> [--amount 0.9] [--lift 0.25]
Used on: hf-unload-fish (the wild path's first live clip after cg-arrive, 11 Nov). 0 credits.
"""
import argparse, subprocess
import cv2, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--amount', type=float, default=0.9); ap.add_argument('--lift', type=float, default=0.25)
a = ap.parse_args()
cap = cv2.VideoCapture(a.src); w, h = int(cap.get(3)), int(cap.get(4))
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '24', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', a.dst], stdin=subprocess.PIPE)
warm = np.array([0.80, 0.93, 1.06], np.float32)          # BGR multipliers of a warm grey (haze: R > G > B)
while True:
    ok, f = cap.read()
    if not ok: break
    f = f.astype(np.float32); B, G, R = f[..., 0], f[..., 1], f[..., 2]
    m = np.clip((B - R - 6) / 24, 0, 1)
    m = cv2.GaussianBlur(m, (0, 0), 2)[..., None] * a.amount
    L = (0.0722 * B + 0.7152 * G + 0.2126 * R)[..., None]
    haze = (L + (235 - L) * a.lift) * warm
    ff.stdin.write(np.clip(f * (1 - m) + haze * m, 0, 255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
