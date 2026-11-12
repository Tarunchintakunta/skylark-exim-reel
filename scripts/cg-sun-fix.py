"""Remove a second sun from a generated clip (STYLE.md: a sun that moves between a shot's two keyframes renders as two
suns mid-shot). Keeps one sun (the one the clip ends on) and rebuilds the sky over the other from the mirror image of
the clean sky on the far side of the kept sun (a sun's glow is near symmetric left/right; OpenCV inpaint left a pale
disc). The patch stays above FLOOR and fades in over START..FULL, so one sun hands over to the other. 0 credits.
  python3 scripts/cg-sun-fix.py <in.mp4> <out.mp4> --drop F:X:Y ... --keep F:X:Y ... --start N --full N --floor ROW
--drop / --keep: points on each sun's track (frame:x:y in the clip's pixels), joined by straight lines, held past the ends.
Measure them on the contact sheet or with ffmpeg crops. Used on:
  cg-depart-3  --drop 15:536:198 28:562:198 38:582:185 52:610:183 --keep 28:614:180 90:678:180 --start 16 --full 22 --floor 208
ponytail: hand-measured tracks per take (blob detection also caught the sun's glint on the water); re-measure if re-rendered.
"""
import argparse, subprocess
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--drop', nargs='+', required=True)
ap.add_argument('--keep', nargs='+', required=True)
ap.add_argument('--start', type=int, required=True)
ap.add_argument('--full', type=int, required=True)
ap.add_argument('--floor', type=int, required=True, help='lowest row patched, just above the horizon or breakwater')
ap.add_argument('--rx', type=int, default=62); ap.add_argument('--ry', type=int, default=48)
a = ap.parse_args()

def track(pts):
    p = sorted((int(f), float(x), float(y)) for f, x, y in (s.split(':') for s in pts))
    fs = [q[0] for q in p]
    return lambda f: (float(np.interp(f, fs, [q[1] for q in p])), float(np.interp(f, fs, [q[2] for q in p])))

drop, keep = track(a.drop), track(a.keep)
cap = cv2.VideoCapture(a.src)
w, h = int(cap.get(3)), int(cap.get(4))
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '24', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', a.dst], stdin=subprocess.PIPE)
xs = np.arange(w)
f = 0
while True:
    ok, img = cap.read()
    if not ok:
        break
    if f >= a.start:
        (ox, oy), (nx, ny) = drop(f), keep(f)
        mask = np.zeros((h, w), np.float32)
        cv2.ellipse(mask, (int(ox), int(oy) - 8), (a.rx, a.ry), 0, 0, 360, 1.0, -1)
        cv2.circle(mask, (int(nx), int(ny)), 20, 0.0, -1)
        mask[a.floor:] = 0
        mask = cv2.GaussianBlur(mask, (0, 0), 10)[..., None]
        mirror = img[:, np.clip((2 * nx - xs).astype(int), 0, w - 1)]
        k = min(1.0, (f - a.start + 1) / (a.full - a.start + 1))
        img = (img * (1 - mask * k) + mirror * (mask * k)).astype(np.uint8)
    ff.stdin.write(img.tobytes())
    f += 1
ff.stdin.close(); ff.wait()
print(f'{f} frames, second sun replaced from {a.start} (full from {a.full})')
