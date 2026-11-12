"""One grade end to end (PR #324 audit, item 3): every story clip matched to one reference frame, ramps at every join,
the brightening inside a clip flattened. 0 credits: it regrades the existing masters only.

  python3 scripts/grade-match.py            solve, print the predicted tables, write scripts/plant-match.env
  python3 scripts/grade-match.py --render   then render masters/<id>/master.mp4 (the original kept as master.pregrade.mp4)
  python3 scripts/grade-match.py --render cg-catch cg-return   only these clips (the solve still sees every clip)
  python3 scripts/grade-match.py --phone --render   the phone pass: joins on the 810x1440 crops -> masters/<id>/phone.mp4

Reference: cg-port master frame 36 (Y 146.5, p1 16, p99 225, R/B 1.32, S 28.5 %).
1. Per clip, a static grade, solved on all its frames (320 px): gamma, output black and white points, a red/blue balance
   and saturation, so the clip's mean is within ±4 % luma, ±0.03 R/B and ±3 % saturation of the reference, blacks p1
   12-20 and whites p99 215-235. Plant interiors sit a touch warmer (R/B +0.02), ponds and sample less orange (-0.02).
2. Inside a clip whose luma drifts more than ±10 % (cg-catch 76 -> 135, cg-return 115 -> 143), a slow per-frame gamma
   pulls it to within ±8 % of the clip's mean. The per-frame curve is smoothed over 1 s, so it adds no flicker.
3. Joins: the last 12 frames of clip N and the first 12 of N+1 ease (smoothstep) toward one target, the mean of the two
   boundary frames. A clip end shared by both paths (cg-arrive, hf-store, cg-port) is one junction with all its
   neighbours (cg-return and hf-sort both meet cg-arrive's first frame), so both paths meet the same value.
The static grade is written per clip to scripts/plant-match.env as an ffmpeg filter (lutrgb + colorchannelmixer, the
same math); the per-frame parts (2, 3) exist only in the render. Every solve step is simulated on the frames, so the
printed prediction is what the render produces (check it after with scripts/grade-audit.py --src masters).
"""
import json, os, re, subprocess, sys
import numpy as np

W, H = 320, 180
REF = dict(Y=146.5, p1=16.0, p99=225.0, RB=1.32, S=28.5)
WARM = {'hf-fish-intake', 'hf-fish-wash', 'hf-fish-cut', 'hf-fish-freeze', 'hf-store', 'hf-intake', 'hf-wash', 'hf-peel',
        'hf-lab', 'hf-iqf', 'hf-pack'}
COOL = {'cg-ponds', 'cg-sample'}
RAMP = 12
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)

man = open('src/film/manifest.ts').read()
order = {p: re.findall(r"\{ id: '([^']+)'", re.search(rf'\n  {p}: \[(.*?)\n  \]', man, re.S).group(1)) for p in ('ocean', 'pond')}
ids = list(dict.fromkeys(order['ocean'] + order['pond']))


# --phone (12 Nov): the phone pass. A phone shows an 810x1440 crop of each master around CROP_X (chapters.ts), so its joins
# meet other regions than the full frames above: on the crops of the graded masters (no static change), the same flatten
# and join ramps are solved and rendered to masters/<id>/phone.mp4, which scripts/phone-crf.py encodes.
PHONE = '--phone' in sys.argv
if PHONE:
    W, H = 162, 288
    _cx = json.loads(subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e',
                                     "const { CROP_X } = await import('./src/config/chapters.ts'); console.log(JSON.stringify(CROP_X))"],
                                    capture_output=True, text=True, check=True).stdout)


def crop(cid):
    x = min(1750, max(0, int(_cx.get(cid, 0.5) * 2560 - 405)))
    return f'crop=810:1440:{x - x % 2}:0'


def src(cid):
    if PHONE:
        return f'masters/{cid}/master.mp4'
    f = f'masters/{cid}/master.pregrade.mp4'
    return f if os.path.exists(f) else f'masters/{cid}/master.mp4'


