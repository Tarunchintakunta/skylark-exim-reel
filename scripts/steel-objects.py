"""Rebuild the crates, ice chests and buckets of a moving shot as stainless/galvanised steel (#last-fixes): grading alone
leaves moulded plastic (ribbed sides, a styrofoam chest), so inside each object's outline the surface is redrawn.
- The outlines are drawn once, on frame 0 (2560x1440 coordinates, in a JSON list of polygons), and follow the camera:
  each frame's homography to frame 0 comes from ORB matches with RANSAC.
- Only the object's own pixels are redrawn: a background plate (the median of every frame aligned to frame 0) is warped
  back into each frame, and pixels far from it (a worker's arm or leg passing in front, shrimp tipped in) are kept.
- Steel: the frame's own light, blurred wide enough to lose the moulded ribs, mapped to a cool steel grey; brushed
  horizontal grain, a soft sheen band, a thin bright pressed rim along each top edge and darker edges elsewhere. Grain,
  sheen and edges are drawn in frame-0 space and warped with the camera, so they stay on the object.
Framing, timing and motion are untouched; nothing is generated.
  [GAIN=0.42] [LIFT=92] [TINT=0.35] [GATE=28] python3 scripts/steel-objects.py <in.mp4> <out.mp4> <objects.json>
  GAIN/LIFT map the blurred light to the steel's grey; TINT is how much of the scene's colour the steel picks up (a
  sunset warms it, as it would real steel); GATE is how far (mean RGB) a pixel may be from the background plate and
  still be redrawn: lower it where someone in front is close in colour to the object (a cream turban over a white chest)
  objects.json: [{"name": "crate-1", "poly": [[x, y], ...], "blur": 18}, ...]
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np

src, out, spec = sys.argv[1], sys.argv[2], sys.argv[3]
objs = json.load(open(spec))
GAIN, LIFT, TINT, GATE = (float(os.environ.get(k, d)) for k, d in (('GAIN', 0.42), ('LIFT', 92), ('TINT', 0.35), ('GATE', 28)))
W, H = 2560, 1440
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
n = len(frames)

# camera: homography frame 0 -> frame k, matched at half size
orb = cv2.ORB_create(6000)
small = lambda f: cv2.cvtColor(cv2.resize(f, (W // 2, H // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY)
k0, d0 = orb.detectAndCompute(small(frames[0]), None)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
S = np.diag([2.0, 2.0, 1.0])
Hs = []
for f in frames:
    k1, d1 = orb.detectAndCompute(small(f), None)
    m = bf.match(d0, d1)
    a = np.float32([k0[x.queryIdx].pt for x in m]); b = np.float32([k1[x.trainIdx].pt for x in m])
    h, _ = cv2.findHomography(a, b, cv2.RANSAC, 2.0)
    Hs.append(S @ h @ np.linalg.inv(S))
print('homographies ok', file=sys.stderr)

# background plate in frame-0 space (quarter size is enough for the gate)
q = 2; Q = np.diag([1 / q, 1 / q, 1.0])
al = [cv2.warpPerspective(cv2.resize(f, (W // q, H // q), interpolation=cv2.INTER_AREA), Q @ np.linalg.inv(h) @ np.linalg.inv(Q), (W // q, H // q)) for f, h in zip(frames, Hs)]
plate = np.median(np.stack(al), 0).astype(np.float32)

# frame-0 layers: object masks, and the steel detail (grain + sheen + rims)
poly = np.zeros((H, W), np.float32); detail = np.zeros((H, W), np.float32); blur = np.zeros((H, W), np.float32)
rng = np.random.default_rng(3)
grain = cv2.resize(rng.normal(0, 1, (H, W // 40)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
grain = cv2.GaussianBlur(grain, (0, 0), 0.8) * 5
for o in objs:
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.int32(o['poly'])], 1)
    ys, xs = np.nonzero(m); y0, y1 = ys.min(), ys.max()
    v = np.clip((np.arange(H, dtype=np.float32)[:, None] - y0) / max(1, y1 - y0), 0, 1)
    sheen = 26 * np.exp(-((v - 0.28) / 0.16) ** 2) - 18 * v  # a soft highlight high on the face, darker toward the ground
    # pressed edges: the outline's band, bright where it faces up (the rim), dark on the sides and the foot
    mb = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.5)
    gy = cv2.Sobel(mb, cv2.CV_32F, 0, 1, ksize=5); gx = cv2.Sobel(mb, cv2.CV_32F, 1, 0, ksize=5)
    edge = np.clip(np.where(gy > 0, gy * 1.6, -np.hypot(gx, gy) * 0.9), -60, 60) * 3
    detail = np.where(m > 0, grain + sheen + edge, detail)
    detail = np.where((m == 0) & (np.abs(edge) > 1), detail + edge, detail)
    poly = np.maximum(poly, m); blur = np.where(m > 0, o.get('blur', 18), blur)
sig = float(np.max(blur)) or 18.0
poly_soft = cv2.GaussianBlur(poly, (0, 0), 1.5)

enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
for k, (f, h) in enumerate(zip(frames, Hs)):
    a = f.astype(np.float32)
    mk = cv2.warpPerspective(poly_soft, h, (W, H))
    dk = cv2.warpPerspective(detail, h, (W, H))
    # gate: close to the background plate (nothing passing in front)
    pk = cv2.resize(cv2.warpPerspective(plate, Q @ h @ np.linalg.inv(Q), (W // q, H // q)), (W, H), interpolation=cv2.INTER_LINEAR)
    diff = np.abs(cv2.resize(cv2.resize(a, (W // q, H // q), interpolation=cv2.INTER_AREA), (W, H)) - pk).mean(2)
    gate = cv2.GaussianBlur(cv2.erode((diff < GATE).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32), (0, 0), 3)
    m = (mk * gate)[..., None]
    # the object's light without its moulding: blurred inside the outline only
    L = a.mean(2)
    hard = (mk > 0.5).astype(np.float32)
    Ls = cv2.GaussianBlur(L * hard, (0, 0), sig) / np.maximum(cv2.GaussianBlur(hard, (0, 0), sig), 1e-3)
    g = GAIN * Ls + LIFT + dk
    # ambient colour round the object, normalised to grey: steel reflects its surroundings
    amb = cv2.GaussianBlur(cv2.resize(a, (W // 16, H // 16), interpolation=cv2.INTER_AREA), (0, 0), 6)
    amb = cv2.resize(amb / np.maximum(amb.mean(2, keepdims=True), 1), (W, H))
    cool = np.array([0.96, 1.0, 1.05], np.float32)
    steel = g[..., None] * ((1 - TINT) * cool + TINT * amb)
    enc.stdin.write((a * (1 - m) + steel * m).clip(0, 255).astype(np.uint8).tobytes())
    if k % 12 == 0:
        print('frame', k, file=sys.stderr)
enc.stdin.close()
sys.exit(enc.wait())
