#!/usr/bin/env bash
# HD masters for /story (#hd2): masters/<id>/master.mp4 (2560×1440, 24 fps, the frame count and timing the clip ships
# with) rebuilt from each clip's highest-quality source, for scripts/encode-hf.sh. No new footage.
#   scripts/hd-masters.sh <id>...
#   RAW=<Skylark-17-Oct/videos> HD=<hd-masters> ESRGAN=<dir: realesrgan-ncnn-vulkan + models/> (defaults below)
# Three kinds of clip:
# - raw 2560: the 124-frame takes of the clips swapped on 2026-10-17, resampled to 72 frames (first and last kept),
#   straight from the take, not from the 72-frame masters encoded from it.
# - ESRGAN: the true source is 1920×1080. The port film's five takes (R1-R5), the loading beat's two (LA, LBfix), and
#   four hd-masters that are lanczos stretches of a 1080 take whose file is gone (hf-lab, hf-pack, hf-peel,
#   hf-unload-shrimp: a 2560→1920→2560 lanczos round trip of their frame 30 keeps 50-55 dB luma PSNR, against 33-46 dB
#   for every true 2560 clip; they are taken back down to 1920 first). Real-ESRGAN realesr-animevideov3 ×2 to
#   3840×2160 (realesrgan-x4plus was tried on a crane frame and a face: it paints hull rust and skin into flat
#   strokes, animevideov3 keeps them), lanczos to 2560, then a light temporal denoise (hqdn3d) and unsharp. The 3840
#   frames are kept too, as masters/<id>/master3840.mp4.
#   LANCZOS="<ids>": those clips skip ESRGAN (lanczos ×2 from the 1080 frames, same clean-up), for a clip where ESRGAN
#   invents texture. Run with LANCZOS="hf-pack hf-peel": on the packer's face ESRGAN flattened the skin and drew a dark
#   outline along the jaw, and on hf-peel it drew strokes into the hair nets and flattened the faces.
# - everything else: its hd-master is already a true 2560 master (symlinked).
# Frame maps were found by matching every shipped frame against the takes (luma PSNR ≥ 53 dB at 240×135; hf-port-1's
# dissolve frames as the blend they are). Masters are near-lossless H.264 (crf 4), gitignored.
set -euo pipefail
cd "$(dirname "$0")/.."
RAW="${RAW:-$HOME/Desktop/skylark/Skylark-17-Oct/videos}"; HD="${HD:-$HOME/Desktop/skylark/hd-masters}"
ESRGAN="${ESRGAN:-$HOME/Desktop/skylark/scene-work/tools/realesrgan}"
C="$RAW/higgsfield-clips"; F="$RAW/finished-films"
POST="hqdn3d=0.8:0.8:2:2,unsharp=5:5:0.3:5:5:0"
X264="-c:v libx264 -preset slow -crf 4 -pix_fmt yuv420p -an -movflags +faststart"