def frames(cid, w=None, h=None):
    w, h = w or W, h or H
    vf = (crop(cid) + ',' if PHONE else '') + f'scale={w}:{h}:flags=area'
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src(cid), '-vf', vf, '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def stats(x):
    """x: float RGB 0-255 (..., 3) for one frame"""
    L = x @ LUMA
    mx, mn = x.max(-1), x.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return dict(Y=float(L.mean()), p1=float(np.percentile(L, 1)), p99=float(np.percentile(L, 99)),
                RB=float(x[..., 0].mean() / max(1e-3, x[..., 2].mean())), S=float(s.mean() * 100))


# --- the grade: per-channel curve (gamma, output black/white points, R/B balance, per-frame gamma and tilt), then a
# saturation matrix. p = [black, ow, gamma, rb, sat]. black > 0 lifts the output black point; black < 0 is an input black
# point (levels: what lies below it goes to 0). rb splits as red x sqrt(rb), blue / sqrt(rb), so luma barely moves.
def levels(black):
    return max(0.0, -black), max(0.0, black)  # input black, output black


def lut(p, g_t=1.0, tilt=0.0):
    """256-entry curve per channel. g_t / tilt: the per-frame extra gamma and R/B tilt (flatten, join ramps)"""
    black, ow, gam, rb = p[:4]
    lo, ob = levels(black)
    v = np.clip((np.arange(256, dtype=np.float32) - lo) / (255 - lo), 0, 1) ** (gam * g_t)
    v = ob + (ow - ob) * v
    r = np.sqrt(rb) * (1 + tilt / 2)
    k = np.array([r, 1.0, 1 / np.sqrt(rb) * (1 - tilt / 2)], np.float32)
    return np.clip(v[:, None] * k[None, :], 0, 255)  # (256, 3)


def satm(s):
    """3x3 RGB matrix: out = s * x + (1 - s) * Y(x), exact as ffmpeg colorchannelmixer"""
    return (s * np.eye(3) + (1 - s) * np.ones((3, 1)) * LUMA[None, :]).astype(np.float32)


def apply(x8, p, g_t=1.0, tilt=0.0):
    c = lut(p, g_t, tilt)
    y = np.stack([c[x8[..., i], i] for i in range(3)], -1)
    return np.clip(y @ satm(p[4]).T, 0, 255)


def target(cid):
    t = dict(REF)
    t['RB'] += 0.02 if cid in WARM else -0.02 if cid in COOL else 0
    return t


def solve(cid, fr):
    """static grade on 12 frames spread over the clip, matched on the clip mean of each statistic: one parameter at a
    time (bisection), four passes, so no parameter runs off to a bound to buy another one's error"""
    pick = fr[np.linspace(0, len(fr) - 1, 12).round().astype(int)][:, ::2, ::2]
    t = target(cid)
    p = [0.0, 255.0, 1.0, 1.0, 1.0]

    def mean(p):
        s = [stats(apply(f, p)) for f in pick]
        return {k: float(np.mean([x[k] for x in s])) for k in s[0]}

    def bisect(k, lo, hi, key, want, rising, n=16):
        for _ in range(n):
            p[k] = (lo + hi) / 2
            if (mean(p)[key] < want) == rising:
                lo = p[k]
            else:
                hi = p[k]
        p[k] = (lo + hi) / 2

    for _ in range(6):
        bisect(0, -90, 60, 'p1', t['p1'], True)       # output black point: p1
        bisect(1, 180, 300, 'p99', t['p99'], True)    # output white point: p99
        bisect(2, 0.25, 2.5, 'Y', t['Y'], False)      # gamma: mean luma (higher gamma, darker)
        bisect(3, 0.6, 1.7, 'RB', t['RB'], True)      # red/blue balance
        bisect(4, 0.4, 1.8, 'S', t['S'], True)        # saturation
    bisect(2, 0.25, 2.5, 'Y', t['Y'], False)          # saturation moved luma a little: the last word is luma's
    return [float(v) for v in p]


