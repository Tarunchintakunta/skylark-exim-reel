"""Frame sets for the reel scrub (src/reel/engine.ts), from masters/<id>/graded.mp4 (2560x1440, 24 fps).

  python3 scripts/reel/frames.py <id> [<id> ...]

Every STEP-th master frame (a clip's last frame always included, so the next clip's frame 0, skipped by chain.ts, is the
same picture). Desktop: AVIF 1920x1080, the lowest quality whose 100 % crops still match the master (SSIM >= SSIM_D on
three 480x270 crops of three frames). Phone: an 810x1440 crop of the master around CROP_X, the best AVIF quality at PHONE_KB a frame.
Writes public/media/reel/<id>/{d,m}/NNN.avif and prints frames, KB a frame and the picked quality.
"""
import io, json, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

STEP = 2
SSIM_D = 0.95
# phone: 30 MB a path over ~860 frames
PHONE_KB = 32
# SVT-AV1 crf, smallest file first
QUALITIES = [50, 47, 44, 41, 38, 35, 32, 29, 26]
# phone crop centre, share of the master width (subject stays in frame start to end)
CROP_X = {'cg-depart-1': 0.55, 'cg-ponds': 0.5, 'cg-sample': 0.35, 'cg-harvest': 0.4, 'cg-arrive': 0.6, 'cg-port': 0.42,
          'cg-ship': 0.5, 'cg-sail': 0.5}
W, H = 2560, 1440


def frames(id):
    p = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', f'masters/{id}/graded.mp4', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                       capture_output=True, check=True).stdout
    a = np.frombuffer(p, np.uint8).reshape(-1, H, W, 3)
    keep = list(range(0, len(a), STEP))
    if keep[-1] != len(a) - 1:
        keep.append(len(a) - 1)
    return a, keep


def ssim(x, y):
    x = x.astype(np.float64).mean(2); y = y.astype(np.float64).mean(2)
    c1, c2 = 6.5025, 58.5225
    # block SSIM over 8x8 tiles, averaged
    h, w = x.shape[0] // 8 * 8, x.shape[1] // 8 * 8
    bx = x[:h, :w].reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 64)
    by = y[:h, :w].reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 64)
    mx, my = bx.mean(1), by.mean(1)
    vx, vy = bx.var(1), by.var(1)
    cov = ((bx - mx[:, None]) * (by - my[:, None])).mean(1)
    return float((((2 * mx * my + c1) * (2 * cov + c2)) / ((mx ** 2 + my ** 2 + c1) * (vx + vy + c2))).mean())


def enc(img, crf):
    w, h = img.size
    with tempfile.NamedTemporaryFile(suffix='.avif') as t:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-i', '-',
                        '-vf', 'format=yuv420p', '-c:v', 'libsvtav1', '-preset', '6', '-crf', str(crf), '-frames:v', '1', t.name],
                       input=img.tobytes(), capture_output=True, check=True)
        return open(t.name, 'rb').read()


def dec(b, w, h):
    with tempfile.NamedTemporaryFile(suffix='.avif') as t:
        t.write(b); t.flush()
        raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', t.name, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                             capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3)


def pick(imgs, crops, target):
    for q in QUALITIES:
        ok = True
        for img in imgs:
            back = dec(enc(img, q), *img.size)
            ref = np.asarray(img)
            if min(ssim(ref[y:y + 270, x:x + 480], back[y:y + 270, x:x + 480]) for x, y in crops(ref)) < target:
                ok = False; break
        if ok:
            return q
    return QUALITIES[-1]


def fit(imgs, kb):
    """best quality (lowest crf) whose probe frames average at most kb KB"""
    for q in reversed(QUALITIES):
        if sum(len(enc(i, q)) for i in imgs) / len(imgs) <= kb * 1024:
            return q
    return QUALITIES[0]


def desk(f):
    return Image.fromarray(f).resize((1920, 1080), Image.LANCZOS)


def phone(id, f):
    cx = int(CROP_X.get(id, 0.5) * W)
    x0 = min(max(cx - 405, 0), W - 810)
    return Image.fromarray(f[:, x0:x0 + 810])


def run(id):
    a, keep = frames(id)
    probe = [keep[0], keep[len(keep) // 2], keep[-1]]
    dc = lambda r: [(r.shape[1] // 2 - 240, r.shape[0] // 2 - 135), (100, 100), (r.shape[1] - 580, r.shape[0] - 370)]
    qd = pick([desk(a[i]) for i in probe], dc, SSIM_D)
    qm = fit([phone(id, a[i]) for i in probe], PHONE_KB)
    out = {}
    for kind, q, fn in (('d', qd, desk), ('m', qm, lambda f: phone(id, f))):
        d = f'public/media/reel/{id}/{kind}'
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
        def one(n_i):
            b = enc(fn(a[n_i[1]]), q)
            open(f'{d}/{n_i[0]:03d}.avif', 'wb').write(b)
            return len(b)
        with ThreadPoolExecutor(8) as ex:
            total = sum(ex.map(one, enumerate(keep)))
        out[kind] = dict(q=q, kb=round(total / len(keep) / 1024, 1), mb=round(total / 1e6, 2))
    print(json.dumps(dict(id=id, frames=len(keep), **out)))


if __name__ == '__main__':
    for id in sys.argv[1:]:
        run(id)
