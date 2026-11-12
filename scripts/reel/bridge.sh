#!/usr/bin/env bash
# A Kling start+end bridge clip into the chain, exact at both joins.
#   scripts/reel/bridge.sh <id> <raw.mp4> <start.png> [end.png]
# -> masters/<id>/graded.mp4 (2560x1440, 24 fps). Kling treats the keyframes as targets, not as pixels: the first 8 frames
# ease in from the exact start frame and the last 8 ease out to the exact end frame, so frame 0 is the previous clip's
# last frame and the last frame is the next clip's first, pixel for pixel (the grade is already in the keyframes).
set -euo pipefail
cd "$(dirname "$0")/../.."
id="$1"; raw="$2"; start="$3"; end="${4:-}"
mkdir -p "masters/$id"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$raw")
n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$raw")
d=0.3333
f="[0]fps=24,scale=2560:1440:flags=lanczos,format=rgba[v];[1]scale=2560:1440,format=rgba,fade=out:st=0:d=$d:alpha=1[s];[v][s]overlay=shortest=1[a]"
if [ -n "$end" ]; then
  st=$(python3 -c "print(max(0,$n/24-$d-1/24))")
  f="$f;[2]scale=2560:1440,format=rgba,fade=in:st=$st:d=$d:alpha=1[e];[a][e]overlay=shortest=1,format=yuv420p"
  ffmpeg -nostdin -v error -y -i "$raw" -loop 1 -framerate 24 -i "$start" -loop 1 -framerate 24 -i "$end" -filter_complex "$f" -frames:v "$n" -r 24 -c:v libx264 -preset slow -crf 12 -an "masters/$id/graded.mp4"
else
  ffmpeg -nostdin -v error -y -i "$raw" -loop 1 -framerate 24 -i "$start" -filter_complex "$f;[a]format=yuv420p" -frames:v "$n" -r 24 -c:v libx264 -preset slow -crf 12 -an "masters/$id/graded.mp4"
fi
echo "$id: $n frames, $dur s"
