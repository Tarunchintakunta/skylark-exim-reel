"""Paint small marks on a moving vehicle (a yellow number plate, a badge) in the vehicle's body colour (STYLE.md: no
readable text). Tracks the vehicle by template matching from frame 0, so the patches move with it. 0 credits.
  python3 scripts/cg-plate-paint.py <in.mp4> <out.mp4> --track X0:Y0:X1:Y1 --paint X0:Y0:X1:Y1 ... [--ring N]
--track: a box around the vehicle in frame 0. --paint: boxes in frame 0 to fill; each fill is the median colour of a
ring of --ring px around the box (minus yellow pixels), or of the --body box (the plain body panel), feathered at
the edge. Used on:
  p2 (cg-sample) HD  --track 905:195:1175:310 --paint 926:297:946:307 954:212:971:220 --body 985:258:1000:270
ponytail: translation only (the vehicle is far and barely scales); add scale to the match if a vehicle grows a lot.
"""
import argparse, subprocess
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--track', required=True)
ap.add_argument('--paint', nargs='+', required=True)
ap.add_argument('--ring', type=int, default=5)
ap.add_argument('--body', default=None, help='box in frame 0 on the plain body panel; its median colour fills every patch')
a = ap.parse_args()
box = lambda s: tuple(int(v) for v in s.split(':'))
tx0, ty0, tx1, ty1 = box(a.track)
paints = [box(p) for p in a.paint]

cap = cv2.VideoCapture(a.src)
w, h = int(cap.get(3)), int(cap.get(4))
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '24', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', a.dst], stdin=subprocess.PIPE)
tmpl, dx, dy, f = None, 0, 0, 0
while True:
    ok, img = cap.read()
    if not ok:
        break
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if tmpl is None:
        tmpl = g[ty0:ty1, tx0:tx1]
    else:  # search near the last position; refresh the template so slow drift and lighting follow
        m = 60
        sx0, sy0 = max(0, tx0 + dx - m), max(0, ty0 + dy - m)
        win = g[sy0:min(h, ty1 + dy + m), sx0:min(w, tx1 + dx + m)]
        _, _, _, (bx, by) = cv2.minMaxLoc(cv2.matchTemplate(win, tmpl, cv2.TM_CCOEFF_NORMED))
        dx, dy = sx0 + bx - tx0, sy0 + by - ty0
        tmpl = g[ty0 + dy:ty1 + dy, tx0 + dx:tx1 + dx]
    for x0, y0, x1, y1 in paints:
        x0, x1, y0, y1 = x0 + dx, x1 + dx, y0 + dy, y1 + dy
        if a.body:
            bx0, by0, bx1, by1 = box(a.body)
            col = np.median(img[by0 + dy:by1 + dy, bx0 + dx:bx1 + dx].reshape(-1, 3), axis=0)
        else:  # ring around the box, box itself and yellow left out
            r = a.ring
            reg = img[y0 - r:y1 + r, x0 - r:x1 + r].astype(int)
            inner = np.zeros(reg.shape[:2], bool); inner[r:-r, r:-r] = True
            ring = reg[~inner]
            keep = ~((ring[:, 2] - ring[:, 0] > 35) & (ring[:, 1] - ring[:, 0] > 15))
            col = np.median(ring[keep] if keep.any() else ring, axis=0)
        mask = np.zeros((h, w), np.float32)
        cv2.rectangle(mask, (x0, y0), (x1, y1), 1.0, -1)
        mask = cv2.GaussianBlur(mask, (0, 0), 1.5)[..., None]
        img = (img * (1 - mask) + col * mask).astype(np.uint8)
    ff.stdin.write(img.tobytes())
    f += 1
ff.stdin.close(); ff.wait()
print(f'{f} frames, {len(paints)} patches, last offset {dx},{dy}')
