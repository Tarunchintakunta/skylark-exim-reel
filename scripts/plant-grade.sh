#!/usr/bin/env bash
# Grade the live-action plant clips to the CG film (STYLE.md, PLANT=1 in scripts/cg-grade.sh) and re-encode them:
# every tier from the graded master, the desktop frame set at its old size (the path budget doesn't move), then the
# phone tier back under its cap (scripts/cap-phone.py). Source: the master each clip shipped from
# (MASTERS/_shipped-<id>), else the site's own 2560 file (polished masters that aren't kept), else its 1920 file.
#   MASTERS=<dir> scripts/plant-grade.sh <id>...
set -euo pipefail
cd "$(dirname "$0")/.."
M="${MASTERS:?MASTERS=<dir holding _shipped-<id>/master.mp4>}"
for id in "$@"; do
  src="$M/_shipped-$id/master.mp4"
  [ -f "$src" ] || src="public/media/${id}_2560.av1.mp4"
  [ -f "$src" ] || src="public/media/${id}_1920.av1.mp4"
  kb=$(( $(cat public/media/${id}-f_1920_*.avif | wc -c) / 1024 + 1 ))
  echo "== $id from $src (frame set ${kb} KB)"
  PLANT=1 scripts/cg-grade.sh "$id" "$src"
  SOLVE="$id" scripts/encode-hf.sh "$id"
  FRAMES=72 PRESET=4 CRF=30 SET_KB="$kb" scripts/clip-frames.sh "$id"
  python3 scripts/cap-phone.py "$id"
done