def ysim(f, p, g_t=1.0, tilt=0.0):
    return stats(apply(f, p, g_t, tilt))


def gamma_for(f, p, want_y, tilt=0.0):
    """per-frame extra gamma that brings this frame's mean luma to want_y (bisection on log gamma)"""
    lo, hi = -1.2, 1.2
    for _ in range(18):
        m = (lo + hi) / 2
        if ysim(f, p, np.exp(m), tilt)['Y'] > want_y:
            lo = m
        else:
            hi = m
    return float(np.exp((lo + hi) / 2))


def smooth(v, sigma=8.0):
    """gaussian over time (1 s ~ 24 frames wide), edges held"""
    v = np.asarray(v, np.float64)
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(v, r, mode='edge'), k, mode='valid')


def ease(k):
    """weight of the join correction k frames from the boundary (0 = boundary frame): 1 at the join, 0 at RAMP"""
    x = 1 - min(k, RAMP) / RAMP
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------------------------------------------------------------
render = '--render' in sys.argv
only = [a for a in sys.argv[1:] if not a.startswith('--')]
cache = f'{os.environ.get("TMPDIR", "/tmp")}/grade-match-{"phone" if PHONE else "solve"}.json'
saved = json.load(open(cache)) if os.path.exists(cache) and '--resolve' not in sys.argv else {}

fr, P = {}, {}
for cid in ids:
    fr[cid] = frames(cid)
    # the phone pass keeps the masters' grade: identity static, only the per-frame curves
    P[cid] = [0.0, 255.0, 1.0, 1.0, 1.0] if PHONE else saved.get(cid) or solve(cid, fr[cid])
    print(f'{cid:18} solved black {P[cid][0]:+6.1f} white {P[cid][1]:5.1f} gamma {P[cid][2]:.3f} R/B gain {P[cid][3]:.3f} sat {P[cid][4]:.3f}', flush=True)
json.dump(P, open(cache, 'w'))

# 3. joins: junctions = clip ends that meet (union-find over the joins of both paths)
joins = sorted({(x, y) for p in order.values() for x, y in zip(p, p[1:])})
parent = {}


def find(a):
    parent.setdefault(a, a)
    while parent[a] != a:
        a = parent[a]
    return a


for x, y in joins:
    parent[find((x, 'z'))] = find((y, 'a'))
junction = {}
for x, y in joins:
    for e in ((x, 'z'), (y, 'a')):
        junction.setdefault(find(e), set()).add(e)


def end_frame(cid, side):
    return 0 if side == 'a' else len(fr[cid]) - 1


def end_stats(cid, side):
    i = end_frame(cid, side)
    return ysim(fr[cid][i], P[cid], gt[cid][i])




