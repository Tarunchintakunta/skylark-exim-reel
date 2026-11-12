#!/usr/bin/env bash
# Re-export every clip, poster and still from masters/ (HD pass). Posters first: the budget solver counts their bytes
# as the paths' overhead, then the hero loop, then the clips (JOBS at a time), then the 2560 decision per codec.
#   scripts/encode-all.sh [id …]     (default: every masters/<id>/master.mp4)
set -euo pipefail
cd "$(dirname "$0")/.."
ids=("$@"); [ ${#ids[@]} -gt 0 ] || ids=($(cd masters && ls -d */ | tr -d /))
for id in "${ids[@]}"; do POSTERS=only scripts/encode-hf.sh "$id"; done
# the documentation backdrop (#315): its 3392×1908 master, sharp (no blur), centred on the laptop
[ -f masters/ph-docs.png ] && STILL=masters/ph-docs.png CX=0.73 POSTER_2560=1 ID=ph-docs-blur OUT=public/media python3 scripts/stills.py
printf '%s\n' "${ids[@]}" | xargs -P "${JOBS:-2}" -I{} env POSTERS=no scripts/encode-hf.sh {}
for c in av1 hevc; do
  read -r top why < <(node --import tsx scripts/clip-manifest.ts top $c)
  echo "2560 $c: $top ($why)"
  [ "$top" = 2560 ] || rm -f public/media/*_2560.$c.mp4
done
