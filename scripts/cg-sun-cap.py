"""Remove a sun (and its reflection on water) from a generated clip when NO sun may stay (STYLE.md, 11 Nov: sun out of
view or fully hidden). Unlike cg-sun-fix.py, nothing is mirrored in: inside each zone, pixels brighter than the
surrounding haze are pulled down to it. The haze level comes from inpainting a blurred, downsampled brightness map
across the zone, so dark palm fronds in front of the sun keep their shape. 0 credits.
  python3 scripts/cg-sun-cap.py <in.mp4> <out.mp4> --zone F:X:Y:RX:RY ... [--zone ...] [--xmax X] [--ramp N]
Each --zone is one track (points joined by straight lines) and is active only between its first and last frame; its
strength ramps in and out over --ramp frames (no ramp-out at the clip's last frame). --xmax keeps pixels right of X
untouched (e.g. the white truck). Used on:
  p2 (cg-sample) 480p test E1  --zone 0:237:74:48:26 20:240:70:48:26 40:252:70:48:26
                               --zone 38:282:112:72:60 51:290:160:72:60 61:294:150:72:60 81:294:140:72:60 120:294:138:72:60
                               --zone 58:268:224:70:40 69:321:237:62:32 85:310:231:62:36 101:312:252:62:56 120:318:250:62:52 --xmax 362
  p2 HD: Lab fill + --lift 25/40 still left grey blotches or a soft glow, so p2 went to a crossfade instead.
ponytail: hand-measured zones per take; re-measure on the HD (scale x, y, rx, ry by width/854).
"""
import argparse, subprocess
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--zone', nargs='+', action='append', required=True)
ap.add_argument('--xmax', type=int, default=None)
ap.add_argument('--ramp', type=int, default=8)
ap.add_argument('--keep', type=float, default=0.15, help='share of the brightness above the haze that stays')
ap.add_argument('--lift', type=float, default=0, help='Lab L units above the haze left untouched (spares sunlit water around the core)')
a = ap.parse_args()

def zone(pts):
    p = sorted(tuple(map(float, s.split(':'))) for s in pts)
    fs = [q[0] for q in p]
    return fs[0], fs[-1], lambda f: [float(np.interp(f, fs, [q[i] for q in p])) for i in (1, 2, 3, 4)]

zones = [zone(z) for z in a.zone]
cap = cv2.VideoCapture(a.src)
w, h, n = int(cap.get(3)), int(cap.get(4)), int(cap.get(7))
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '24', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', a.dst], stdin=subprocess.PIPE)
f = 0
while True:
    ok, img = cap.read()
    if not ok:
        break
    mask = np.zeros((h, w), np.float32)
    for f0, f1, at in zones:
        if not f0 <= f <= f1:
            continue
        k = min(1.0, (f - f0 + 1) / a.ramp, 1.0 if f1 >= n - 1 else (f1 - f + 1) / a.ramp)
        x, y, rx, ry = at(f)
        z = np.zeros_like(mask)
        cv2.ellipse(z, (int(x), int(y)), (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
        mask = np.maximum(mask, z * k)
    if mask.any():
        if a.xmax is not None:
            mask[:, a.xmax:] = 0
        hard = (mask > 0).astype(np.uint8)
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        s = max(8, w // 107)  # haze: inpaint the zone on small blurred L, a, b maps (8 px at 854 wide)
        hole = cv2.dilate(cv2.resize(hard, (w // s, h // s), interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
        def fill(ch):
            small = cv2.resize(cv2.GaussianBlur(ch, (0, 0), 3 * s / 8), (w // s, h // s), interpolation=cv2.INTER_AREA)
            f_ = cv2.inpaint(np.clip(small, 0, 255).astype(np.uint8), hole, 5, cv2.INPAINT_TELEA).astype(np.float32)
            return cv2.GaussianBlur(cv2.resize(f_, (w, h), interpolation=cv2.INTER_CUBIC), (0, 0), 6 * s / 8)
        L, haze = lab[..., 0], fill(lab[..., 0]) + a.lift
        over = np.clip((L - haze) / 20, 0, 1)  # how much of the pixel is sun, not haze
        m = cv2.GaussianBlur(mask, (0, 0), 8 * s / 8)
        out = lab.copy()
        out[..., 0] = np.where(L > haze, haze + (L - haze) * a.keep, L)
        for c in (1, 2):  # the capped sun core is near white: give it the haze's warm tint, not grey
            out[..., c] = lab[..., c] * (1 - over) + fill(lab[..., c]) * over
        lab = lab * (1 - m[..., None]) + out * m[..., None]
        img = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    ff.stdin.write(img.tobytes())
    f += 1
ff.stdin.close(); ff.wait()
print(f'{f} frames, {len(zones)} zones capped to the haze')
