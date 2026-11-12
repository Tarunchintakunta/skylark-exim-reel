#!/usr/bin/env bash
# Hero frame sets for the canvas scroll sequence (#249, #264). Frames come from the 2560×1440 master and never scale up:
# desktop is 1920×1080, the phone set is the same 810×1440 portrait crop the _m clips use (src/config/chapters.ts
# CROP_X). Both formats: AVIF (SVT-AV1, crf 25 ≈ libavif q 60) and WebP q 78, each stepped down only until the set fits
# its budget, never below WebP q 70 / AVIF crf 41.
#   scripts/make-frames.sh <master.mp4> [name] [desktop frames] [phone frames]
# -> public/media/<name>-seq_1920_NNN.{avif,webp} · public/media/<name>-seq_m_NNN.{avif,webp}
# The files live in public/media, so they carry a content hash in their URL and are served immutable like every other
# media file (src/film/media.ts, vercel.json). Budgets: DESKTOP_KB (5,000) and PHONE_KB (2,800) per format.
set -euo pipefail
cd "$(dirname "$0")/.."
in="${1:?master.mp4}"; name="${2:-hero}"; nd="${3:-60}"; nm="${4:-48}"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
cx=$(node --import tsx --input-type=module -e "const { CROP_X } = await import('./src/config/chapters.ts'); console.log(CROP_X['$name-loop'] ?? CROP_X['$name'] ?? 0.5)")
x=$(awk -v c="$cx" 'BEGIN{x=int(c*2560-405); if(x<0)x=0; if(x>1750)x=1750; print x - x%2}')
tmp=$(mktemp -d "${TMPDIR:-/tmp}/frames.XXXXXX"); trap 'rm -rf "$tmp"' EXIT

# set_frames <tier> <frames> <ffmpeg filter> <budget bytes>
set_frames() {
  local tier=$1 n=$2 vf=$3 budget=$4
  local d="$tmp/$tier"
  mkdir -p "$d"
  ffmpeg -nostdin -v error -y -i "$in" -vf "fps=$n/$dur,$vf" -frames:v "$n" "$d/%03d.png"
  rm -f "public/media/${name}-seq_${tier}_"*.avif "public/media/${name}-seq_${tier}_"*.webp
  local ext q total max f out
  for ext in avif webp; do
    for q in $([ "$ext" = avif ] && echo "25 29 33 37 41" || echo "78 74 70"); do
      for f in "$d"/*.png; do
        out="public/media/${name}-seq_${tier}_$(basename "${f%.png}").$ext"
        if [ "$ext" = avif ]; then
          ffmpeg -nostdin -v error -y -i "$f" -vf format=yuv420p -c:v libsvtav1 -preset 8 -crf "$q" -frames:v 1 "$out" 2>&1 | grep -v '^Svt' || true
        else
          cwebp -quiet -m 6 -q "$q" "$f" -o "$out"
        fi
      done
      total=$(cat "public/media/${name}-seq_${tier}_"*.$ext | wc -c | tr -d ' ')
      max=$(for f in "public/media/${name}-seq_${tier}_"*.$ext; do wc -c < "$f"; done | sort -n | tail -1)
      [ "$total" -le "$budget" ] && break
    done
    echo "$name-seq $tier $ext: $n frames, q/crf $q, $((total / 1024)) KB total, largest $((max / 1024)) KB$([ "$total" -gt "$budget" ] && echo " OVER $((budget / 1024)) KB")"
  done
}

set_frames 1920 "$nd" "scale=1920:-2:flags=lanczos" $((${DESKTOP_KB:-5000} * 1024))
set_frames m "$nm" "crop=810:1440:$x:0" $((${PHONE_KB:-2800} * 1024))
