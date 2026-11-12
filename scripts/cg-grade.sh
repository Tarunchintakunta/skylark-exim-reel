#!/usr/bin/env bash
# One grade for every CG story clip (STYLE.md), and exact chaining between clips.
#   scripts/cg-grade.sh <id> <raw.mp4> [prev-raw.mp4]
# -> masters/<id>/master.mp4 (2560×1440, 24 fps, what scripts/encode-hf.sh and scripts/clip-frames.sh read)
# Seedance takes a start image as a reference, not as frame 0 (SSIM ~0.88), so with a previous clip the first 8 frames
# blend in from that clip's last raw frame: frame 0 is then exactly the previous clip's last frame, before the same grade.
# The grade (STYLE.md, 10 Nov): deband (8-bit sky and water banding); colour balance that pulls the renders' teal/navy
# cast back, warm midtones and highlights so the dawn light carries across water and hull, neutral (not navy) shadows;
# gamma 1.10 to lift the boat, a light contrast lift; lanczos to 2560 and a light unsharp (Seedance HD is soft); fine
# static grain so the gradients do not band again after the AV1/AVIF encode. Measured on cg-depart-1 frame 0: shadows
# R14 G22 B28 -> R23 G25 B26, mean luma 61 -> 71.
set -euo pipefail
cd "$(dirname "$0")/.."
id="${1:?id}"; raw="${2:?raw clip}"; prev="${3:-}"
mkdir -p "masters/$id"; tmp=$(mktemp -d "${TMPDIR:-/tmp}/cg.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
# PLANT=1 (live-action plant interiors, Tarun 11 Nov): before the same grade, exposure and highlights come down to the dawn
# CG's level (peak whites ~85 %, mean ~120-130 vs 145-165 ungraded), saturation a touch lower and a warm shift, so a lit
# interior sits beside the CG film. Measured on hf-wash: peak 99 % -> 85 %, shadows R42 G57 B81 -> R33 G29 B29.
PRE="${PLANT:+eq=gamma=0.84:contrast=1.06:saturation=0.92,colorbalance=rs=0.04:bs=-0.05:rm=0.06:bm=-0.06:rh=0.03:bh=-0.04,colorlevels=romax=0.84:gomax=0.83:bomax=0.81,}"
# MATCH=<ffmpeg filters,> (11 Nov): a per-clip match after PLANT's pre-grade, for a live clip that sits right after a CG
# clip, so its first frame meets the CG's last frame in warmth, haze (lifted blacks) and exposure. Values per clip in
# scripts/plant-match.env (measured against cg-arrive's eased last frame).
PRE="${PRE}${MATCH:-}"
GRADE="${PRE}deband=1thr=0.02:2thr=0.02:3thr=0.02:range=22:blur=1,colorbalance=rs=0.035:bs=-0.035:rm=0.05:gm=0.01:bm=-0.05:rh=0.03:bh=-0.04,eq=gamma=1.10:contrast=1.05,scale=2560:1440:flags=lanczos,unsharp=5:5:0.5,noise=alls=3:allf=p,format=yuv420p"
if [ -n "$prev" ]; then
  ffmpeg -nostdin -v error -y -sseof -0.05 -i "$prev" -update 1 -frames:v 1 "$tmp/prev.png"
  ffmpeg -nostdin -v error -y -i "$raw" -loop 1 -framerate 24 -i "$tmp/prev.png" -filter_complex \
    "[1]format=rgba,fade=out:st=0:d=0.3333:alpha=1[o];[0][o]overlay=shortest=1,$GRADE" \
    -r 24 -c:v libx264 -preset slow -crf 12 -an "masters/$id/master.mp4"
else
  ffmpeg -nostdin -v error -y -i "$raw" -vf "$GRADE" -r 24 -c:v libx264 -preset slow -crf 12 -an "masters/$id/master.mp4"
fi
echo "$id: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames,width,height -of csv=p=0 "masters/$id/master.mp4")"
