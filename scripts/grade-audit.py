"""Grade audit of the story film as shipped: one table per path of every clip (mean luma Y, p1/p99, R/B, saturation) and
of every join (last frame of clip N against the first frame of N+1: luma change in %, R/B change), for the desktop frame
sets and the phone MP4s, plus a contact sheet of each path's joins. Story order comes from src/film/manifest.ts.
  python3 scripts/grade-audit.py [--out review/grade] [--src shipped|masters]
Limits (flagged with !): a join over 6 % luma or 0.05 R/B (the audit's), and the target after the regrade: 3 % / 0.02.
Tiers (what a visitor downloads): desk = the CG 1920 AVIF frame sets and the plant clips' 1920 AV1 video, phone =
<id>_m.av1.mp4.
--src masters reads masters/<id>/master.mp4 instead (the frames the encodes are made from). 0 credits.
"""
import argparse, json, os, re, subprocess, tempfile
import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='review/grade')
ap.add_argument('--src', default='shipped', choices=['shipped', 'masters'])
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
M = 'public/media'
man = open('src/film/manifest.ts').read()
order = {p: re.findall(r"\{ id: '([^']+)'", re.search(rf'\n  {p}: \[(.*?)\n  \]', man, re.S).group(1)) for p in ('ocean', 'pond')}
seq = dict(re.findall(r"'([^']+)': \{ frames: (\d+)", man.split('export const SEQ')[1].split('export const')[0]))
tmp = tempfile.mkdtemp(dir=os.environ.get('TMPDIR'))


def grab(src, at, name):
    """one frame of a video or a still file as an RGB array; at: 'first', 'last' or a frame index"""
    out = f'{tmp}/{name}.png'
    if src.endswith(('.avif', '.webp')):
        cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-frames:v', '1', out]
    elif at == 'last':
        cmd = ['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.1', '-i', src, '-update', '1', '-frames:v', '1', out]
    elif at == 'first':
        cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-frames:v', '1', out]
    else:
        cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', f'select=eq(n\\,{at})', '-frames:v', '1', out]
    subprocess.run(cmd, check=True)
    im = Image.open(out).convert('RGB')
    im.thumbnail((960, 960))
    return np.asarray(im).astype(np.float32)


def stats(x):
    L = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    mx, mn = x.max(2), x.min(2)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return dict(Y=float(L.mean()), p1=float(np.percentile(L, 1)), p99=float(np.percentile(L, 99)),
                RB=float(x[..., 0].mean() / max(1e-3, x[..., 2].mean())), S=float(s.mean() * 100))


def ends(cid, tier):
    """(first, middle, last) frames of a clip as the visitor sees it on this tier"""
    if a.src == 'masters':
        f = f'masters/{cid}/master.mp4'
        n = int(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries',
                                'stream=nb_read_frames', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
        return grab(f, 'first', f'{cid}-a'), grab(f, n // 2, f'{cid}-m'), grab(f, 'last', f'{cid}-z')
    if tier == 'desk' and cid in seq:
        n = int(seq[cid])
        fr = lambda i: f'{M}/{cid}-f_1920_{i:03d}.avif'
        return grab(fr(0), 0, f'{cid}-da'), grab(fr(n // 2), 0, f'{cid}-dm'), grab(fr(n - 1), 0, f'{cid}-dz')
    f = f'{M}/{cid}_m.av1.mp4' if tier == 'phone' else f'{M}/{cid}_1920.av1.mp4'
    n = int(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries',
                            'stream=nb_read_frames', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
    return grab(f, 'first', f'{cid}-{tier}a'), grab(f, n // 2, f'{cid}-{tier}m'), grab(f, 'last', f'{cid}-{tier}z')


report = {}
for path, ids in order.items():
    for tier in (['masters'] if a.src == 'masters' else ['desk', 'phone']):
        fr = {cid: ends(cid, tier) for cid in ids}
        clips = {cid: {k: round(v, 3) for k, v in stats(fr[cid][1]).items()} for cid in ids}
        joins, tiles = [], []
        for x, y in zip(ids, ids[1:]):
            s0, s1 = stats(fr[x][2]), stats(fr[y][0])
            dY = (s1['Y'] - s0['Y']) / max(1, s0['Y']) * 100
            dRB = s1['RB'] - s0['RB']
            joins.append(dict(join=f'{x}→{y}', dY=round(dY, 1), dRB=round(dRB, 3), p1=(round(s0['p1']), round(s1['p1'])),
                              over_audit=abs(dY) > 6 or abs(dRB) > 0.05, over_target=abs(dY) > 3 or abs(dRB) > 0.02))
            pair = [Image.fromarray(fr[x][2].astype(np.uint8)), Image.fromarray(fr[y][0].astype(np.uint8))]
            tiles.append((f'{x} → {y}  dY {dY:+.1f} %  dR/B {dRB:+.3f}', [p.resize((480, int(480 * p.height / p.width))) for p in pair]))
        report[f'{path}/{tier}'] = dict(clips=clips, joins=joins)
        # contact sheet: one row per join, last frame of N | first frame of N+1
        th = max(t[1][0].height for t in tiles)
        sheet = Image.new('RGB', (960, (th + 22) * len(tiles)), 'white'); d = ImageDraw.Draw(sheet)
        for k, (label, (l, r)) in enumerate(tiles):
            y0 = k * (th + 22); d.text((6, y0 + 4), label, fill='black'); sheet.paste(l, (0, y0 + 22)); sheet.paste(r, (480, y0 + 22))
        sheet.save(f'{a.out}/joins-{path}-{tier}.jpg', quality=82)
        print(f'\n== {path} / {tier}')
        print(f"{'clip':18} {'Y':>6} {'p1':>4} {'p99':>4} {'R/B':>5} {'S%':>5}")
        for cid, s in clips.items():
            print(f"{cid:18} {s['Y']:6.1f} {s['p1']:4.0f} {s['p99']:4.0f} {s['RB']:5.2f} {s['S']:5.1f}")
        print(f"{'join':38} {'dY%':>6} {'dR/B':>7}  p1")
        for j in joins:
            flag = '!!' if j['over_audit'] else ('! ' if j['over_target'] else '  ')
            print(f"{flag}{j['join']:36} {j['dY']:6.1f} {j['dRB']:7.3f}  {j['p1'][0]}→{j['p1'][1]}")
json.dump(report, open(f'{a.out}/grade-{a.src}.json', 'w'), indent=1)
