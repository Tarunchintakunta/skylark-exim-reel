# Image sequence or video, per chapter (#264 step 3)

Terminal Industries draws its whole scroll on one `<canvas>`: 410 WebP frames of about 59 KB, loaded out of order so a
coarse version plays early. The brief asked for the same treatment on `/story`, keeping video "only where a benchmark
shows it is smoother or much lighter, decided per chapter by measurement". This is that measurement.

## How it was measured

`scripts/seq-bench.sh` extracts frames from each clip's own master (`masters/<id>/master.mp4`, 2560×1440, 24 fps, ~3 s),
encodes every frame as AVIF (SVT-AV1 `-crf 25`, which lands near libavif q 60) and as WebP `q 78`, and prints the
sequence's total bytes beside the clip's own AV1 file at the same tier. The clips are the ones the budget solver already
caps (`scripts/clip-manifest.ts`), so this compares what a visitor actually downloads either way.

```
scripts/seq-bench.sh seq-1920-12.tsv 12 1920          # every master, 12 fps, the 1920 tier
IDS="hf-catch hf-store hf-sail" scripts/seq-bench.sh matrix.tsv 24 810 1920 2560
```

## What it costs: one clip, three tiers, two frame rates

AVIF `crf 25` ≈ q 60, WebP q 78. `crf 33` is included to show what dropping below the brief's quality floor buys.
A busy shot (`hf-catch`: net, spray, fish), a calm interior (`hf-store`), and a smooth aerial (`hf-sail`).

| Clip | Tier | AVIF q60 24 fps | AVIF q60 12 fps | AVIF crf33 12 fps | WebP q78 24 fps | The clip as AV1 video |
| --- | --- | --- | --- | --- | --- | --- |
| hf-catch | 810×1440 phone | 11.51 MB | 5.76 MB | 3.91 MB | 10.84 MB | **0.46 MB** |
| hf-catch | 1920 | 23.74 MB | 11.87 MB | 8.37 MB | 19.74 MB | **0.98 MB** |
| hf-catch | 2560 | 33.45 MB | 16.72 MB | 11.82 MB | 28.84 MB | **1.90 MB** |
| hf-store | 810×1440 phone | 4.51 MB | 2.26 MB | 1.41 MB | 4.46 MB | **0.38 MB** |
| hf-store | 1920 | 11.71 MB | 5.85 MB | 3.79 MB | 9.46 MB | **0.81 MB** |
| hf-store | 2560 | 16.34 MB | 8.17 MB | 5.28 MB | 13.61 MB | **1.60 MB** |
| hf-sail | 810×1440 phone | 4.40 MB | 2.20 MB | 1.46 MB | 3.86 MB | **0.44 MB** |
| hf-sail | 1920 | 4.81 MB | 2.41 MB | 1.53 MB | 3.82 MB | **0.90 MB** |
| hf-sail | 2560 | 7.29 MB | 3.65 MB | 2.38 MB | 6.07 MB | **1.75 MB** |

An image sequence carries no motion compensation: every frame is a fresh still. Against AV1 with a 6-frame GOP that is
5× the bytes on the kindest shot in the film and 24× on the busiest, and the brief's own quality floor (AVIF q ≥ 60 /
WebP q ≥ 70) is what makes it so.

## Per clip, at the most favourable honest setting

12 fps at the 1920 tier, AVIF q 60 — half the master's frame rate, the tier most desktops are served.