def chain():
    """per-frame curves for the current static grades: flatten (2), then the join corrections (3); fills gt, corr, PF"""
    global gt, corr, PF
    # 2. flatten: the per-frame luma after the static grade, smoothed; frames off the clip mean by more than 8 % come back
    gt = {}
    for cid in ids:
        y = np.array([ysim(f, P[cid])['Y'] for f in fr[cid]])
        ys = smooth(y)
        mean = ys.mean()
        if (ys.max() - mean) / mean <= 0.10 and (mean - ys.min()) / mean <= 0.10:
            gt[cid] = np.ones(len(y))
            continue
        want = mean + np.clip(0.35 * (ys - mean), -0.08 * mean, 0.08 * mean)
        g = [gamma_for(f, P[cid], w) if abs(a - w) > 0.5 else 1.0 for f, a, w in zip(fr[cid], ys, want)]
        gt[cid] = smooth(g)
        print(f'{cid:18} flattened: luma {ys.min():.0f}..{ys.max():.0f} -> want {want.min():.0f}..{want.max():.0f}', flush=True)

    corr = {cid: {'a': (1.0, 0.0), 'z': (1.0, 0.0)} for cid in ids}  # boundary-frame extra gamma factor and R/B tilt
    for members in junction.values():
        s = {e: end_stats(*e) for e in members}
        ty = float(np.mean([v['Y'] for v in s.values()]))
        trb = float(np.mean([v['RB'] for v in s.values()]))
        for (cid, side), v in s.items():
            i = end_frame(cid, side)
            f, g, tilt = fr[cid][i], gt[cid][i], 0.0
            for _ in range(3):  # gamma and tilt each move the other a little: alternate
                g = gamma_for(f, P[cid], ty, tilt)
                lo, hi = -0.6, 0.6
                for _ in range(16):
                    tilt = (lo + hi) / 2
                    if ysim(f, P[cid], g, tilt)['RB'] < trb:
                        lo = tilt
                    else:
                        hi = tilt
            corr[cid][side] = (g / gt[cid][i], tilt)

    def per_frame(cid):
        """(gamma, tilt) per frame: flatten curve times the eased join corrections at both ends"""
        n = len(fr[cid])
        out = []
        for i in range(n):
            g, t = gt[cid][i], 0.0
            for side, k in (('a', i), ('z', n - 1 - i)):
                w = ease(k)
                cg, ct = corr[cid][side]
                g *= cg ** w
                t += ct * w
            out.append((float(g), float(t)))
        return out


    PF = {cid: per_frame(cid) for cid in ids}

def predict(cid):
    """the clip's mean statistics as rendered: static grade and per-frame curves, 12 frames over the clip"""
    pick = np.linspace(0, len(fr[cid]) - 1, 12).round().astype(int)
    s = [ysim(fr[cid][i], P[cid], *PF[cid][i]) for i in pick]
    return {k: float(np.mean([x[k] for x in s])) for k in s[0]}, [x['Y'] for x in s]


# the per-frame curves move a clip's mean a little (the ramps pull its ends toward its neighbours): refine each static
# grade against what the clip shows with them, then solve the curves again
for rnd in range(0 if PHONE else 8):
    chain()
    moved = 0
    for cid in ids:
        m, _ = predict(cid)
        t = target(cid)
        if os.environ.get('DEBUG') == cid:
            print(cid, [round(v, 3) for v in P[cid]], {k: round(v, 2) for k, v in m.items()}, corr[cid], flush=True)
        # small steps, and only for a statistic outside 2/3 of its limit: a clip's ends are tied to its neighbours'
        # through the junctions, and on a low-gamma clip p1 moves ~10 levels per level of black point
        if abs(m['S'] - t['S']) > 2:
            P[cid][4] *= (t['S'] / m['S']) ** 0.5; moved += 1
        if abs(m['RB'] - t['RB']) > 0.02:
            P[cid][3] *= (t['RB'] / m['RB']) ** 0.5; moved += 1
        if not 13 <= m['p1'] <= 19:
            P[cid][0] += float(np.clip(0.3 * (t['p1'] - m['p1']), -1.5, 1.5)); moved += 1
        if abs(m['Y'] / t['Y'] - 1) > 0.025:
            P[cid][2] *= (np.log(t['Y'] / 255) / np.log(m['Y'] / 255)) ** 0.5; moved += 1  # v^g' = t when v^g = m
    print(f'refine {rnd + 1}: {moved} adjustments', flush=True)
    if not moved:
        break
chain()
json.dump(P, open(cache.replace('solve', 'refined'), 'w'))

