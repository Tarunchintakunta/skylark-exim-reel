# Reference-site audit: what makes them smooth (Oct 9 2026)

Method: headless Chrome for Testing 153 driven by Playwright 1.59 on the box. Viewport 1440x900 at dpr 1, cache disabled. After `load` + networkidle + 4 s, the page scrolls with mouse wheel 200 px every 120 ms (150 px on mobile). Requests were captured through CDP Network events (encoded/transfer + decoded bytes, mime, start/end). Long tasks came from PerformanceObserver `longtask` + `long-animation-frame`, and FPS from a rAF loop during the scroll. Bundles were saved and grepped. GLBs and videos were downloaded and inspected (GLB JSON chunk, KTX2 header, ffprobe on the first 100 frames). Mobile pass: iPhone 13 emulation (390x844, dpr 3) for Mont-Fort and Blackbird.

Raw data: `/workspace/refs/audit/<site>.json` (and `<site>-mobile.json`). Screenshots: `<site>-<mode>-{0top,1third,2twothirds,3bottom}.png`. Bundles: `audit/bodies/`. Downloaded models and videos: `/workspace/refs/dl/`.

## IMPORTANT measurement caveat (FPS / long tasks)
The box has **no GPU**, so WebGL runs on SwiftShader (CPU), 8 vCPU. A control run showed a blank scrolling page at ~48 fps, a full-screen WebGL clear at ~38 fps, and one 2D drawImage of a 1080p bitmap per frame at ~26 fps. So **absolute FPS numbers below are NOT what a real laptop or phone sees**. Every WebGL-heavy site measures 2–5 fps here. Read them only as a relative CPU-cost stress test. Main-thread long tasks are more meaningful because they're CPU work: decode, parse, JS. I did not run Lighthouse or a full DevTools trace.

Other caveats:
- PF Energy's server sends an incomplete TLS chain (Let's Encrypt YR1 intermediate missing; `openssl verify` code 21). It needed `ignoreHTTPSErrors`, which is why curl failed earlier.
- Blackbird has a 21+ age gate. I clicked "I am 21 or older". After that a "5% off" newsletter modal covers its screenshots, but the content behind it scrolled and loaded normally.
- Zoi uses Lenis `infinite: true`, so the scroll wraps back to the top. All of its assets were loaded before scrolling began anyway.

## Comparison table (desktop 1440x900 unless noted)

