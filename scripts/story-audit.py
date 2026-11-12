#!/usr/bin/env python3
"""Frame-by-frame audit of /story footage: one numbered contact sheet per clip or frame set, plus scores that rank them for review by eye.

  scripts/story-audit.py <out dir> <media dir> [id ...]    every hf-* clip and frame set in the media dir, or just these ids
  scripts/story-audit.py <out dir> --master <file> <name>  one master file

grey: largest connected patch of flat, mid-tone, colourless 8x8 blocks, as a share of the frame, worst frame.
rewind: per grid cell, with the camera's median flow removed, how far the cell travels out and back along its main
direction, worst cell, in % of the frame width. Walking, sawing and parallax trigger it too, so it only ranks shots.
return: how close the last frame is to the first, against the mid frame (1 = the clip ends where it began).
"""
import glob, json, os, sys
import cv2
import numpy as np

COLS, THUMB = 12, 200


def frames_of(src):
    if isinstance(src, list):
        for f in src:
            yield cv2.imread(f)
        return
    cap = cv2.VideoCapture(src)
    while True:
        ok, f = cap.read()
        if not ok:
            return
        yield f


def grey_score(bgr):
    small = cv2.resize(bgr, (960, 540), interpolation=cv2.INTER_AREA)
    grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
    sat = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)[..., 1].astype(np.float32)
    h, w = grey.shape[0] // 8, grey.shape[1] // 8
    b = grey[: h * 8, : w * 8].reshape(h, 8, w, 8)
    s = sat[: h * 8, : w * 8].reshape(h, 8, w, 8)
    std, mean, smean = b.std((1, 3)), b.mean((1, 3)), s.mean((1, 3))
    mask = ((std < 6) & (mean > 70) & (mean < 185) & (smean < 34)).astype(np.uint8)
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
    return float(stats[1:, cv2.CC_STAT_AREA].max() / (h * w) * 100) if n > 1 else 0.0


def rewind_score(greys):
    gx, gy = 16, 9
    tracks = np.zeros((len(greys) - 1, gy, gx, 2), np.float32)
    for i in range(len(greys) - 1):
        flow = cv2.calcOpticalFlowFarneback(greys[i], greys[i + 1], None, 0.5, 3, 15, 2, 5, 1.1, 0)
        flow -= np.median(flow, axis=(0, 1))
        tracks[i] = cv2.resize(flow, (gx, gy), interpolation=cv2.INTER_AREA)
    worst, cell = 0.0, (0, 0)
    for y in range(gy):
        for x in range(gx):
            v = tracks[:, y, x]
            _, _, axis = np.linalg.svd(v - v.mean(0), full_matrices=False)
            path = np.concatenate([[0], np.cumsum(v @ axis[0])])
            for k in (int(np.argmax(path)), int(np.argmin(path))):
                back = min(abs(path[k] - path[0]), abs(path[k] - path[-1]))
                if back > worst:
                    worst, cell = float(back), (x, y)
    return worst / greys[0].shape[1] * 100, cell


def audit(name, src, out):
    sheet, greys, grey, first, last, mid, frames = [], [], [], None, None, None, []
    for i, f in enumerate(frames_of(src)):
        if f is None:
            continue
        g = grey_score(f)
        grey.append(g)
        t = cv2.resize(f, (THUMB, THUMB * f.shape[0] // f.shape[1]), interpolation=cv2.INTER_AREA)
        cv2.rectangle(t, (0, 0), (92, 15), (0, 0, 0), -1)
        cv2.putText(t, f"{i} g{g:.1f}", (2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1, cv2.LINE_AA)
        sheet.append(t)
        greys.append(cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (320, 180), interpolation=cv2.INTER_AREA))
    rows = [sheet[i : i + COLS] for i in range(0, len(sheet), COLS)]
    rows[-1] += [np.zeros_like(sheet[0])] * (COLS - len(rows[-1]))
    cv2.imwrite(f"{out}/{name}.jpg", cv2.vconcat([cv2.hconcat(r) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 80])
    d = lambda a, b: float(cv2.absdiff(a, b).mean())
    n = len(greys)
    ret = 1 - d(greys[0], greys[-1]) / max(d(greys[0], greys[n // 2]), 1e-3)
    rw, cell = rewind_score(greys)
    return {"name": name, "frames": n, "grey_max": round(max(grey), 1), "grey_frame": int(np.argmax(grey)),
            "rewind": round(rw, 1), "rewind_cell": cell, "return": round(ret, 2)}


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    jobs = []
    if sys.argv[2] == "--master":
        jobs.append((sys.argv[4], sys.argv[3]))
    else:
        media, ids = sys.argv[2], sys.argv[3:]
        clips = sorted(os.path.basename(p)[: -len("_1920.mp4")] for p in glob.glob(f"{media}/hf-*_1920.mp4"))
        for c in ids or clips:
            if os.path.exists(f"{media}/{c}_1920.mp4"):
                jobs.append((c, f"{media}/{c}_1920.mp4"))
            seq = sorted(glob.glob(f"{media}/{c}-f_1920_*.webp")) or sorted(glob.glob(f"{media}/{c}-f_1920_*.avif"))
            if seq:
                jobs.append((f"{c}-seq", seq))
    rows = []
    for name, src in jobs:
        r = audit(name, src, out)
        rows.append(r)
        print(json.dumps(r), flush=True)
    path = f"{out}/scores.json"
    old = json.load(open(path)) if os.path.exists(path) else []
    keep = {r["name"]: r for r in old} | {r["name"]: r for r in rows}
    json.dump(sorted(keep.values(), key=lambda r: r["name"]), open(path, "w"), indent=1)


if __name__ == "__main__":
    main()
