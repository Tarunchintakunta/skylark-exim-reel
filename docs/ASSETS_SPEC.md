# ASSETS_SPEC.md: media pipeline, budgets, scripts

**This pack contains no video, .blend or .glb files.** Sources live outside the repo:
- Reused clips + chain anchors: github.com/Tarunchintakunta/skylark (`assets/video/1080/*.mp4`, `assets/anchors/`, `assets/stills/`). `scripts/fetch-sources.sh` copies them.
- New/regenerated clips (5): Tarun makes them in Higgsfield (`HIGGSFIELD.md`) and drops the 1080p masters into `assets-src/video/<id>.mp4`.
- Port and ship clips (`x-cranes`, `x-ship`): **Claude** builds, animates and renders them in Blender from `assets-src/blender/port.blend` (`BLENDER_GLB_SPEC.md` §3) and writes the 1080p masters to the same `assets-src/video/<id>.mp4`.
- GLBs (7): **Claude** builds them in Blender through its connector (`BLENDER_GLB_SPEC.md`) and exports to `assets-src/models/<name>.glb`.
Claude runs the scripts below on `assets-src/` and commits only the **optimised output** in `public/` (plus small review renders in `docs/renders/`).

## Folder layout (in the new repo `skylark-exim-v3`)
```
assets-src/                 # git-ignored masters (never committed)
  video/   opening.mp4 a1.mp4 a2.mp4 a3.mp4 a4.mp4 b2.mp4 b3.mp4          (REUSE, from skylark repo)
           o-catch.mp4 p-ponds.mp4 p-intake.mp4 p-proc.mp4 p-freeze.mp4   (NEW/REGEN, Higgsfield, from Tarun)
           x-cranes.mp4 x-ship.mp4                                         (BLENDER renders, from Claude)
  blender/ port.blend [intake.blend]                                     (Claude's Blender sources)
  render/  port/####.png preview/####.png                                 (Blender frame output; never committed)
  anchors/ *_1080*.png anchor2.png hero.png globe.png a3_first_1080.png
  models/  tuna.glb swordfish.glb shrimp.glb truck.glb reefer.glb crane.glb ship.glb   (raw Blender exports, compression off)
  textures/ earth_day_8k.jpg (NASA Blue Marble, public domain) for the code-built globe
public/                     # committed, optimised
  media/   <id>_1280.mp4 <id>_720.mp4 [<id>_1280.av1.webm] <id>_1280.webp <id>_720.webp <id>_end_1280.webp
  models/  tuna.glb swordfish.glb shrimp.glb truck.glb reefer.glb crane.glb ship.glb   (≤ 500 KB each; only the first 3 load on the default site)
  textures/earth_day_2048.webp earth_day_4096.webp
  docs/    skylark-exim-company-profile.pdf
  og/      og-1200x630.jpg
docs/renders/               # committed review renders: 3 PNG stills per model/shot, port-preview.mp4 (≤ 4 MB)
scripts/   fetch-sources.sh encode-clips.sh make-posters.sh optimize-glb.sh
```
`.gitignore`: `assets-src/`. Total `public/media` + `public/models` must stay under ~40 MB, so Git LFS is not needed. If it grows past that, track `public/media/**` with LFS (see GIT_WORKFLOW.md).

## Hard budgets
| Asset | Desktop | Mobile |
|---|---|---|
| Scroll clip, per 8 s | ≤ 1.5 MB (12 s: ≤ 2.25 MB) | ≤ 0.8 MB (12 s: ≤ 1.2 MB) |
| Poster (first frame) | WebP ≤ 80 KB @1280w | WebP ≤ 40 KB @720w |
| GLB each | ≤ 500 KB after optimize (hard cap 1.5 MB) | same file (mobile gets lower dpr, not a second file) |
| Globe texture | ≤ 900 KB (4096 WebP) | ≤ 350 KB (2048 WebP) |
| Initial load (before first scroll) | target 1.5 MB, hard cap 3 MB | target 0.8 MB, hard cap 1.5 MB |
| Full scroll, one path | ≤ 25 MB | ≤ 12 MB |

