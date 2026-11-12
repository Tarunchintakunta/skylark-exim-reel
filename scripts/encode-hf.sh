#!/usr/bin/env bash
# Encode one clip from its master into every scrub tier, codec and poster (HD pass; docs/HIGGSFIELD_STORYBOARD.md).
#   scripts/encode-hf.sh <id>          master: masters/<id>/master.mp4 (2560×1440, 24 fps; gitignored, never public/media)
# -> public/media/<id>_<tier>.av1.mp4 · .hevc.mp4 · .mp4 (H.264)   tiers m (810×1440 portrait crop), 960, 1280, 1920;
#    AV1 and HEVC also at 2560, inside the 2560 path budget and kept only where clip-manifest.ts `top` fits them
#    public/media/<id>_<tier>.avif + .webp   first-frame posters, tiers m, 960, 1280, 1920 (+ 2560 when served)
#    public/media/<id>_end_1280.avif + .webp     last-frame poster for scrolling back into a clip (desktop)
# POSTERS=only: the posters alone (the solver counts their bytes); POSTERS=no: the clips alone.
# TIERS="2560": those tiers alone (the 2560 decision is re-run on its own when the budget changes).
# CODECS="av1": those codecs alone, for re-encoding one codec's file without touching the others.
# A cut of another clip (#268, the story entry's crate-free wild card): MASTER_ID=<clip whose master to read>,
# CAPS_ID=<clip whose size caps to use>, SRC_CROP=w:h:x:y cropped from the master before every desktop tier (never scaled
# up: list only TIERS up to its width), M_CROP=w:h:x:y the phone tier's own crop, kept at its native size unless
# M_SCALE=1 scales it to 810×1440 (a crop off the top of the frame, like the port film's: scripts/port-film.sh).
# SOLVE="<ids>": the clips being encoded in this run; every other clip keeps its files and its bytes (clip-manifest.ts caps).
# CAP_<tier>=<bytes>: that tier's cap instead of the solver's, for a tier whose budget cannot hold the clip (say so in the PR).
# Quality first, capped by size: AV1 crf 30 / HEVC crf 22 / H.264 crf 18, HEVC and H.264 with maxrate at the solver's
# cap for the tier (scripts/clip-manifest.ts caps). Where the cap still binds, the encode drops to a VBR at the cap; AV1
# goes there directly (SVT-AV1's capped CRF starves busy frames: SSIM 0.83 vs 0.89 for VBR at fewer bytes on hf-catch).
# Every file ends ≤ its cap.
# GOP: a keyframe every ${GOP:-6} frames (0.25 s), closed, no scene cuts, no B-frames. A 12-frame GOP (0.5 s) was tried
# first: on the desktop ocean path (1920, AV1) presented fps fell to 36 and seek p95 rose to 48 ms (over a frame), stale
# 42 %; at 6 frames: 55 fps, seek p95 22 ms, stale 0 % (tests/video-smoothness.spec.ts). No audio, faststart.
set -euo pipefail
cd "$(dirname "$0")/.."
id="${1:?id}"; in="$PWD/masters/${MASTER_ID:-$id}/master.mp4"; OUT="$(cd "${OUT:-public/media}" && pwd)"; GOP="${GOP:-6}"
[ -f "$in" ] || { echo "! $id: no master at $in, left unchanged"; exit 3; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/hf.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
kb(){ echo $(( $(stat -f%z "$1") / 1024 )); }
bytes(){ stat -f%z "$1"; }
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
# the phone crop: 810×1440 around CROP_X (src/config/chapters.ts), never scaled up
cx=$(node --import tsx --input-type=module -e "const { CROP_X } = await import('./src/config/chapters.ts'); console.log(CROP_X['$id'] ?? 0.5)")
x=$(awk -v c="$cx" 'BEGIN{x=int(c*2560-405); if(x<0)x=0; if(x>1750)x=1750; print x - x%2}')
mvf="crop=${M_CROP:-810:1440:$x:0}${M_SCALE:+,scale=810:1440:flags=lanczos}"
vf(){ case "$1" in m) echo "$mvf";; 2560) echo "${SRC_CROP:+crop=$SRC_CROP,}null";; *) echo "${SRC_CROP:+crop=$SRC_CROP,}scale=$1:-2:flags=lanczos";; esac; }

