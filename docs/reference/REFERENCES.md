# REFERENCES.md: what to copy from each reference site

Audit: each site was loaded in headless Chromium on the box (2026-10-09), network recorded, then auto-scrolled. The box has no GPU, so the fps numbers are only useful **relative to each other**; the byte counts are exact. Raw data: `/workspace/refs/audit/*.json` on Tarun's agent box (not in this zip).

| Site | Stack seen | Weight (transferred) | What made it heavy / janky | Copy this | Don't copy this |
|---|---|---|---|---|---|
| **drinkzoi.co** (Zoi) — `zoi-desktop-*.jpg` | WordPress theme + Three.js + GSAP ScrollTrigger + Lenis; 5 product GLBs | **48.1 MB**, all loaded up front; 5 GLBs × **4.9 MB**; 244 images incl. a frame sequence | 30 long tasks (max 528 ms), LCP 5.7 s, every GLB fetched at load | Hero product in 3D floating over huge type; glassy ice material; slow, weighty easing; product reveal as the scroll "payoff" | 4.9 MB GLBs (our cap: 1.5 MB, aim < 0.8), loading everything at start, frame sequences |
| **mokn.io** — `mokn-desktop-0top.jpg` | Webflow + GSAP/ScrollTrigger + Lenis + Lottie + short MP4s | 14.2 MB; intro video 5.0 MB | Smoothest of the measured sites: **0 long tasks during scroll**, CLS 0 | Short silent MP4s for motion instead of frame sequences; one bold centred line; black stage with a single lit object; Lottie-weight motion graphics | Single 5 MB intro video (we cap 1.5 MB per 8 s) |
| **facilpay.io** — `facilpay-desktop-0top.jpg` | Webflow + Three.js (CDN) + GSAP 3.12 + Rive (WASM 0.7 MB) | 19.1 MB; 138 images, several 0.7–2.1 MB PNGs | Long tasks up to 1.7 s, **CLS 1.96** (layout jumps), 3rd-party CDN scripts | Glow-lit product on deep navy, clean centred hero, store badges style CTA clarity | PNG-heavy assets, CLS from late images (always set width/height), mixed three.js versions from CDNs |
| **mont-fort.com** — `montfort-desktop-0top.jpg` | Astro + custom WebGL + chapter nav | (screenshot only) | — | **The top-down ship shot** over deep blue water (our x-ship), chapter navigation with numbered sections, calm light palette, big airy type, light theme that feels premium | — |
| **blackbirdrd.com** | Next.js (Turbopack chunks) + Lenis + background video | (scripts only captured) | — | Full-bleed background video under minimal type; Lenis smoothness | — |
| **pfenergy.eu** | — | not measurable (TLS certificate error on load) | — | — | — |

## The recipe we're using (the best of each)
1. **Mokn's media strategy**: short, small MP4s, not frame sequences. Ours are scroll-scrubbed with GOP 6 so seeking is instant.
2. **Zoi's 3D payoff, at a tenth of the weight**: real GLB products in the Products section, ≤ 1.5 MB each, loaded one section ahead, not at start.
3. **Mont-Fort's calm**: chapter nav, bright top-down sea, light theme for the globe and business sections.
4. **Kohl draft's identity** (`kohl-draft-contact-sheet.jpg`): deep teal/blue-black palette, brass accents, Sora + Inter + JetBrains Mono, bottom-left captions with data chips, right-edge HUD.
5. **Nobody's mistakes**: no 5 MB assets, no everything-at-load, no layout shift, no third-party CDN scripts, one animation clock.

Other images here: `keyframes_sheet.jpg` (first frames of the 13 existing clips: rows a1–a4 / b1–b3 + opening / t1, t2, t2s, t3 / t4), `tarun-feedback-screens.jpg` (the 8 screenshots Tarun annotated: catch, processing PPE, pond vehicles, freezer, port cranes, Mont-Fort ship, truck-into-warehouse, correct backed-in truck).