# --- predicted tables ---
print(f"\n{'clip':18} {'Y':>6} {'p1':>4} {'p99':>4} {'R/B':>5} {'S%':>5} {'Ymin':>5} {'Ymax':>5}")
pred = {}
for cid in ids:
    m, ys = predict(cid)
    pred[cid] = m
    t = target(cid)
    bad = [k for k, ok in (('Y', abs(m['Y'] / t['Y'] - 1) <= 0.04), ('RB', abs(m['RB'] - t['RB']) <= 0.03), ('S', abs(m['S'] - t['S']) <= 3),
                           ('p1', 12 <= m['p1'] <= 20), ('p99', 215 <= m['p99'] <= 235)) if not ok]
    flag = '!' if bad else ' '
    print(f"{flag}{cid:17} {m['Y']:6.1f} {m['p1']:4.0f} {m['p99']:4.0f} {m['RB']:5.2f} {m['S']:5.1f} {min(ys):5.0f} {max(ys):5.0f}  {' '.join(bad)}")
for path, seq in order.items():
    print(f'\n== {path} joins')
    for x, y in zip(seq, seq[1:]):
        a = ysim(fr[x][-1], P[x], *PF[x][-1])
        b = ysim(fr[y][0], P[y], *PF[y][0])
        dy = (b['Y'] - a['Y']) / a['Y'] * 100
        drb = b['RB'] - a['RB']
        print(f"{'!' if abs(dy) > 3 or abs(drb) > 0.02 else ' '} {x + '→' + y:36} {dy:6.1f} {drb:7.3f}")

# --- plant-match.env: the static grade per clip, as ffmpeg filters (same math as apply()) ---
if not PHONE:
    env = open('scripts/plant-match.env').read().split('\n# grade-match.py')[0].rstrip('\n')
    lines = ['', '# grade-match.py (12 Nov, PR #324 audit): the static grade per clip, applied to masters/<id>/master.mp4 after',
             '# cg-grade.sh, as rendered by scripts/grade-match.py --render (which adds the per-frame flatten and join ramps).',
             '# lutrgb: gamma, output black/white points, red/blue gain; colorchannelmixer: saturation around Rec.709 luma.']
    for cid in ids:
        black, ow, gam, rb, sat = P[cid]
        lo, ob = levels(black)
        ch = lambda k: f"clip(({ob:.3f}+{ow - ob:.3f}*pow(clip((val-{lo:.3f})/{255 - lo:.3f}\\,0\\,1)\\,{gam:.4f}))*{k:.4f}\\,0\\,255)"
        m = satm(sat)
        mix = ':'.join(f'{a}{b}={m[i, j]:.4f}' for i, a in enumerate('rgb') for j, b in enumerate('rgb'))
        lines.append(f"post_{cid.replace('-', '_')}='lutrgb=r={ch(np.sqrt(rb))}:g={ch(1.0)}:b={ch(1 / np.sqrt(rb))},colorchannelmixer={mix},'")
    open('scripts/plant-match.env', 'w').write(env + '\n' + '\n'.join(lines) + '\n')
json.dump(dict(static=P, per_frame=PF, predicted=pred), open(f'{os.environ.get("TMPDIR", "/tmp")}/grade-match.json', 'w'))

if not render:
    sys.exit(0)

# --- render: full-size master, per-frame curve + matrix, x264 crf 12 (what encode-hf.sh and clip-frames.sh read) ---
for cid in only or ids:
    if PHONE:  # the graded master's phone crop -> masters/<id>/phone.mp4
        pre, vf, w, h, out = f'masters/{cid}/master.mp4', crop(cid), 810, 1440, f'masters/{cid}/phone.mp4'
    else:
        pre = f'masters/{cid}/master.pregrade.mp4'
        if not os.path.exists(pre):
            os.rename(f'masters/{cid}/master.mp4', pre)
        vf, w, h, out = 'scale=2560:1440', 2560, 1440, f'masters/{cid}/master.mp4'
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', pre, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', '24',
                            '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-an',
                            out], stdin=subprocess.PIPE)
    m = satm(P[cid][4]).T
    for i, (g, t) in enumerate(PF[cid]):
        buf = dec.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        x = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        c = lut(P[cid], g, t)
        y = np.stack([c[x[..., k], k] for k in range(3)], -1) @ m
        enc.stdin.write(np.clip(y + 0.5, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f'{cid}: rendered {len(PF[cid])} frames', flush=True)