Only the current clip and the next one are fetched. Posters for every chapter preload after the loader (they're tiny).

## Measured results (box test encodes, 2026-10-09, with `scripts/encode-clips.sh` defaults)
| id | len | recipe | 1280 | 720 | poster 1280 |
|---|---|---|---|---|---|
| opening | 8 s | crf 28 | 557 KB | 205 KB | 4 KB |
| a1 | 8 s | busy (crf 30 + hqdn3d) | 1,027 KB | 448 KB | 10 KB |
| a2 | 8 s | busy | 1,453 KB | 668 KB | 42 KB |
| a3 | 8 s | busy | 1,492 KB | 693 KB | 38 KB |
| a4 | 12 s | busy | 2,013 KB | 925 KB | 36 KB |
| b2 | 8 s | crf 28 | 878 KB | 396 KB | 23 KB |
| b3 | 8 s | busy | 1,241 KB | 541 KB | 28 KB |
| t1 (worst case, plant interior) | 8 s | busy | 1,286 KB | 603 KB | 69 KB |

AV1 (SVT, crf 40) of t1 came out 1,336 KB vs 1,317 KB H.264, so on busy clips AV1 gains nothing; keep it optional (`AV1=1`) and only ship it where it's ≥ 25% smaller.
Keyframe check: `ffprobe` shows `I P P P P P I …` (GOP 6, no B-frames) = a keyframe every 0.25 s, so any seek decodes ≤ 5 frames.
**Projected full-scroll weight, Ocean path, desktop:** reused (opening, a1–a4) 6.5 MB + 6 new clips on that path (Higgsfield: o-catch, p-intake, p-proc, p-freeze; Blender renders: x-cranes, x-ship; same encode budgets, and clean CG renders usually come out smaller) ≈ 9.2 MB + globe texture 0.9 MB + 3 product GLBs ≤ 1.5 MB (3 × 500 KB; truck/reefer/crane/ship are not loaded) + posters ≈ 0.6 MB + JS/CSS/fonts ≈ 0.7 MB ≈ **19.5 MB** (budget 25). Mobile ≈ **10 MB** (budget 12). The Pond path is ~2 MB lighter. If a new clip lands over budget, re-encode it with `BUSY`/`TRIM` before touching anything else (for the Blender clips you can also re-render with fewer fine details in the water).

## Scripts (tested on the box on t1, a1–a4, b2, b3, opening, and a GLB)
Run from the repo root. All take optional ids/names; no args = everything in `assets-src/`.
```bash
scripts/fetch-sources.sh            # clone github.com/Tarunchintakunta/skylark to ../skylark if missing; copy reused masters + anchors
scripts/encode-clips.sh             # -> public/media/<id>_1280.mp4 + <id>_720.mp4; prints KB and flags anything over budget
AV1=1 scripts/encode-clips.sh x-ship  # optional AV1 webm too
FORCE=1 scripts/encode-clips.sh a2  # re-encode
TRIM=8 scripts/encode-clips.sh a4   # cap length if a 12 s clip blows the budget
scripts/make-posters.sh             # first-frame posters 1280/720 + last-frame poster (for reverse scroll)
scripts/optimize-glb.sh             # meshopt + WebP textures, 2048 max; warns > 500 KB; TEX=1024 to shrink; KTX2=1 if toktx is installed
```
Requirements: `ffmpeg` with libx264 + libwebp (+ libsvtav1 for AV1), Node 20+ (`npx @gltf-transform/cli@4`).
Box test: `tuna_hero.glb` from the kohl draft went 196 KB → 84 KB with `optimize-glb.sh`.
Blender frames → master (BLENDER_GLB_SPEC.md §3.6): `ffmpeg -framerate 24 -start_number <first> -i assets-src/render/port/%04d.png -frames:v 192 -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p assets-src/video/<id>.mp4`, then the normal `encode-clips.sh` / `make-posters.sh`.

Recipe details (what the scripts do):
- Clip: `-an -vf scale=1280:-2 -c:v libx264 -preset slow -crf 28 -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart`. Busy ids (`BUSY` list: a1 a2 a3 a4 b3 o-catch p-intake p-proc p-freeze x-cranes x-ship) use `crf 30` + `hqdn3d=1.5:1.5:4:4`. Mobile: same at 720w. SSIM on t1 at GOP 6 crf 28 = 0.981.
- Fallback only if a device still stutters: all-intra 15 fps (`-vf fps=15,scale=1280:-2 -g 1 -crf 32`).
- Posters: `-frames:v 1 -c:v libwebp -quality 72` (1280) / `70` (720); auto-drops to quality 60 if over budget.

## Delivery rules (implemented in the ScrubVideo component)
- `<video muted playsinline preload="auto" disablepictureinpicture>`, never autoplay, no `loop`. `currentTime` is driven by scroll.
- Exactly two video elements (current + next). On chapter change swap roles, set the next `src`, keep the poster `<img>` on top until `loadeddata` + first `requestVideoFrameCallback`.
- Seek only when |target − current| > 1/24 s; never queue a seek while `video.seeking` (store the latest target, apply on `seeked`).
- Boundary hand-off: chained clips share their boundary frame, so the swap at progress 1.0 → 0.0 is invisible. Where there's no shared frame (p-ponds → b2, x-ship → globe) cross-fade opacity over 6 frames' worth of scroll.
- `vercel.json`: `Cache-Control: public, max-age=31536000, immutable` on `/media/*`, `/models/*`, `/textures/*`, `/assets/*`.
- Never ship 1080p masters, frame sequences (`assets/frames`, `assets-src/render/`), .blend files or anchors in `public/`.