| Clip | Frames (12 fps) | Sequence, AVIF q60 | Sequence, WebP q78 | The clip as AV1 | Times the video |
| --- | --- | --- | --- | --- | --- |
| opening | 30 | 3.21 MB | 2.89 MB | 0.67 MB | 4.8× |
| hf-depart | 36 | 8.94 MB | 7.13 MB | 1.00 MB | 9.0× |
| hf-catch | 36 | 12.03 MB | 9.98 MB | 0.98 MB | 12.3× |
| hf-ice | 36 | 16.24 MB | 12.88 MB | 1.00 MB | 16.3× |
| hf-return | 36 | 10.27 MB | 8.47 MB | 1.03 MB | 10.0× |
| hf-arrive | 36 | 11.55 MB | 9.44 MB | 0.83 MB | 13.9× |
| hf-reverse | 36 | 13.60 MB | 11.22 MB | 0.81 MB | 16.9× |
| hf-unload-fish | 36 | 4.57 MB | 3.98 MB | 0.97 MB | 4.7× |
| hf-fish-intake | 36 | 10.07 MB | 8.42 MB | 1.03 MB | 9.8× |
| hf-fish-wash | 36 | 11.39 MB | 9.55 MB | 1.03 MB | 11.1× |
| hf-fish-cut | 36 | 7.51 MB | 6.40 MB | 1.02 MB | 7.3× |
| hf-fish-freeze | 36 | 7.54 MB | 6.55 MB | 0.99 MB | 7.7× |
| hf-store | 36 | 5.94 MB | 4.80 MB | 0.81 MB | 7.3× |
| hf-stuff | 36 | 7.40 MB | 6.03 MB | 0.78 MB | 9.5× |
| hf-cranes | 36 | 9.02 MB | 7.53 MB | 0.79 MB | 11.4× |
| hf-ship | 36 | 16.68 MB | 13.76 MB | 0.79 MB | 21.0× |
| hf-sail | 40 | 2.40 MB | 1.90 MB | 0.90 MB | 2.7× |
| hf-ponds | 36 | 13.33 MB | 10.09 MB | 0.73 MB | 18.3× |
| hf-sample | 36 | 13.44 MB | 11.19 MB | 0.69 MB | 19.4× |
| hf-harvest | 36 | 17.25 MB | 14.55 MB | 0.83 MB | 20.8× |
| hf-sort | 36 | 17.71 MB | 14.82 MB | 0.71 MB | 25.0× |
| hf-unload-shrimp | 36 | 3.59 MB | 3.22 MB | 0.79 MB | 4.6× |
| hf-intake | 36 | 5.65 MB | 4.68 MB | 0.80 MB | 7.0× |
| hf-wash | 36 | 9.72 MB | 7.95 MB | 0.79 MB | 12.2× |
| hf-peel | 36 | 2.34 MB | 2.23 MB | 0.78 MB | 3.0× |
| hf-lab | 36 | 2.86 MB | 2.62 MB | 0.80 MB | 3.6× |
| hf-iqf | 36 | 11.22 MB | 9.38 MB | 0.84 MB | 13.3× |
| hf-pack | 36 | 2.34 MB | 2.31 MB | 0.78 MB | 3.0× |
| hero-loop (homepage) | 72 | 7.91 MB | 7.07 MB | 0.97 MB | 8.2× |

## The decision

- **`/story` chapters stay video.** The active path is 17 clips (wild catch) or 19 (farmed shrimp). At 12 fps and 1920
  the sequences come to 158.4 MB and 169.3 MB against 15.42 MB and 14.93 MB as AV1 (10.3× and 11.3×). The desktop budget for a whole
  path is 25 MB at 1920 and 40 MB at 2560: no frame rate inside the quality floor fits, and thinning the density far
  enough to fit (about 3 fps) would be visibly worse than the video it replaced, not better.
- **The homepage hero is a canvas sequence** (#249, kept and rebuilt on this engine). It is one 6-second shot scrubbed
  over 300 vh, where a `<video>` has to seek on every frame; the sequence draws a decoded bitmap instead, and at 60
  frames it fits the homepage's 8 MB budget. This is the one place where the sequence is both affordable and smoother.
- **The engine is still the right thing to own.** `src/film/sequence.ts` is what makes the hero smooth and what any
  future shot-as-sequence would use: a worker that fetches each frame once and decodes on demand, a capped bitmap LRU,
  coarse-first loading, and drawing on the page's single rAF.
- **What Terminal's loading pattern gives `/story` instead** is in the rest of this issue: no blocking loader, the whole
  active path fetched coarse-first in the background after the first screen, and a scroll that touches the network not
  at all (`tests/terminal-mode.spec.ts`).

Terminal can afford 410 frames because its scroll is one continuous camera move at 59 KB a frame. This film is twenty
separate photoreal shots; the same technique on it costs an order of magnitude more bytes for a worse picture.
