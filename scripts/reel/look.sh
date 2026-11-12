#!/usr/bin/env bash
# The reel's one look (warm golden hour: amber highlights, teal shadows, lifted hazy blacks), applied to every clip.
#   scripts/reel/look.sh <in.mp4> <out.mp4>
set -euo pipefail
LOOK="colorbalance=rs=-0.05:bs=0.05:rm=0.03:bm=-0.03:rh=0.07:gh=0.02:bh=-0.08,eq=saturation=1.06,colorlevels=romin=0.03:gomin=0.04:bomin=0.045"
ffmpeg -nostdin -v error -y -i "$1" -vf "$LOOK,format=yuv420p" -r 24 -c:v libx264 -preset slow -crf 12 -an "$2"
