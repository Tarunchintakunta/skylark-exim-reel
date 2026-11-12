#!/usr/bin/env bash
# Masters changed in the final polish pass (no new footage, no Higgsfield, no Blender renders), for scripts/encode-hf.sh.
#   scripts/polish-masters.sh            HD=<hd-masters> (default below)
# - hf-arrive, hf-reverse: mirrored. The truck came in left-hand drive; mirrored, the driver sits on the right, as on
#   an Indian road. Neither shot has readable text (no plates, no lettering on the cab or the dock).
# - hf-ship: cropped to the lower right of the frame (1176x662 at 1384,778, scaled back to 2560), below the tug that
#   pushed the ship's bow in every frame: the container ship is the only vessel in shot.
#   From the sharpest master (the 2560 near-lossless hd-master; the 3840 k4 file is a lossy upscale with less edge
#   detail), with a light unsharp only.
# - hf-unload-shrimp, hf-store: every frame of the photoreal takes in use showed white plastic crates (unload) or racks
#   of white boxes (cold store). No Blender: the unload slot takes the photoreal #246 take (Skylark-17-Oct/videos/
#   higgsfield-clips/hf-246-unload.mp4: steel crates on ice out of the truck), 124 frames resampled to 72; the cold store
#   is a slow push on its photoreal start frame (Skylark-17-Oct/images/earlier-session/257-start-4k.png) after
#   scripts/steel-grade.py grades its white boxes to brushed steel.
# - hf-peel: the peeling alone (its first 17 frames, motion-interpolated to 43), into masters/hf-peel-trim; the rest of
#   the take glided through the glass door into the quality lab, under "Made to order":
#   ffmpeg -i <hf-peel master> -vf "trim=end_frame=17,setpts=PTS*48/17,minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" ...
#   MASTER_ID=hf-peel-trim SOLVE=hf-peel scripts/encode-hf.sh hf-peel (POSTERS=only, then POSTERS=no)
# - hf-fish-freeze: every frame showed a packer laying fish into a brown carton (left half). Desktop tiers are the right
#   of the frame, the rack of fish and tuna loins going into the blast freezer (1232x693 at 1328,260, scaled to 2560
#   with a light unsharp) in masters/hf-fish-freeze-rack; the phone tier crops the original master at x 1450 (CROP_X
#   0.725), also right of the carton:
#   ffmpeg -i masters/hf-fish-freeze/master.mp4 -vf "crop=1232:693:1328:260,scale=2560:1440:flags=lanczos,unsharp=5:5:0.5" ...
#   MASTER_ID=hf-fish-freeze-rack POSTERS=only, then MASTER_ID=hf-fish-freeze (phone poster, TIERS=m), then
#   MASTER_ID=hf-fish-freeze-rack TIERS="960 1280 1920 2560" (SOLVE=hf-fish-freeze throughout)
# - hf-store (last fixes): scripts/steel-grade.py darker (0.55 L), down to L 135, a tighter mask round the near worker, and
#   the stack on the pallet jack graded too; masters/hf-store-steel, MASTER_ID=hf-store-steel SOLVE=hf-store.
# - hf-port-1, hf-port-2 on desktop (last fixes): the same pull-back on hf-port-3's first frame as the phones, on the whole
#   frame, so the desktop port opens on the crane and the container too (was the gate canopy, then the hull and empty quay):
#   DESKTOP=1 python3 scripts/phone-port-hold.py p3.png 49 60 masters/hf-port-1-d/master.mp4 masters/hf-port-2-d/master.mp4
#   per k: MASTER_ID=hf-port-k-d scripts/clip-frames.sh hf-port-k; desktop posters (CAPS_ID=hf-sail SOLVE=hf-sail
#   POSTERS=only POSTER_2560=1 CAP_KB=60 into a scratch OUT, keeping the phone _m files); TIERS 960, 1280 1920 at 650 KB,
#   2560 at 440 KB as in scripts/port-film.sh
# - hf-ice, hf-harvest, hf-sort (last fixes): scripts/crate-steel.py grades the blue plastic crates (and hf-ice's two red
#   ones, RED=1; hf-harvest's backlit crates, DARK=1) to steel, into masters/<id>-steel; MASTER_ID=<id>-steel
#   SOLVE="hf-ice hf-harvest hf-sort"
# - hf-sort, hf-harvest (last fixes, round 2): grey crates still read as moulded plastic (ribs, a styrofoam chest, a
#   bucket). scripts/steel-objects.py redraws each crate, chest and bucket as steel inside outlines drawn on frame 0
#   (scripts/steel-objects/<id>.json) that follow the camera, then crate-steel.py greys what blue is left (poles, gloves,
#   a crate carried past):
#   python3 scripts/steel-objects.py masters/hf-sort/master.mp4 masters/hf-sort-steel2/master.mp4 scripts/steel-objects/hf-sort.json
#   GAIN=0.38 LIFT=60 TINT=0.6 GATE=14 python3 scripts/steel-objects.py masters/hf-harvest/master.mp4 masters/hf-harvest-steel2/master.mp4 scripts/steel-objects/hf-harvest.json
#   python3 scripts/crate-steel.py masters/hf-sort-steel2/... masters/hf-sort-steel3/... ; DARK=1 for hf-harvest
#   MASTER_ID=<id>-steel3 SOLVE="hf-harvest hf-sort"; hf-harvest with CAP_1920=2290000 (its H.264 1920 file under 2300 KB)
# - hf-fish-freeze_1920.mp4 re-encoded under 2300 KB: MASTER_ID=hf-fish-freeze-rack TIERS=1920 CODECS=h264 CAP_1920=2290000
# hf-load (the port's loading-dock opening) is cut from /story instead: wrapped carton pallets on wooden pallets, or
# the carton stack inside the trailer, are in all but its last 8 frames.
set -euo pipefail
cd "$(dirname "$0")/.."
HD="${HD:-$HOME/Desktop/skylark/hd-masters}"
X264=(-c:v libx264 -preset slow -crf 10 -pix_fmt yuv420p -an)
SRC="${SRC:-$HOME/Desktop/skylark/Skylark-17-Oct}"
sel=$(awk 'BEGIN{for(i=0;i<72;i++) printf "%seq(n\\,%d)", (i?"+":""), int(i*123/71+0.5)}')
ffmpeg -nostdin -v error -y -i "$SRC/videos/higgsfield-clips/hf-246-unload.mp4" -vf "select='$sel',setpts=N/24/TB" "${X264[@]}" masters/hf-unload-shrimp/master.mp4
tmp=$(mktemp -d "${TMPDIR:-/tmp}/pm.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
python3 scripts/steel-grade.py "$SRC/images/earlier-session/257-start-4k.png" "$tmp/257-steel.png"
mkdir -p masters/hf-store-steel
python3 scripts/still-push.py "$tmp/257-steel.png" masters/hf-store-steel/master.mp4 0.5 0.55 1.08
# then, every other clip held at its files:
#   IDS="hf-arrive hf-reverse hf-unload-shrimp hf-store hf-ship"
#   for id in $IDS; do SOLVE="$IDS" POSTERS=only scripts/encode-hf.sh $id; SOLVE="$IDS" POSTERS=no scripts/encode-hf.sh $id; done
# The port film's phone tier, with a top crop so the canopy roof no longer fills a phone screen (as wide as the desktop
# frame shows it), at 160 KB a file (was ~100), inside the 12 MB phone paths.
#   for id in hf-port-1 hf-port-2 hf-port-3 hf-port-4 hf-port-5; do
#     CAPS_ID=hf-sail SOLVE=hf-sail M_CROP=608:1080:848:360 M_SCALE=1 TIERS=m CAP_m=163840 POSTERS=no scripts/encode-hf.sh $id
#     CAPS_ID=hf-sail SOLVE=hf-sail M_CROP=608:1080:848:360 M_SCALE=1 POSTERS=only POSTER_2560=1 CAP_KB=60 scripts/encode-hf.sh $id
#   done
# Phones: hf-port-1/2's phone tier is a pull-back on hf-port-3's first frame (scripts/phone-port-hold.py), so the
# phone port opens on the crane, not the canopy roof:
#   ffmpeg -i masters/hf-port-3/master.mp4 -frames:v 1 p3.png
#   mkdir -p masters/hf-port-1-m masters/hf-port-2-m
#   python3 scripts/phone-port-hold.py p3.png 49 60 masters/hf-port-1-m/master.mp4 masters/hf-port-2-m/master.mp4
#   for k in 1 2; do MASTER_ID=hf-port-$k-m CAPS_ID=hf-sail SOLVE=hf-sail M_CROP=810:1440:0:0 TIERS=m CAP_m=163840 POSTERS=no scripts/encode-hf.sh hf-port-$k; done
#   (phone posters the same way with POSTERS=only CAP_KB=60 into a scratch OUT; keep only the _m files)
