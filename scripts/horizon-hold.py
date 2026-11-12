"""Hold a clip's horizon at one height: undo a slow camera tilt in post (STYLE.md: camera on one line, horizon level).
Per frame, the horizon row is the strongest change in the row-mean brightness (sky to sea) of the side strips; the rows
are smoothed with a quadratic fit over time, so the correction never jitters. Each frame is scaled about its own
horizon and moved so that horizon lands on one anchor row, with the smallest zoom that keeps every edge covered (the
anchor is chosen to minimise that zoom). Prints the horizon rows of the result as a check. 0 credits.
  python3 scripts/horizon-hold.py <in.mp4> <out.mp4>
Used on: cg-sail (shot 5, the camera tilted up despite the prompt, 11 Nov).
ponytail: vertical shift only (a small tilt is close to a shift); a large tilt also needs the keystone undone.
"""
import subprocess, sys
import cv2, numpy as np


def frames(path):
    cap, out = cv2.VideoCapture(path), []
    while True:
        ok, f = cap.read()
        if not ok:
            return out
        out.append(f)


def horizon(f, near=None):
    # near: only look within 12 % of the frame height of that row (the check, so the ship's edge can't win)
    # rows of the outer side strips only (the ship and its wake sit in the middle), upper 60 % of the frame
    h, w = f.shape[:2]
    g = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), max(3, h / 200))
    side = np.hstack([g[: int(h * 0.6), : int(w * 0.1)], g[: int(h * 0.6), int(w * 0.88):]])
    d = np.abs(np.diff(side.mean(1)))
    lo = 0 if near is None else max(0, int(near - h * 0.12))
    hi = len(d) if near is None else min(len(d), int(near + h * 0.12))
    return lo + int(np.argmax(d[lo:hi]))


src, dst = sys.argv[1], sys.argv[2]
fr = frames(src)
h, w = fr[0].shape[:2]
raw = np.array([horizon(f) for f in fr], float)
t = np.arange(len(fr))
fit = np.polyval(np.polyfit(t, raw, 2), t)

# output row y' samples source row fit + (y' - anchor) / s; covering 0..h needs s >= anchor/fit and (h-anchor)/(h-fit)
zoom = lambda a: max(np.max(a / fit), np.max((h - a) / (h - fit)))
anchor = min(np.linspace(fit.min(), fit.max(), 200), key=zoom)
s = zoom(anchor)
print(f'horizon rows {raw.min():.0f}..{raw.max():.0f} (fitted {fit.min():.1f}..{fit.max():.1f}), anchor {anchor:.1f}, zoom {s:.3f}')

ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '24',
                       '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', dst],
                      stdin=subprocess.PIPE)
for f, y in zip(fr, fit):
    M = np.array([[s, 0, (1 - s) * w / 2], [0, s, anchor - s * y]], np.float32)   # source row y -> output row anchor
    ff.stdin.write(cv2.warpAffine(f, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT).tobytes())
ff.stdin.close(); ff.wait()
print('result horizon rows (every 20th frame):', [horizon(f, anchor) for f in frames(dst)[::20]])
