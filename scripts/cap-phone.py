"""Shrink the phone tier of shipped clips to fit the phone path budget (tests/weight.spec.ts: 12 MB a path), from the
shipped files themselves, so a clip keeps its graded look (several were cut from polished or cropped masters).
  python3 scripts/cap-phone.py <id>...   [CAP=500000] [POSTER_KB=70]
Per id: public/media/<id>_m.av1.mp4, .hevc.mp4 and .mp4 re-encoded from <id>_m.mp4 (H.264 crf 18, the best phone copy)
as a VBR at the bitrate that lands each under CAP bytes, with encode-hf.sh's stream settings (closed 6-frame GOP, no
B-frames, no scene cuts, faststart), stepping down 12 % until it fits; <id>_m.avif / .webp posters re-encoded under
POSTER_KB. The phone tier only: desktop tiers and frame sets are untouched. 0 credits.
FROM_MASTER=1 (PR #324 item 3d): the source is masters/<id>/master.mp4 (the regraded master) cropped to 810x1440 around
CROP_X like encode-hf.sh, every codec re-encoded under its own current file size (the phone path keeps its bytes), and the
posters redrawn from its first frame.
ponytail: re-encodes an already-encoded file (one more generation at 810x1440); from the master if a clip is re-cut.
"""
import os, subprocess, sys, tempfile
from PIL import Image

CAP = int(os.environ.get('CAP') or 500000)
PKB = int(os.environ.get('POSTER_KB') or 70) * 1024
M = 'public/media'
run = lambda a, cwd=None: subprocess.run(a, check=True, capture_output=True, cwd=cwd)

def dur(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout)

def enc(codec, src, out, kbps, tmp):
    base = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', src, '-an', '-pix_fmt', 'yuv420p', '-r', '24']
    if codec == 'av1':
        run(base + ['-c:v', 'libsvtav1', '-preset', '5', '-b:v', f'{kbps}k', '-g', '6',
                    '-svtav1-params', 'rc=1:film-grain=0:scd=0:irefresh-type=2', '-movflags', '+faststart', out])
    elif codec == 'hevc':
        p = 'keyint=6:min-keyint=6:scenecut=0:bframes=0:open-gop=0:log-level=error'
        x = ['-c:v', 'libx265', '-preset', 'slow', '-b:v', f'{kbps}k', '-tag:v', 'hvc1']
        run(base + x + ['-x265-params', f'{p}:pass=1', '-f', 'null', '-'], cwd=tmp)
        run(base + x + ['-x265-params', f'{p}:pass=2:vbv-maxrate={kbps * 2}:vbv-bufsize={kbps * 2}', '-movflags', '+faststart', out], cwd=tmp)
    else:
        x = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slower', '-tune', 'film', '-g', '6', '-keyint_min', '6',
             '-sc_threshold', '0', '-bf', '0', '-b:v', f'{kbps}k']
        run(base + x + ['-pass', '1', '-f', 'null', '-'], cwd=tmp)
        run(base + x + ['-maxrate', f'{kbps * 2}k', '-bufsize', f'{kbps * 2}k', '-pass', '2', '-movflags', '+faststart', out], cwd=tmp)

def poster(id_, tmp):
    png = f'{tmp}/p.png'
    run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', f'{M}/{id_}_m.webp', png])
    img = Image.open(png).convert('RGB')
    out = []
    a = f'{M}/{id_}_m.avif'
    if os.path.getsize(a) > PKB:
        for q in range(30, 63, 3):
            run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', png, '-vf', 'format=yuv420p', '-c:v', 'libsvtav1', '-preset', '8',
                 '-crf', str(q), '-frames:v', '1', f'{tmp}/p.avif'])
            if os.path.getsize(f'{tmp}/p.avif') <= PKB:
                break
        os.replace(f'{tmp}/p.avif', a)
    w = f'{M}/{id_}_m.webp'
    if os.path.getsize(w) > PKB * 1.2:
        for q in range(80, 40, -4):
            img.save(f'{tmp}/p.webp', 'WEBP', quality=q, method=6)
            if os.path.getsize(f'{tmp}/p.webp') <= PKB * 1.2:
                break
        os.replace(f'{tmp}/p.webp', w)
    return f'avif {os.path.getsize(a) // 1024} webp {os.path.getsize(w) // 1024}'

MASTER = bool(os.environ.get('FROM_MASTER'))


def crop_x(id_):
    cx = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e',
                         f"const {{ CROP_X }} = await import('./src/config/chapters.ts'); console.log(CROP_X['{id_}'] ?? 0.5)"],
                        capture_output=True, text=True, check=True).stdout.strip()
    x = min(1750, max(0, int(float(cx) * 2560 - 405)))
    return x - x % 2


for id_ in sys.argv[1:]:
    src = f'{M}/{id_}_m.mp4'
    with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
        s = f'{tmp}/src.mp4'
        if MASTER:
            run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', f'masters/{id_}/master.mp4', '-vf', f'crop=810:1440:{crop_x(id_)}:0',
                 '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-an', s])
            run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', s, '-frames:v', '1', f'{tmp}/f0.png'])
            Image.open(f'{tmp}/f0.png').convert('RGB').save(f'{M}/{id_}_m.webp', 'WEBP', quality=80, method=6)
            run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', f'{tmp}/f0.png', '-vf', 'format=yuv420p', '-c:v', 'libsvtav1',
                 '-preset', '8', '-crf', '30', '-frames:v', '1', f'{M}/{id_}_m.avif'])
        else:
            run(['cp', src, s])
        d = dur(s)
        log = []
        for codec, ext in (('av1', 'av1.mp4'), ('hevc', 'hevc.mp4'), ('h264', 'mp4')):
            out = f'{M}/{id_}_m.{ext}'
            if MASTER:
                CAP = os.path.getsize(out)
            elif os.path.getsize(out) <= CAP:
                log.append(f'{codec} {os.path.getsize(out) // 1024} (kept)')
                continue
            kbps = int(CAP * 8 / d / 1000 * 0.92)
            while True:
                enc(codec, s, f'{tmp}/o.mp4', kbps, tmp)
                if os.path.getsize(f'{tmp}/o.mp4') <= CAP or kbps < 150:
                    break
                kbps = int(kbps * 0.88)
            os.replace(f'{tmp}/o.mp4', out)
            log.append(f'{codec} {os.path.getsize(out) // 1024}@{kbps}k')
        print(id_, ' · '.join(log), '· poster', poster(id_, tmp), flush=True)
