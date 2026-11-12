"""Posters for one clip, from frames of its master (scripts/encode-hf.sh calls this; Pillow for WebP, ffmpeg's SVT-AV1 for AVIF).

STILL / LAST: first and last frame PNGs of a 2560×1440 master, or STILL alone (no LAST) for a still's own master.
CX: the phone crop's centre, a share of the width (chapters.ts CROP_X). ID, OUT: file id, output dir.
Writes <id>_<tier>.avif/.webp for tiers m (810×1440 crop), 960, 1280, 1920 (+2560 with POSTER_2560=1), and
<id>_end_1280: the last frame, shown on desktop only for the moment a clip seeks back after scrolling up into it, so it
stays at 1280 (at 1920 the end frames would take ~3.8 MB of a path's budget from the clips). CAP_KB caps it too.
Quality-targeted: AVIF crf 25 (libavif q ≈ 60), WebP q 82; only a file over its cap steps down (AVIF to crf 61, WebP
never below q 55).
Caps: 350 KB; the LCP still (the hero loop's first frame) 120 KB, and its phone AVIF 60 KB.
SHARPEN=0.3–0.5: light unsharp mask on the luma of the downscale only (off by default).
BLUR=<px at 1280 wide>: a Gaussian blur scaled with each tier (the documentation backdrop: 1 px, measured on the old file).
"""
import os
import subprocess
import tempfile
from PIL import Image, ImageFilter

ID, OUT, CX = os.environ['ID'], os.environ['OUT'], float(os.environ['CX'])
TIERS = ['m', 960, 1280, 1920] + ([2560] if os.environ.get('POSTER_2560') == '1' else [])
SHARPEN = float(os.environ.get('SHARPEN') or 0)
BLUR = float(os.environ.get('BLUR') or 0)
LCP = ID == 'hero-loop'
KB = 1024


def frame(img: Image.Image, tier) -> Image.Image:
    if tier == 'm' and os.environ.get('STILL_M'):
        # a cut with its own phone crop (encode-hf.sh M_CROP), already at its native size
        out = Image.open(os.environ['STILL_M']).convert('RGB')
    elif tier == 'm':
        # the master's full height at 810:1440, never scaled (810×1440 from a 2560×1440 clip)
        w = round(img.height * 810 / 1440 / 2) * 2
        # the same left edge as the _m clip's crop (encode-hf.sh)
        x = min(max(int(CX * img.width - w / 2), 0), img.width - w)
        x -= x % 2
        out = img.crop((x, 0, x + w, img.height))
    elif tier == img.width:
        out = img
    else:
        out = img.resize((tier, round(img.height * tier / img.width / 2) * 2), Image.LANCZOS)
        if SHARPEN:
            y, cb, cr = out.convert('YCbCr').split()
            y = y.filter(ImageFilter.UnsharpMask(radius=1.0, percent=round(SHARPEN * 100), threshold=2))
            out = Image.merge('YCbCr', (y, cb, cr)).convert('RGB')
    if BLUR:
        out = out.filter(ImageFilter.GaussianBlur(BLUR * out.height / 720))
    return out


def save(img: Image.Image, name: str, cap_avif: int, cap_webp: int) -> str:
    sizes = []
    png = tempfile.NamedTemporaryFile(suffix='.png', dir=os.environ.get('TMPDIR'))
    img.save(png.name)
    for ext, qs, cap in (('avif', range(25, 62, 4), cap_avif), ('webp', range(82, 54, -3), cap_webp)):
        path = f'{OUT}/{name}.{ext}'
        for q in qs:
            if ext == 'avif':
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', png.name, '-vf', 'format=yuv420p', '-c:v', 'libsvtav1',
                                '-preset', '8', '-crf', str(q), '-frames:v', '1', path], check=True, capture_output=True)
            else:
                img.save(path, 'WEBP', quality=q, method=6)
            if os.path.getsize(path) <= cap:
                break
        size = os.path.getsize(path) // KB
        sizes.append(f'{ext} {size}' + ('' if size * KB <= cap else f' OVER {cap // KB}'))
    return f'{name}: ' + ', '.join(sizes)


first = Image.open(os.environ['STILL']).convert('RGB')
log = []
for t in TIERS:
    # CAP_KB: a tighter cap for a page's own stills (the story entry's cards: 250 KB, #268)
    cap = 120 * KB if LCP else int(os.environ.get('CAP_KB') or 350) * KB
    log.append(save(frame(first, t), f'{ID}_{t}', 60 * KB if LCP and t == 'm' else cap, cap))
end_cap = int(os.environ.get('CAP_KB') or 350) * KB
if os.environ.get('LAST'):
    log.append(save(frame(Image.open(os.environ['LAST']).convert('RGB'), 1280), f'{ID}_end_1280', end_cap, end_cap))
print('  ' + ' · '.join(log))
