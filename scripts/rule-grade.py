"""Clip rule fixes from the existing footage alone (#rulefix): nothing is generated, framing and timing stay.

Steel: every plastic crate and foam box is outlined on frame 0 (2560x1440 px, `objects`) and repainted as flat brushed
steel, the way scripts/steel-objects.py did hf-sort. The outline follows the camera (ORB homography to frame 0, RANSAC);
inside it a per-frame key picks the object's own pixels, so an outline can be loose and the fish, ice and hands in and
over the crate stay: `blue` (saturated blue plastic) or `foam` (bright, unsaturated and smooth: ice and fish are not
smooth), or `crate` (blue with next to no red: a worker's blue nitrile glove over the crate stays). Each object is repainted on its own: its light blurred wide enough to lose the moulding (ribs, slots), mapped
to a cool steel grey, a brushed horizontal grain that follows the camera, a bright pressed rim where an edge faces up
and darker edges elsewhere. `roi` (polygons in 0-1 frame coordinates) keys blue crates that move on their own
(trolleys, a crate carried past) frame by frame, with the same steel, each crate on its own.
Second pass on an already graded master (`key: all`): the whole outline, crate by crate, as flat brushed steel;
`cut` keeps what stands in front (a post, a rail), each cut an outline on the first and on the last frame, moved
linearly in between; `grain` and `sheen` scale the brushed grain and add soft diagonal highlights that follow the camera.
`screen` outlines are in frame coordinates, not tracked, and `frames` [from, to] limits any object to those frames.
Patches: a second vessel painted out to haze, an outline on frame 0 that follows the camera, inpainted and softened.
  python3 scripts/rule-grade.py <in.mp4> <out.mp4> <config.json>
  config: {"objects": [{"poly": [[x, y], ...], "holes": [[[x, y], ...]], "key": "blue" | "foam", "blur": 12}],
           "roi": [[[x, y], ...]] (0-1), "patches": [{"poly": [[x, y], ...], "upto": 72}]}
"""
import json
import subprocess
import sys

import cv2
import numpy as np

src, out, spec = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(spec))
W, H = 2560, 1440
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)

