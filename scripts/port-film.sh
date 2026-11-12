#!/usr/bin/env bash
# The #258 port film on /story: one continuous camera move, cut into hf-port-1..5 and encoded into every tier.
#   scripts/port-film.sh <master.mp4> <b0> <b1> <b2> <b3> <b4> <b5>
# Segment k is master frames b(k-1)..b(k), so neighbours share their boundary frame and the crossfade joins match.
# SPLIT=1: segment k is b(k-1)..b(k)-1 (the last one ends on b5), for a master whose clips meet at near-matching
# frames (a small jump between the last frame of one clip and the first of the next): the crossfade covers the jump.
# Each segment is resampled to ${FRAMES:-60} frames with its first and last frame kept (60 frames: SVT-AV1's GOP-6
# floor at 1920 leaves room in the 28 MB desktop path; the scroll sets the pace of a scrubbed clip, not the frame rate).
# Masters land in masters/hf-port-<k>/master.mp4 (gitignored). STEP=cut | encode | all (default all).
# Caps (the solver's, with every other clip held at its files via SOLVE), tightened where a path measured over budget:
# 1280 / 1920 at 650 KB (desktop ocean measured 28.11 MB at the solver's 800 KB), 2560 at 440 KB (so the 2560 tier
# still fits 40 MB and is served), posters at CAP_KB=60. Phone tiers take the solver's caps (~100 KB).
#   Run 1 (2026-10-17): master 577 frames, cuts 0 97 217 337 457 576.
#   Run 2 (2026-10-17, photoreal): SPLIT=1 scripts/port-film.sh masters/hf-port-REAL.mp4 0 97 193 289 385 480
#   Run 3 (2026-10-17): hf-port-1 only, by hand: master frames 34-75 cut (the canopy roof fills the frame), 0-33 and
#   76-96 joined with a 6-frame dissolve, 49 frames, no resample. Encoded with the SOLVE/caps lines below for hf-port-1.
set -euo pipefail
cd "$(dirname "$0")/.."
in="${1:?master}"; shift; B=("$@"); [ ${#B[@]} = 6 ] || { echo "6 boundaries"; exit 2; }
N="${FRAMES:-60}"; IDS="hf-port-1 hf-port-2 hf-port-3 hf-port-4 hf-port-5"
if [ "${STEP:-all}" != encode ]; then
  for k in 1 2 3 4 5; do
    a=${B[$((k-1))]}; b=${B[$k]}; [ "${SPLIT:-0}" = 1 ] && [ $k -lt 5 ] && b=$((b-1))
    sel=$(awk -v a=$a -v b=$b -v n=$N 'BEGIN{for(i=0;i<n;i++) printf "%seq(n\\,%d)", (i?"+":""), int(a+i*(b-a)/(n-1)+0.5)}')
    mkdir -p masters/hf-port-$k
    ffmpeg -nostdin -v error -y -i "$in" -vf "select='$sel',setpts=N/24/TB" -an -c:v libx264 -preset slow -crf 10 -pix_fmt yuv420p masters/hf-port-$k/master.mp4
    echo "hf-port-$k: frames $a-$b -> $N"
  done
fi
[ "${STEP:-all}" = cut ] && exit 0
export SOLVE="$IDS"
for id in $IDS; do POSTERS=only POSTER_2560=1 CAP_KB=60 scripts/encode-hf.sh $id; done
for id in $IDS; do
  TIERS="m 960" POSTERS=no scripts/encode-hf.sh $id
  TIERS="1280 1920" CAP_1280=665600 CAP_1920=665600 POSTERS=no scripts/encode-hf.sh $id
  TIERS=2560 CAP_2560=450560 POSTERS=no scripts/encode-hf.sh $id
done
node --import tsx scripts/clip-manifest.ts top av1; node --import tsx scripts/clip-manifest.ts top hevc
