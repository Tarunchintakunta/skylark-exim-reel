#!/bin/sh
# The globe's earth texture (#274): 4096×2048 for desktops, 2048×1024 for phones, AVIF (SVT-AV1 crf 24) with a WebP
# (q 80) fallback, from the NASA Blue Marble master (assets-src/textures/earth_day_5400.jpg, git-ignored).
# The grade lifts the oceans' shadows to the bright daytime blue of the first texture (#16): per-channel curves fitted
# to it (mean error under 1.4 / 255 per channel).
#   sh scripts/globe-texture.sh
set -e
src=assets-src/textures/earth_day_5400.jpg
grade="curves=r='0/0.094 0.031/0.118 0.063/0.153 0.125/0.204 0.251/0.314 0.376/0.427 0.502/0.545 0.627/0.655 0.753/0.769 0.878/0.890 1/0.980':g='0/0.212 0.031/0.224 0.063/0.247 0.125/0.302 0.251/0.400 0.376/0.502 0.502/0.600 0.627/0.702 0.753/0.804 0.878/0.906 1/0.992':b='0/0.392 0.031/0.416 0.063/0.435 0.125/0.475 0.251/0.549 0.376/0.627 0.502/0.702 0.627/0.784 0.753/0.863 0.878/0.937 1/0.996'"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/globe.XXXXXX")
for w in 4096 2048; do
  ffmpeg -nostdin -v error -y -i "$src" -vf "$grade,scale=$w:-2:flags=lanczos,format=yuv420p" -c:v libsvtav1 -preset 4 -crf 24 -frames:v 1 "public/textures/earth_day_$w.avif" 2>/dev/null
  ffmpeg -nostdin -v error -y -i "$src" -vf "$grade,scale=$w:-2:flags=lanczos" "$tmp/$w.png"
  cwebp -quiet -m 6 -q 80 "$tmp/$w.png" -o "public/textures/earth_day_$w.webp"
done
rm -r "$tmp"