| Site | Stack | Scroll | 3D | Heavy media | Initial MB | After full scroll MB | Requests | Long tasks during scroll (count / total / max) | rAF fps on box* |
|---|---|---|---|---|---|---|---|---|---|
| **Blackbird** blackbirdrd.com | Next.js (Turbopack, RSC), vanilla Three r185 | Lenis (duration 1.2, expo ease) + GSAP 3.14.2 ScrollTrigger | 3 GLBs, **meshopt + quantized, no textures**: 261 / 91 / 47 KB (58k / 26k / 13k tris) | one 960x540 H.264 loop, 370 KB @ 311 kbps, poster JPG 17 KB | 1.68 | **2.43** | 122 | 0 / 0 / 0 | 22.8 |
| **Blackbird mobile** (iPhone 13) | same | same | same GLBs, canvas at dpr 2 (capped from 3) | same | 1.62 | **2.0** | 57 | 22 / 3064 ms / 170 ms | 28.5 |
| **PF Energy** pfenergy.eu | WordPress 7.0.2 + Bricks builder + Bricksforge plugin, WooCommerce, jQuery | Lenis (Bricksforge) + GSAP ScrollTrigger + DrawSVG (+TextPlugin 3.12.2) | **Spline runtime 2.0.75**, one 712 KB `.splinecode` scene + Draco wasm, one full-screen WebGL2 canvas | none (5 AVIF images ~35 KB) | 2.30 | **2.39** | 144 | 0 / 0 / 0 (but LCP 10.8 s, CLS 0.19) | 3.3 |
| **Mokn** mokn.io | Webflow + jQuery, GSAP 3.15 (ScrollTrigger, SplitText, MotionPath, TextPlugin; ScrollSmoother loaded, no evidence it's used) | **native** | none (Lottie JSON + Lottielab MP4) | 135-frame WebP sequence (6.2 MB, desktop only) scrubbed on 2D canvas; 1920x1080 intro MP4 4.9 MB; 6 short slider MP4s (1280x610, ~380 KB, played not scrubbed) | 13.22 | 14.18 | 239 | 0 / 0 / 0 | 25.0 |
| **Mont-Fort** mont-fort.com | **Astro 5.18.2** + ClientRouter (view transitions), Three.js, Basis/KTX2 | Lenis (bundled) + GSAP ScrollTrigger + SplitText | 6 GLBs = 10.8 MB: earth 6.86 MB (2-tri plane + **4096x2048 KTX2 UASTC+zstd**), Sustainability 2.23 MB (2048² KTX2), mountains 1.5 MB (66k tris, GPU instancing), 3 tiny (13–130 KB); EXR env map 112 KB | no video; 9+10 small WebP; sound.mp3 243 KB | 12.9 | 13.06 | 75 | 7 / 4319 ms / 913 ms | 2.5 |
| **Mont-Fort mobile** | same | same | same GLBs (not reduced for mobile), dpr capped at 2 | | 3.54 (rest streams in later) | 12.97 | 68 | 1 / 662 ms | 2.8 |
| **FacilPay** facilpay.io | Webflow + jQuery, GSAP 3.12.5 **and** 3.15 both loaded, Three r158 from CDN (+ OrbitControls r133) | Lenis (custom-embed .txt) + ScrollTrigger + Inertia | Three.js particle globe on a canvas; **Rive** (WebGL2 wasm 744 KB + .riv 389 KB); Lottie (8 JSON, 0.94 MB) | **138 PNGs = 15.9 MB** (loader-bg.png 2.1 MB, wallet-bg 1.3 MB...) | 14.58 | 19.06 | 171 | 2 / 3162 ms / 1708 ms; CLS 1.96 | 2.8 |
| **Zoi** drinkzoi.co | WordPress (custom theme, webpack), Three r175 | Lenis (`duration 1.2, infinite: true`) + GSAP 3.12.5 ScrollTrigger (+SplitText) | **5 GLBs × 4.86 MB = 24.3 MB, UNCOMPRESSED** (no Draco/meshopt; ~43k tris + 220 KB PNG each) | **192-frame 1920x1080 WebP sequence = 17.9 MB** (all preloaded, drawn with drawImage to a 2D canvas); 1000x562 thumb MP4 469 KB | **48.13** (everything preloaded) | 48.13 | 266 | 30 / 4228 ms / 528 ms | 4.7 |

\*FPS is software-rendered; see the caveat. The useful signal is long tasks plus MB.

## Per-site details

### 1. Blackbird (lightest and cleanest; the best engineering model)
- **Stack:** Next.js App Router (Turbopack chunks, `_rsc` prefetches of 8 routes), Lenis (`new Lenis({duration:1.2, easing: 1.001-2^-10t, smoothWheel:true, touchMultiplier:2})`), GSAP 3.14.2 + ScrollTrigger. Vanilla three r185 (no R3F/drei in the bundle), MeshoptDecoder, `renderer.setPixelRatio(Math.min(devicePixelRatio,2))`, ACES tone mapping, IntersectionObserver used 19× (render only what's on screen), `invalidate` present.
- **Media:** 3 product GLBs with `EXT_meshopt_compression` + `KHR_mesh_quantization`, no textures (colour via materials), 400 KB total. One autoplay muted loop video 960x540 H.264 High, **311 kbps**, 370 KB, `preload=auto`, poster JPG 17 KB. Its GOP is longer than 100 frames (1 keyframe in the first 100), so it's a loop, not scrubbed. Images go through `next/image` → WebP with srcset + lazy + `decoding=async`. 3 fonts, self-hosted woff2 with preload.
- **Scroll → visuals:** Lenis + ScrollTrigger drive the 3D product canvases (an exploded "assembly" canvas, `asm-canvas`) and CSS transforms. No pinned spacers found (no `.pin-spacer`).
- **Copy this:** tiny meshopt GLBs with no textures, a dpr cap of 2, a low-bitrate small video with poster, nothing heavy before first paint, images via a responsive pipeline.

### 2. PF Energy (one Spline scene does the whole story)
- **Stack:** WordPress 7.0.2 + Bricks + Bricksforge (bundles GSAP, ScrollTrigger, DrawSVG, Lenis), WooCommerce. Spline runtime 2.0.75 from unpkg (includes a WebGPU chunk). 14 ScrollTriggers, scrub: 1 on most (not pinned via pin-spacer).
- **Media:** a single 712 KB `.splinecode` scene + Draco decoder 87 KB on **one full-screen WebGL2 canvas** (`antialias:false, depth:false, powerPreference:high-performance`). The product can opens, pouches fly and the scene changes, all from one scene whose state is scrubbed by scroll. AVIF images (WordPress serves .png URLs as AVIF).
- **Weak points:** ~91 JS files (WooCommerce, jQuery, a chatbot), LCP 10.8 s, CLS 0.19, plus the TLS chain issue.
- **Copy this:** *one* persistent canvas behind the page and *one* scene whose timeline is scrubbed. Keep the scene under 1 MB.

### 3. Mokn (no 3D, smooth through restraint)
- **Stack:** Webflow, GSAP 3.15 (ScrollTrigger, SplitText, MotionPath, TextPlugin) and **native scroll**. 29 ScrollTriggers, scrub true / 0.8 / 1, no pinning. Finsweet attributes. Lots of trackers (Meta, LinkedIn, HubSpot, GA).
- **Media:** the hero is a 1920x1080 H.264 intro MP4 (4.9 MB, 3 Mbps, GOP 25) that autoplays once, then a 3.96 s loop (1.4 MB). The "carbon" background is a **135-frame WebP sequence** (48 KB each, 6.2 MB) drawn with `ctx.drawImage` in a GSAP `onUpdate` driven by a ScrollTrigger scrub. It's **skipped under 768 px** (mobile shows a placeholder). The slider uses 6 short MP4s (1280x610 60 fps Baseline, ~380 KB each, `preload=metadata`) restarted with `currentTime=0; play()`, not scrubbed. Lottielab animations ship as MP4 (900x720, 448 kbps) and JSON.
- **Copy this:** turn scrubbed sequences off on mobile, use `preload=metadata` for off-screen videos, run text reveals with SplitText, and keep the main thread free (0 long tasks).

### 4. Mont-Fort (closest to the Skylark concept: chapters, an aerial ship shot, a bright globe with city markers)
- **Stack:** Astro 5.18.2 static, Astro ClientRouter view transitions (`startViewTransition`, `astro:after-swap`), Lenis (bundled, lerp 0.1 defaults), GSAP ScrollTrigger + SplitText, Three.js with KTX2Loader + Basis transcoder wasm (253 KB) + EXR env map. Resize handler with `dpr = Math.min(2, devicePixelRatio)`, `powerPreference:'high-performance'`, `antialias:false`. Chapter navigation component.
- **Media:** the "3D" is mostly **baked art on simple geometry**. `earth-min.glb` is a 2-triangle mesh carrying a 4096x2048 KTX2 (UASTC + zstd, 13 mip levels), and `Sustainability-min.glb` is 9 tris + a 2048² KTX2. `mountains.glb` is real geometry (66k tris, `EXT_mesh_gpu_instancing`, no textures). Ground textures are small WebPs (rock diffuse/normal, perlin noise, lightmap). The ship/sea chapters are images (`_astro/*.webp`, `<picture>` + srcset + lazy + `decoding=async` on all 17 images). No video at all.
- **Loading order (measured):** hero mountains + env map at 1.6 s → Homepage/TopChapters/WhatWeDo GLBs at 3–4 s → **earth 6.9 MB only at 7.4 s, Sustainability at 9.7 s** (streams in behind the hero). Mobile initial was only 3.5 MB with the rest streaming later. The models are the same on mobile (not downsized).
- **Weak points:** the 6.9 MB earth texture is the single biggest asset of any site here (on a phone it's still 6.9 MB). 7 long tasks, max 913 ms on the box, mostly KTX2 transcode + GLB parse.
- **Copy this:** staged loading (hero first, later chapters lazy-loaded); GPU-compressed KTX2 textures; baked lighting/lightmaps instead of real-time lights; one WebGL canvas fixed behind the HTML; a dpr cap of 2; view-transition page changes.

### 5. FacilPay (looks smooth on a strong GPU, but its assets are wasteful)
- **Stack:** Webflow + jQuery. GSAP is loaded **twice** (cdnjs 3.12.5 and Webflow 3.15) along with ScrollTrigger and Inertia. Three r158 from jsDelivr + OrbitControls from r133 (version mismatch). Lenis pasted in as a `.txt` embed. Rive WebGL2 runtime 2.35 (wasm 744 KB) for one `.riv` (389 KB, "dynamic island"). Lottie with a lazy loader (8 JSON = 0.94 MB). Particle "globe-canvas" (1008x1008).
- **Media:** **138 PNG images = 15.9 MB** (a 2.1 MB loader background, a 1.3 MB wallet background, phone mockups 0.5–0.8 MB each). 151 of 156 imgs are `loading=lazy`, yet 11.4 MB still loads before scrolling. CLS measured **1.96** (loader/layout shifts). One long task of 1.7 s on the box.
- **Copy:** the Rive/Lottie idea for small UI micro-animations. **Don't copy** the PNG mockups, the duplicate GSAP or the CDN-mixed Three versions.

### 6. Zoi (the "Blender GLB" look, but the heaviest by far)
- **Stack:** WordPress custom theme (webpack bundle, 1.1 MB decoded), Three r175 (GLTFLoader with Draco/KTX2/Meshopt support compiled in, though **none is used by the models**), GSAP 3.12.5 + ScrollTrigger (+SplitText), Lenis `{duration:1.2, smoothWheel:true, infinite:true, syncTouch:true}`. ImageBitmapLoader (createImageBitmap) for textures. Canvases: one WebGL2 `world-canvas` (antialias false, stencil false) and one 2D `frame-canvas`.
- **Media:** 5 flavour cans, each `.glb` is **4.86 MB uncompressed** (extensions only `KHR_materials_volume`, `FB_ngon_encoding`; 43k tris, a 220 KB PNG texture). **I tested it:** `gltf-transform optimize mango.glb --compress meshopt --texture-compress webp --simplify false` → **303 KB (16× smaller), with no visual simplification**. With default simplify it's 186 KB (meshopt) or 143 KB (Draco). On top of that there's a **192-frame 1920x1080 WebP sequence (~200 KB/frame, 17.9 MB)**, mobile 200 frames at 1080x1480, all `loadAsync`'d up front with `Promise.all` and drawn `cover` to a full-viewport 2D canvas on scrub.
- **Numbers:** 48 MB before the user scrolls at all, 30 long tasks totalling 4.2 s (frame decode + GLB parse), LCP 5.7 s.
- **Takeaway:** the *look* (glass/ice material, the can turning on scroll) is what Tarun likes. The *delivery* is exactly what to avoid, because it's the same problem as the current Skylark site (thousands of frames).

## Ranking: smoothest and why
Ranked on main-thread work during scroll, bytes, and architecture, since absolute FPS can't be measured on this GPU-less box:
1. **Blackbird**: 2.4 MB total, 0 long tasks on desktop, every 3D asset meshopt-compressed and under 300 KB, dpr ≤ 2, small poster+video. It'll be 60 fps on almost any device.
2. **Mokn**: 0 long tasks, native scroll, but 14 MB (the 4.9 MB hero MP4 and the 6 MB WebP sequence). Its smart move is disabling the sequence on mobile.
3. **PF Energy**: 2.4 MB, 0 long tasks, one Spline canvas. But its GPU cost is a full-screen live scene, and the 10.8 s LCP / bloated WP plugins make it feel slow to start.
4. **Mont-Fort**: the richest cinematic experience (and closest to Skylark) at 13 MB with staged loading. KTX2 keeps GPU memory and upload stutter low once loaded, but there's a 6.9 MB texture and the transcode long tasks.
5. **FacilPay**: 19 MB of mostly PNG, duplicate libraries, CLS 1.96, 1.7 s long task.
6. **Zoi**: 48 MB preloaded, uncompressed GLBs, a 1080p image sequence, 30 long tasks. It feels smooth only *after* the loader on a fast machine/network.

**Why the smooth ones are smooth:** (a) one scroll engine (Lenis on GSAP's ticker, or native) and one rAF; (b) few, tiny, compressed GPU assets (meshopt GLB, KTX2); (c) no per-frame image decoding on scroll (Blackbird, Mont-Fort and PF have none; Mokn's is small at 48 KB per frame and desktop-only); (d) a dpr cap of 2 and antialias off; (e) heavy assets loaded after the hero, not before.

## Recipe to copy for Skylark (GSAP + ScrollTrigger + Lenis + Three/R3F + scrubbed Higgsfield video)

**Architecture**
1. Use Vite + React (or Astro with one React island) and deploy on Vercel. Put **one** fixed full-screen `<canvas>` (R3F) behind the HTML chapters, plus **one** `<video>`/canvas layer for clips. Don't create a new WebGL context per section.
2. Use one clock: `lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t*1000)); gsap.ticker.lagSmoothing(0)`. R3F uses `frameloop="demand"` and calls `invalidate()` from the ScrollTrigger `onUpdate`. No other rAF loops. Lenis settings: `duration: 1.2` or `lerp: 0.1`, `smoothWheel: true`, native touch on mobile (`syncTouch` off).
3. Never put scroll progress in React state. Write to refs / GSAP timelines, and only `setState` on chapter change.
4. Use ScrollTrigger `scrub: true` (or 0.5–1 for inertia) with a pinned chapter per clip. Animate only `transform`/`opacity`, with `will-change` only on elements that animate. Use SplitText for headings.

**Asset budgets (whole site)**
- First paint ≤ 1.5 MB (HTML/CSS/JS ≤ 350 KB gz, hero poster ≤ 150 KB, 2 fonts ≤ 80 KB woff2 preloaded).
- Total after a full scroll: **≤ 20 MB desktop, ≤ 10 MB mobile** (Blackbird 2.4, Mokn 14, Mont-Fort 13 for reference).
- **GLB:** ≤ 500 KB each, ≤ 1.5 MB total. Run `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` (or `--texture-compress ktx2`/`etc1s` for big textures). Add `--simplify false` if the silhouette matters. Bake lighting in Blender into the base colour/lightmap. Use 1k textures (2k max), ≤ 50k tris per hero model. Verify with `gltf-transform inspect`: the extensions must list `EXT_meshopt_compression` (+ `KHR_mesh_quantization`). Zoi's 4.86 MB can → 303 KB proves the point.
- **Globe:** follow Mont-Fort but lighter. Use a sphere generated in code + a **2048x1024 KTX2 (ETC1S) day texture ≈ 0.5–1 MB** (4096x2048 desktop-only, lazy). Draw route arcs as lines/tubes in code, markers as instanced sprites, and use a bright daytime look (ACES tone mapping, exposure ~1.1–1.15 like Blackbird). Load it only when the chapter before the globe starts.
- **Scrubbed video (Higgsfield clips):** H.264 MP4 (universal) with optional VP9/AV1 WebM, `-an`, `+faststart`, **no B-frames, short GOP**. Measured on an 8 s 1280x720 clip: all-intra `-g 1` = 2.06 MB, `-g 8 -bf 0` = 0.76 MB, default GOP = 0.52 MB (VP9 `-g 8` = 0.83 MB). Higgsfield ocean footage has more detail than this test clip, so expect roughly 1.5–3× those sizes. Recommended:
  `ffmpeg -i in.mp4 -an -vf "scale=1280:-2,fps=30" -c:v libx264 -preset slow -crf 24 -g 8 -keyint_min 8 -bf 0 -pix_fmt yuv420p -movflags +faststart out-720.mp4`
  Use 1920 wide for desktop only if ≤ 2.5 MB per 8 s clip, and 960 or 720 wide for mobile (Blackbird ships 960x540 at 311 kbps). Use `-g 1` only for clips that get fast back-and-forth scrubbing and that you've confirmed stay small enough.
  Scrub with `video.currentTime = progress * duration` inside the ScrollTrigger `onUpdate`, throttled to one seek in flight (wait for `seeked`). Or draw it to the canvas with `requestVideoFrameCallback` (Zoi's three build uses rVFC for VideoTexture). Every clip gets a **poster** = its first frame as WebP ≤ 120 KB, shown until `canplay`.
- **Image sequences:** don't use them. If one is unavoidable, follow Mokn: ≤ 60 frames, ≤ 50 KB WebP per frame, 1280 wide, desktop only, decoded with `createImageBitmap` off the main thread.
- **Images:** AVIF/WebP via `<picture>`/srcset, `loading=lazy` + `decoding=async` below the fold, `fetchpriority=high` on the hero only (Mont-Fort does all of this). No PNG photos (FacilPay's mistake).

**Loading strategy**
- Load the hero poster + first clip `preload="auto"` and everything else `preload="metadata"`. For each chapter, attach the next clip's `src` when the current one reaches 50%, and unload (`removeAttribute('src'); load()`) clips 2+ chapters behind.
- Stage the 3D the way Mont-Fort does: GLBs and the globe load via dynamic `import()` + `useGLTF.preload` one chapter ahead, never at startup. Don't put a full-page loader that waits on everything in front of the site (Zoi's 48 MB).
- Avoid third-party trackers on the critical path (Mokn and PF both carry many).

**Render loop rules**
- `dpr={[1, 2]}` (cap at 1.5 on mobile), `gl={{antialias:false, powerPreference:'high-performance', stencil:false}}`. Mont-Fort, Blackbird and Zoi all turn antialias off.
- Pause the WebGL render (`frameloop` demand, or stop invalidating) when the canvas chapter is off screen, using IntersectionObserver as Blackbird does.
- No real-time shadows or postprocessing on mobile. Bake them in Blender instead.
- `prefers-reduced-motion`: show posters and skip scrubbing.
- Acceptance gate: **0 long tasks > 50 ms during scroll on desktop**, which Blackbird, Mokn and PF achieved even on this CPU-only box. Total bytes within the budgets above. Test on a real phone over 4G before shipping.
