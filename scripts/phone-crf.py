"""Phone MP4s from the masters at a fixed CRF (PR #324, 12 Nov): every /story clip's <id>_m.{av1.mp4,mp4} from
masters/<id>/master.mp4, cropped 810x1440 around CROP_X (src/config/chapters.ts, as scripts/encode-hf.sh) and never
scaled: 810x1440 is the master's native portrait crop (its 1440 rows are the ceiling). AV1, with H.264 as the fallback
(phones skip HEVC: segments.ts). Phone budget 30 MB a path, streamed a chapter at a time by warmcache.ts.
AV1: CRF 22 and up until both paths fit (12 Nov: 22 was 41.9 / 37.8 MB), a closed 12-frame GOP (a keyframe every 0.5 s, so a seek decodes at most 12 frames), random-access refs
inside the GOP and film-grain=8: the masters' grain is removed and re-synthesized at decode (on cg-depart-1, 6.2 MB
low-delay without it -> 2.0 MB). H.264 (fallback): the same GOP, no B-frames, the lowest CRF from 26 up at which both
paths fit 30 MB less 3.6 MB for the rest of the page. No scene cuts, faststart, no audio.
  python3 scripts/phone-crf.py            all clips of both paths; prints each path's MB per codec. 0 credits.
"""
import os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

M = 'public/media'
CRF = 22
GOP = 12
# 30 MB a path including everything else a phone loads (posters, scripts, fonts, globe: 3.6 MB measured, weight.spec)
LIMIT = 30e6 - 3.6e6
man = open('src/film/manifest.ts').read()
order = {p: re.findall(r"\{ id: '([^']+)'", re.search(rf'\n  {p}: \[(.*?)\n  \]', man, re.S).group(1)) for p in ('ocean', 'pond')}
ids = list(dict.fromkeys(order['ocean'] + order['pond']))
CODECS = {'av1': 'av1.mp4', 'h264': 'mp4'}
cx = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e',
                     "const { CROP_X } = await import('./src/config/chapters.ts'); console.log(JSON.stringify(CROP_X))"],
                    capture_output=True, text=True, check=True).stdout
CROP_X = __import__('json').loads(cx)


def crop(cid):
    x = min(1750, max(0, int(CROP_X.get(cid, 0.5) * 2560 - 405)))
    return f'crop=810:1440:{x - x % 2}:0'


def enc(cid, codec, crf):
    out = f'{M}/{cid}_m.{CODECS[codec]}'
    # masters/<id>/phone.mp4: the crop with its phone join ramps (grade-match.py --phone), else crop the master here
    ph = f'masters/{cid}/phone.mp4'
    src, vf = (ph, 'null') if os.path.exists(ph) else (f'masters/{cid}/master.mp4', crop(cid))
    base = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', src, '-vf', vf, '-an',
            '-pix_fmt', 'yuv420p', '-r', '24']
    if codec == 'av1':
        # irefresh-type 2: closed GOP (key frames); film-grain 8: denoise, then grain synthesized by the decoder
        x = ['-c:v', 'libsvtav1', '-preset', '5', '-crf', str(crf), '-g', str(GOP), '-svtav1-params',
             'film-grain=8:scd=0:irefresh-type=2:svt-log-level=1']
    else:
        x = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slower', '-tune', 'film', '-crf', str(crf), '-g', str(GOP),
             '-keyint_min', str(GOP), '-sc_threshold', '0', '-bf', '0']
    subprocess.run(base + x + ['-movflags', '+faststart', out], check=True)
    return os.path.getsize(out)


def run(codec, crf):
    with ThreadPoolExecutor(4) as pool:
        return dict(zip(ids, pool.map(lambda c: enc(c, codec, crf), ids)))


def report(codec, crf, sizes):
    tot = {p: sum(sizes[c] for c in seq) for p, seq in order.items()}
    print(f'{codec} crf {crf}: ' + ', '.join(f'{p} {t / 1e6:.2f} MB' for p, t in tot.items()), flush=True)
    for p, seq in order.items():
        print(f'  {p}: ' + '  '.join(f'{c} {sizes[c] / 1e6:.2f}' for c in seq), flush=True)
    return max(tot.values())


# each codec: the lowest CRF from its start at which both paths fit (AV1 from 22, H.264 from 26); CODEC=av1|h264 for one
for codec, start in (('av1', 27), ('h264', 26)):
    if os.environ.get('CODEC', codec) != codec:
        continue
    for crf in range(int(os.environ.get('START', start)), start + 12):
        if report(codec, crf, run(codec, crf)) <= LIMIT:
            break