# enc <codec> <tier> <out> <crf|vbr> <kbit/s>
enc(){
  local c=$1 t=$2 o=$3 mode=$4 br=$5 rc
  case $c in
    av1) [ "$mode" = crf ] && rc="-crf 30" || rc="-b:v ${br}k"
         ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" -an -pix_fmt yuv420p -r 24 -c:v libsvtav1 -preset 5 $rc -g "$GOP" \
           -svtav1-params "$([ "$mode" = vbr ] && echo rc=1:)film-grain=0:scd=0:irefresh-type=2" -movflags +faststart "$o" 2>&1 | grep -v '^Svt' || true ;;
    hevc) local p="keyint=$GOP:min-keyint=$GOP:scenecut=0:bframes=0:open-gop=0:log-level=error"
         if [ "$mode" = crf ]; then
           ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" -an -pix_fmt yuv420p -r 24 -c:v libx265 -preset slow -crf 22 -tag:v hvc1 -x265-params "$p$([ "$br" -gt 0 ] && echo ":vbv-maxrate=$br:vbv-bufsize=$((br*2))")" -movflags +faststart "$o"
         else
           ( cd "$tmp" && ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" -an -pix_fmt yuv420p -r 24 -c:v libx265 -preset slow -b:v ${br}k -tag:v hvc1 -x265-params "$p:pass=1" -f null - &&
             ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" -an -pix_fmt yuv420p -r 24 -c:v libx265 -preset slow -b:v ${br}k -tag:v hvc1 -x265-params "$p:pass=2:vbv-maxrate=$((br*2)):vbv-bufsize=$((br*2))" -movflags +faststart "$o" )
         fi ;;
    h264) local X="-c:v libx264 -profile:v high -preset slower -tune film -g $GOP -keyint_min $GOP -sc_threshold 0 -bf 0 -pix_fmt yuv420p -r 24 -an"
         if [ "$mode" = crf ]; then
           ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" $X -crf 18 $([ "$br" -gt 0 ] && echo "-maxrate ${br}k -bufsize $((br*2))k") -movflags +faststart "$o"
         else
           ( cd "$tmp" && ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" $X -b:v ${br}k -pass 1 -f null - &&
             ffmpeg -nostdin -v error -y -i "$in" -vf "$(vf $t)" $X -b:v ${br}k -maxrate $((br*2))k -bufsize $((br*2))k -pass 2 -movflags +faststart "$o" )
         fi ;;
  esac
}

posters(){
  # first frame (and last, for scrolling back up on desktop) straight from the master, lossless until the encode
  local crop="${SRC_CROP:+-vf crop=$SRC_CROP}" still_m=""
  ffmpeg -nostdin -v error -y -i "$in" $crop -frames:v 1 "$tmp/first.png"
  ffmpeg -nostdin -v error -y -sseof -0.1 -i "$in" $crop -update 1 -frames:v 1 "$tmp/last.png"
  if [ -n "${M_CROP:-}" ]; then ffmpeg -nostdin -v error -y -i "$in" -vf "$mvf" -frames:v 1 "$tmp/first_m.png"; still_m="$tmp/first_m.png"; fi
  STILL="$tmp/first.png" LAST="$tmp/last.png" STILL_M="$still_m" CX="$cx" ID="$id" OUT="$OUT" python3 scripts/stills.py
}
[ "${POSTERS:-}" = only ] && { posters; exit 0; }
# a clip the solver has no caps for (a desktop frame-set clip) can still be encoded at an explicit CAP_<tier>
caps=$(node --import tsx scripts/clip-manifest.ts caps "${CAPS_ID:-$id}" 2>/dev/null || true)
cap(){ local o="CAP_$1"; [ -n "${!o:-}" ] && echo "${!o}" || awk -v t="$1" '$1==t{print $2}' <<<"$caps"; }
for t in ${TIERS:-m 960 1280 1920 2560}; do [ -n "$(cap $t)" ] || { echo "! $id: no size cap for tier $t (set CAP_$t)"; exit 4; }; done

line="$id (crop x $x)"
for t in ${TIERS:-m 960 1280 1920 2560}; do
  for c in ${CODECS:-av1 hevc h264}; do
    [ "$c" = h264 ] && [ "$t" = 2560 ] && continue
    o="$OUT/${id}_${t}$([ $c = h264 ] || echo ".$c").mp4"
    c_b=$(cap $t); rate=$(awk -v b="$c_b" -v d="$dur" 'BEGIN{printf "%d", b*8/1000*0.97/d}')   # kbit/s, 3 % container headroom
    enc $c $t "$o" crf $rate
    if [ "$(bytes "$o")" -gt "$c_b" ]; then
      # over the cap: VBR at the cap, corrected by the miss until it lands in 92–100 % of the cap (single-pass AV1
      # under- and overshoots); the largest result under the cap wins
      r=$rate; have=0
      for n in 1 2 3 4 5; do
        enc $c $t "$o" vbr $r; s=$(bytes "$o")
        if [ "$s" -le "$c_b" ]; then cp "$o" "$tmp/best.mp4"; have=1; [ "$s" -ge $(( c_b * 92 / 100 )) ] && break; fi
        r=$(awk -v r="$r" -v b="$c_b" -v s="$s" 'BEGIN{f=0.97*b/s; if(f>1.25)f=1.25; printf "%d", r*f}')
      done
      [ $have = 1 ] && cp "$tmp/best.mp4" "$o"
      [ "$(bytes "$o")" -gt "$c_b" ] && echo "  ! $o $(kb "$o") KB over its cap $((c_b/1024)) KB"
    fi
    line="$line  $t.$c $(kb "$o")/$((c_b/1024))"
  done
done
echo "$line"
[ "${POSTERS:-}" = no ] || posters