# seq a b n: n frame numbers from a to b, evenly, first and last kept
seq_n(){ awk -v a=$1 -v b=$2 -v n=$3 'BEGIN{for(i=0;i<n;i++) print int(a+i*(b-a)/(n-1)+0.5)}'; }
# pick <video> <dir> <prefix> <frames...>: those frames as <dir>/<prefix>NNNN.png, numbered in the order given
pick(){
  local v=$1 d=$2 p=$3; shift 3; local sel; sel=$(printf 'eq(n\\,%d)+' "$@"); sel=${sel%+}
  local t; t=$(mktemp -d "$d/pick.XXXX")
  ffmpeg -nostdin -v error -y -i "$v" -vf "select='$sel'" -fps_mode passthrough "$t/%04d.png"
  # select keeps source order; map back to the order asked for (frames may repeat)
  local sorted; sorted=($(printf '%s\n' "$@" | sort -n | uniq)); local k=0
  for f in "$@"; do
    local j; for j in "${!sorted[@]}"; do [ "${sorted[$j]}" = "$f" ] && break; done
    cp "$t/$(printf %04d $((j+1))).png" "$d/$p$(printf %04d $k).png"; k=$((k+1))
  done
  rm -rf "$t"
}
up(){ # up <in dir> <out dir>: ×2 to 3840×2160
  if [[ " ${LANCZOS:-} " == *" $id "* ]]; then
    for f in "$1"/*.png; do ffmpeg -nostdin -v error -y -i "$f" -vf scale=3840:2160:flags=lanczos "$2/$(basename "$f")"; done
  else
    "$ESRGAN/realesrgan-ncnn-vulkan" -i "$1" -o "$2" -n realesr-animevideov3 -s 2 -m "$ESRGAN/models" -f png >/dev/null 2>&1
  fi
  [ "$(ls "$1" | wc -l)" = "$(ls "$2" | wc -l)" ] || { echo "! $id: upscale lost frames"; exit 4; }
}
take(){
  case $1 in
    hf-unload-fish) echo 255-dock ;;
    hf-unload-crew) echo 246-unload ;;
    hf-intake) echo 256-intake-t2 ;;
    hf-store) echo 257-cold ;;
    hf-sail) echo 259-sea ;;
  esac
}
build(){ # build <dir of 3840 frames NNNN.png>
  mkdir -p "masters/$id"; rm -f "masters/$id/master.mp4"
  ffmpeg -nostdin -v error -y -framerate 24 -i "$1/%04d.png" -vf "scale=2560:1440:flags=lanczos,$POST" $X264 "masters/$id/master.mp4"
  ffmpeg -nostdin -v error -y -framerate 24 -i "$1/%04d.png" -vf "$POST" $X264 "masters/$id/master3840.mp4"
  [[ " ${LANCZOS:-} " == *" $id "* ]] && set -- "$1" "${2/ESRGAN/lanczos (ESRGAN backed off)}"
  echo "$id: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "masters/$id/master.mp4") frames ($2)"
}

for id in "$@"; do
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/hdm.XXXX"); mkdir -p "$tmp/in" "$tmp/up" "$tmp/out"
  case $id in
    hf-unload-fish|hf-unload-crew|hf-intake|hf-store|hf-sail)
      src=$(take "$id")
      pick "$C/$src.mp4" "$tmp/out" "" $(seq_n 0 123 72)
      mkdir -p "masters/$id"; rm -f "masters/$id/master.mp4" "masters/$id/master3840.mp4"
      ffmpeg -nostdin -v error -y -framerate 24 -i "$tmp/out/%04d.png" $X264 "masters/$id/master.mp4"
      echo "$id: 72 frames (raw 2560 $src.mp4)" ;;
    hf-port-1)
      # R1 0-28, a 6-frame dissolve 29-33 (R1 i → R1 i+48, weight (i-28)/6), then R1 82-96
      pick "$C/R1.mp4" "$tmp/in" a $(seq 0 33); pick "$C/R1.mp4" "$tmp/in" b $(seq 77 96)
      up "$tmp/in" "$tmp/up"
      python3 -I - "$tmp/up" "$tmp/out" <<'EOF'
import sys, numpy as np
from PIL import Image
up, out = sys.argv[1:]
a = lambda i: np.asarray(Image.open(f'{up}/a{i:04d}.png'), np.float32)
b = lambda i: np.asarray(Image.open(f'{up}/b{i - 77:04d}.png'), np.float32)
for i in range(49):
    f = a(i) if i <= 28 else b(i + 48) if i >= 34 else a(i) * (1 - (i - 28) / 6) + b(i + 48) * ((i - 28) / 6)
    Image.fromarray(np.clip(f + 0.5, 0, 255).astype(np.uint8)).save(f'{out}/{i:04d}.png')
EOF
      build "$tmp/out" "ESRGAN, raw R1.mp4" ;;
    hf-port-[2-5])
      k=${id#hf-port-}; pick "$C/R$k.mp4" "$tmp/in" "" $(seq_n 1 96 60); up "$tmp/in" "$tmp/out"; build "$tmp/out" "ESRGAN, raw R$k.mp4" ;;
    hf-load)
      # LA 0-94 (35 frames), then LBfix 1-101 (37 frames)
      pick "$C/LA.mp4" "$tmp/in" "" $(seq_n 0 94 35)
      pick "$F/LBfix.mp4" "$tmp/in" b $(seq_n 1 101 37)
      k=35; for f in "$tmp"/in/b*.png; do mv "$f" "$tmp/in/$(printf %04d $k).png"; k=$((k+1)); done
      up "$tmp/in" "$tmp/out"; build "$tmp/out" "ESRGAN, raw LA.mp4 + LBfix.mp4" ;;
    hf-lab|hf-pack|hf-peel|hf-unload-shrimp)
      ffmpeg -nostdin -v error -y -i "$HD/$id/master.mp4" -vf scale=1920:1080:flags=lanczos -start_number 0 "$tmp/in/%04d.png"
      up "$tmp/in" "$tmp/out"; build "$tmp/out" "ESRGAN, hd-master taken back to 1920" ;;
    *)
      [ -f "$HD/$id/master.mp4" ] || { echo "! $id: no hd-master"; exit 3; }
      rm -rf "masters/$id"; ln -s "$HD/$id" "masters/$id"; echo "$id: hd-master (true 2560)" ;;
  esac
  rm -rf "$tmp"
done