# camera: homography frame 0 -> frame k, matched at half size, from features only where the scene is rigid (`track`,
# 0-1 rectangles, per clip or per object): sea, nets and people would pull the fit
orb = cv2.ORB_create(6000)
small = [cv2.cvtColor(cv2.resize(f, (W // 2, H // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY) for f in frames]
feats = [orb.detectAndCompute(g, None) for g in small]
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
S = np.diag([2.0, 2.0, 1.0])
_cams = {}


def camera(track, fit=None):
    """`fit: similarity`: scale, turn and shift only, for a small `track` area where a full homography runs away"""
    key = json.dumps([track, fit])
    if key in _cams:
        return _cams[key]
    tm = None
    if track:
        tm = np.zeros((H // 2, W // 2), np.uint8)
        for x0, y0, x1, y1 in track:
            tm[int(y0 * H / 2):int(y1 * H / 2), int(x0 * W / 2):int(x1 * W / 2)] = 255
    if fit == 'template':
        _cams[key] = template(track[0])
        return _cams[key]
    k0, d0 = orb.detectAndCompute(small[0], tm)
    hs = []
    for k1, d1 in feats:
        m = bf.match(d0, d1)
        a = np.float32([k0[x.queryIdx].pt for x in m]); b = np.float32([k1[x.trainIdx].pt for x in m])
        if fit == 'similarity':
            h = np.vstack([cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)[0], [0, 0, 1]])
        else:
            h, _ = cv2.findHomography(a, b, cv2.RANSAC, 2.0)
        hs.append(S @ h @ np.linalg.inv(S))
    _cams[key] = hs
    return hs


def template(rect, reach=40):
    """`fit: template`: the `track` rectangle on frame 0 found again in every frame (normalised cross-correlation at half
    size, scale searched round the last frame's), as scale and shift: a rigid box the camera pushes in on, where a
    repeating mesh (crate slots) misleads feature matching"""
    x0, y0, x1, y1 = int(rect[0] * W / 2), int(rect[1] * H / 2), int(rect[2] * W / 2), int(rect[3] * H / 2)
    T = small[0][y0:y1, x0:x1]
    cx0, cy0 = (x0 + x1) / 2, (y0 + y1) / 2
    sc, cx, cy, hs = 1.0, cx0, cy0, []
    for g in small:
        best = (-2, sc, cx, cy)
        for f in sc * np.linspace(0.985, 1.03, 10):
            t = cv2.resize(T, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
            th, tw = t.shape
            wx0, wy0 = int(max(0, cx - tw / 2 - reach)), int(max(0, cy - th / 2 - reach))
            win = g[wy0:int(min(H // 2, cy + th / 2 + reach)), wx0:int(min(W // 2, cx + tw / 2 + reach))]
            if win.shape[0] < th or win.shape[1] < tw:
                continue
            r = cv2.matchTemplate(win, t, cv2.TM_CCOEFF_NORMED)
            _, v, _, (mx, my) = cv2.minMaxLoc(r)
            if v > best[0]:
                best = (v, f, wx0 + mx + tw / 2, wy0 + my + th / 2)
        _, sc, cx, cy = best
        # frame 0 -> this frame, full size
        hs.append(np.array([[sc, 0, 2 * (cx - sc * cx0)], [0, sc, 2 * (cy - sc * cy0)], [0, 0, 1]]))
    return hs


Hs = camera(cfg.get('track'))
_plates = {}
Q = np.diag([0.5, 0.5, 1.0])


def plate(track):
    """the scene with nothing passing: the median of every frame aligned to frame 0, at half size (`gate`)"""
    key = json.dumps(track)
    if key not in _plates:
        hs = camera(track)
        al = [cv2.warpPerspective(cv2.resize(f, (W // 2, H // 2), interpolation=cv2.INTER_AREA), Q @ np.linalg.inv(h) @ np.linalg.inv(Q), (W // 2, H // 2)) for f, h in zip(frames, hs)]
        _plates[key] = np.median(np.stack(al), 0).astype(np.float32)
    return _plates[key]


def gate(a, track, h, thr):
    """pixels close to the plate: nothing (a gloved hand, a fish held up) is passing in front of the object"""
    pk = cv2.warpPerspective(plate(track), Q @ h @ np.linalg.inv(Q), (W // 2, H // 2))
    diff = np.abs(cv2.resize(a, (W // 2, H // 2), interpolation=cv2.INTER_AREA) - pk).mean(2)
    return cv2.resize(cv2.erode((diff < thr).astype(np.uint8), np.ones((5, 5), np.uint8)), (W, H), interpolation=cv2.INTER_NEAREST) > 0

roi = None
if cfg.get('roi'):
    roi = np.zeros((H, W), np.uint8)
    for p in cfg['roi']:
        cv2.fillPoly(roi, [np.int32([[x * W, y * H] for x, y in p])], 1)

rng = np.random.default_rng(3)
GRAIN = cv2.GaussianBlur(cv2.resize(rng.normal(0, 1, (H, W // 40)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 0.8) * 5
TINT = np.array([0.95, 0.99, 1.05], np.float32)
# soft diagonal highlights, as on a brushed steel sheet under a strip light (`sheen`), 0-1
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_d = (_xx + 0.6 * _yy) % 900
SHEEN = np.exp(-((_d - 300) / 110) ** 2) + 0.6 * np.exp(-((_d - 640) / 70) ** 2)
del _yy, _xx, _d
# galvanised spangle (`spangle`): zinc crystals a few mm across, each a flat patch a shade lighter or darker, -1..1
_seed = np.ones((H, W), np.uint8)
_seed[rng.integers(0, H, 9000), rng.integers(0, W, 9000)] = 0
_, _lab = cv2.distanceTransformWithLabels(_seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_CCOMP)
SPANGLE = cv2.GaussianBlur(rng.uniform(-1, 1, _lab.max() + 1).astype(np.float32)[_lab], (0, 0), 0.7)
del _seed, _lab


def keys(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    blue = (b == mx) & (b - g > 12) & (b - r > 30) & (sat > 0.25) & (mx > 25)
    L = a.mean(2)
    sd = np.sqrt(np.maximum(cv2.GaussianBlur(L * L, (0, 0), 2.5) - cv2.GaussianBlur(L, (0, 0), 2.5) ** 2, 0))
    sd8 = np.sqrt(np.maximum(cv2.GaussianBlur(L * L, (0, 0), 8) - cv2.GaussianBlur(L, (0, 0), 8) ** 2, 0))
    foam = (L > 175) & (sat < 0.12) & (sd < 7)
    # inside a box's open top, next to the ice: crushed ice is smooth up close, not over 8 px; a foam wall is both
    wall = foam & (sd8 < 9)
    # moulded crate blue has next to no red (glove nitrile, ~55 red and more green, stays out of this key)
    crate = blue & (r < cfg.get('crate_r', 50)) & (g < cfg.get('crate_g', 0.6) * b) & (b < cfg.get('crate_b', 215)) & (b - r > cfg.get('crate_br', 0))
    # `solid`: the whole outline except ice (bright and grainy in blobs, not the thin line of an edge), blue gloves and
    # dark hands: the box's own edges then come from its outline and holes, not from a ragged key
    ice = cv2.morphologyEx(((L > 150) & (sd >= 8)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0
    solid = ~ice & ~blue & (L > 80)
    return {'blue': blue, 'crate': crate, 'foam': foam, 'wall': wall, 'solid': solid, 'all': np.ones_like(blue)}, L


def fill(m, k):
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0


def paint(a, L, hard, grain, sig, gain=0.5, lift=62, tone=None):
    """flat brushed steel over the hard mask, on its own light blurred inside the mask only; `tone` [gain, lift]: the
    object's own light kept (a mesh crate keeps its ribs and slots, read as perforated steel), no blur, no drawn edges"""
    hard = hard.astype(np.float32)
    if hard.sum() < 50:
        return a
    ys, xs = np.nonzero(hard)
    pad = int(3 * sig) + 8
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(H, ys.max() + pad), max(0, xs.min() - pad), min(W, xs.max() + pad)
    hd, Lb = hard[y0:y1, x0:x1], L[y0:y1, x0:x1]
    if tone:
        v = tone[0] * Lb + tone[1] + grain[y0:y1, x0:x1] * 0.4
        m = cv2.GaussianBlur(hd, (0, 0), 1.0)[..., None]
        a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - m) + np.minimum(v, 215)[..., None] * TINT * m
        return a
    base = cv2.GaussianBlur(Lb * hd, (0, 0), sig) / np.maximum(cv2.GaussianBlur(hd, (0, 0), sig), 1e-3)
    mb = cv2.GaussianBlur(hd, (0, 0), 2.0)
    gy = cv2.Sobel(mb, cv2.CV_32F, 0, 1, ksize=5); gx = cv2.Sobel(mb, cv2.CV_32F, 1, 0, ksize=5)
    edge = np.clip(np.where(gy > 0, gy * 1.6, -np.hypot(gx, gy) * 0.8), -50, 50) * 2.4
    v = gain * base + lift + grain[y0:y1, x0:x1] + edge
    v = np.where(v > 190, 190 + (v - 190) * 0.4, v)
    st = v[..., None] * TINT
    m = cv2.GaussianBlur(hd, (0, 0), 1.0)[..., None]
    a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - m) + st * m
    return a


_persist = {}


def persist(o):
    """frame-0 map of where this object's pixels are keyed (blue, or foam) in at least 70 % of the frames"""
    key = id(o)
    if key not in _persist:
        hs = camera(o.get('track', cfg.get('track')))
        acc = np.zeros((H // 2, W // 2), np.float32)
        for f, h in zip(frames, hs):
            bk = keys(f.astype(np.float32))[0]['foam' if o.get('key') in ('foam', 'solid') else 'blue'].astype(np.float32)
            acc += cv2.warpPerspective(cv2.resize(bk, (W // 2, H // 2)), Q @ np.linalg.inv(h) @ np.linalg.inv(Q), (W // 2, H // 2))
        m = (acc / len(frames) > 0.7).astype(np.uint8)
        _persist[key] = cv2.resize(cv2.dilate(m, np.ones((3, 3), np.uint8)), (W, H), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    return _persist[key]


objs = cfg.get('objects', [])
polys = []
for o in objs:
    if o.get('track') == 'self':  # the object's own features: no parallax against the room behind it
        xs, ys = [p[0] for p in o['poly']], [p[1] for p in o['poly']]
        o['track'] = [[max(0, min(xs) / W), max(0, min(ys) / H), min(1, max(xs) / W), min(1, max(ys) / H)]]
    pm = np.zeros((H, W), np.float32); cv2.fillPoly(pm, [np.int32(o['poly'])], 1)
    # `holes`: the open top of a box (its ice and fish): only its inner walls are repainted there (`wall` key)
    hm = np.zeros((H, W), np.float32)
    for hp in o.get('holes', []):
        cv2.fillPoly(hm, [np.int32(hp)], 1)
    if o.get('key') == 'solid':
        # the box's own shape: foam that stays put, closed over its moulding and ice-flecked rims, smoothed to a clean
        # edge against the table; it follows the camera in place of the hand-drawn outline
        m = cv2.morphologyEx((persist(o) > 0).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
        m = cv2.dilate(m, np.ones((o.get('spread', 1), o.get('spread', 1)), np.uint8))  # over its white rims and base: the table under it is steel too
        pm = (cv2.GaussianBlur(m.astype(np.float32), (0, 0), 4) > 0.5) * pm
    polys.append((pm, hm))

enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
for k, (f, h) in enumerate(zip(frames, Hs)):
    a = f.astype(np.float32)
    ks, L = keys(a)
    grain = cv2.warpPerspective(GRAIN, h, (W, H))
    styles = objs + [cfg.get('roi_style', {})]
    sheen = cv2.warpPerspective(SHEEN, h, (W, H)) if any(o.get('sheen') for o in styles) else None
    spangle = cv2.warpPerspective(SPANGLE, h, (W, H)) if any(o.get('spangle') for o in styles) else None
    for o, (pm, hm) in zip(objs, polys):
        if 'frames' in o and not o['frames'][0] <= k <= o['frames'][1]:
            continue
        ho = camera(o['track'], o.get('fit'))[k] if 'track' in o else h
        mk = (pm if o.get('screen') else cv2.warpPerspective(pm, ho, (W, H), flags=cv2.INTER_NEAREST)) > 0.5
        t = k / max(1, len(frames) - 1)
        for c in o.get('cut', []):
            cm = np.zeros((H, W), np.uint8)
            cv2.fillPoly(cm, [np.int32((1 - t) * np.float32(c['poly0']) + t * np.float32(c['poly1']))], 1)
            mk &= cm == 0
        key = ks[o.get('key', 'blue')]
        if o.get('holes'):
            hk = cv2.warpPerspective(hm, ho, (W, H), flags=cv2.INTER_NEAREST) > 0.5
            key = (key & ~hk) | (ks['wall'] & hk & mk) if o.get('key') == 'solid' else np.where(hk, ks['wall'], key)
        # `still`: only blue that stays put (blue in most frames at that spot, lit rims included); a gloved hand or its
        # shadow over the crate is blue only while it passes
        if o.get('key') == 'solid':
            key = cv2.medianBlur((key & mk).astype(np.uint8), 9) > 0
            n, lab, st, _ = cv2.connectedComponentsWithStats((~key & mk).astype(np.uint8))
            key |= np.isin(lab, [i for i in range(1, n) if st[i, 4] < 400])  # specks of ice on a wall: steel too
        elif o.get('still'):
            P = cv2.warpPerspective(persist(o), ho, (W, H), flags=cv2.INTER_NEAREST) > 0
            key = ks['foam'] & P if o.get('key') == 'foam' else ks['crate'] | (ks['blue'] & P)
        hard = fill(mk & key, o.get('close', 11)) & mk
        if o.get('grow'):  # over the key's own soft border (a white halo round a foam box)
            hard = (cv2.dilate(hard.astype(np.uint8), np.ones((o['grow'], o['grow']), np.uint8)) > 0) & mk
        if o.get('plug'):  # handle holes and drain slots: small gaps wholly inside the wall are wall too
            n, lab, st, _ = cv2.connectedComponentsWithStats((~hard & mk).astype(np.uint8))
            hard |= np.isin(lab, [i for i in range(1, n) if st[i, 4] < o['plug']])
        if 'gate' in o:
            hard &= gate(a, o.get('track', cfg.get('track')), ho, o['gate'])
        g = grain * o.get('grain', 1) + (sheen * o['sheen'] if o.get('sheen') else 0) + (spangle * o['spangle'] if o.get('spangle') else 0)
        a = paint(a, L, hard, g, o.get('blur', 12), o.get('gain', 0.5), o.get('lift', 62), o.get('tone'))
    if roi is not None:
        hard = fill(ks[cfg.get('roi_key', 'blue')] & (roi > 0), 9)
        if cfg.get('roi_style', {}).get('plug'):
            n, lab, st, _ = cv2.connectedComponentsWithStats((~hard & (roi > 0)).astype(np.uint8))
            hard |= np.isin(lab, [i for i in range(1, n) if st[i, 4] < cfg['roi_style']['plug']])
        if cfg.get('roi_grow'):  # over the blue fringe the key leaves round each crate
            hard = cv2.dilate(hard.astype(np.uint8), np.ones((cfg['roi_grow'], cfg['roi_grow']), np.uint8)) > 0
        n, lab, st, _ = cv2.connectedComponentsWithStats(hard.astype(np.uint8))
        for i in range(1, n):  # each crate on its own, so neighbours don't blur into one slab
            if st[i, 4] < cfg.get('roi_min', 0):  # a gloved hand, not a crate
                continue
            rs = cfg.get('roi_style', {})  # the objects' own options (blur, gain, lift, grain, sheen, spangle), else the defaults
            rg = grain * rs.get('grain', 1) + (sheen * rs['sheen'] if rs.get('sheen') else 0) + (spangle * rs['spangle'] if rs.get('spangle') else 0)
            a = paint(a, L, lab == i, rg, rs.get('blur', 8), rs.get('gain', 0.5), rs.get('lift', cfg.get('roi_lift', 62)))
    for p in cfg.get('patches', []):
        if k >= p.get('upto', len(frames)):
            continue
        pts = cv2.perspectiveTransform(np.float32(p['poly'])[None], h)[0]
        pm = np.zeros((H, W), np.uint8); cv2.fillPoly(pm, [np.int32(pts)], 255)
        if 'rows' in p:
            # each row takes the median of a clear strip beside it (sky above the horizon, sea below): plain haze,
            # nothing pulled in from the vessel's own edges or the crates under the window
            sx0, sx1 = (int(v) for v in cv2.perspectiveTransform(np.float32([[[p['rows'][0], 0], [p['rows'][1], 0]]]), h)[0][:, 0])
            strip = np.median(a[:, max(0, sx0):max(1, sx1)], 1)
            filled = np.repeat(strip[:, None, :], W, 1)
        else:
            filled = cv2.inpaint(a.clip(0, 255).astype(np.uint8), pm, 25, cv2.INPAINT_TELEA).astype(np.float32)
        filled = cv2.GaussianBlur(filled, (0, 0), 9)  # haze: no structure left where the vessel was
        soft = cv2.GaussianBlur((pm > 0).astype(np.float32), (0, 0), p.get('feather', 6))[..., None]
        a = a * (1 - soft) + filled * soft
    enc.stdin.write(a.clip(0, 255).astype(np.uint8).tobytes())
enc.stdin.close()
sys.exit(enc.wait())
