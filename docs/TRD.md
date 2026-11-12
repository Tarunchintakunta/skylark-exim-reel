# TRD.md: technical requirements

## 1. Architecture
Single-page app, statically built, served from Vercel's CDN, plus one serverless function for the RFQ.
Three engines share **one clock** (`gsap.ticker`):
1. **Scroll engine**: Lenis (smooth wheel on desktop, native on touch) → `ScrollTrigger.update` → one master timeline per chapter. No React state changes per frame.
2. **Video engine**: one `<ScrubStage>` with 2 `<video>` elements (current, next) + poster `<img>`; reads chapter progress from a mutable store, seeks via rAF + `requestVideoFrameCallback`.
3. **3D engine**: one R3F `<Canvas>` mounted lazily for the globe and Products, `frameloop="demand"` unless its section is active; `invalidate()` driven from the ticker.
Overlay layer: DOM copy, HUD, nav, CTA (transform/opacity animations only).

## 2. Stack (majors verified on npm 2026-10-09; install latest within major)
| Package | Version |
|---|---|
| vite | 8.x |
| react / react-dom | 19.x |
| typescript | the version `create-vite` pins (5.9+/7.x) |
| three | 0.186.x |
| @react-three/fiber | 9.x |
| @react-three/drei | 10.x |
| gsap (incl. ScrollTrigger, SplitText; all plugins free) + @gsap/react | 3.15.x / 2.x |
| lenis | 1.3.x |
| react-hook-form + zod + @hookform/resolvers | 7.x / 4.x / latest |
| zustand (vanilla store, read via refs) | 5.x |
| resend (server only, optional) | 6.x |
| @playwright/test | 1.64.x |
| @lhci/cli | 0.15.x |
| @gltf-transform/cli (via npx in scripts) | 4.x |

Fonts self-hosted WOFF2, subset Latin: **Sora** (display 500/600), **Inter** (body 400/500), **JetBrains Mono** (HUD/eyebrows 400). Preload only Sora 600 + Inter 400.

## 3. Folder structure
```
skylark-exim-v3/
  docs/                      # this pack (PRD, TRD, STORY, CONTENT, …) + docs/renders/ (Blender review stills, port-preview.mp4)
  api/rfq.ts                 # Vercel function
  assets-src/                # git-ignored masters: video/, anchors/, models/ (raw GLB exports), blender/ (port.blend), render/ (PNG frames)
  public/ media/ models/ textures/ docs/ og/ fonts/ robots.txt sitemap.xml favicon.svg
  scripts/                   # fetch-sources, encode-clips, make-posters, optimize-glb
  src/
    main.tsx  App.tsx
    config/ chapters.ts  hud.ts  markets.ts  products.ts  content.ts   # all copy + timings as data
    engine/ ticker.ts (gsap.ticker + Lenis) scrollStore.ts (vanilla zustand) preload.ts (byte-progress loader) path.ts (ocean|pond)
    film/ ScrubStage.tsx useScrubVideo.ts Chapter.tsx ChapterCopy.tsx Crossfade.ts
    three/ CanvasRoot.tsx Globe.tsx Routes.tsx ProductModel.tsx Lights.tsx
    ui/ Loader.tsx StartScreen.tsx PathPill.tsx Hud.tsx Rail.tsx TopNav.tsx QuoteCta.tsx Cursor.tsx Grain.tsx SoundToggle.tsx
    sections/ Products.tsx Trust.tsx About.tsx Quote.tsx Footer.tsx
    styles/ tokens.css global.css
    a11y/ useReducedMotion.ts SkipLinks.tsx
  tests/ smoke.spec.ts scroll-perf.spec.ts a11y.spec.ts weight.spec.ts
  lighthouserc.json  vercel.json  .github/workflows/ci.yml  .github/pull_request_template.md
```

## 4. Chapter config (data, not components)
```ts
type Source = { kind: 'video'; ids: string[] } | { kind: 'globe' } | { kind: 'dom'; poster?: string };
interface ChapterDef {
  id: string; path: 'ocean' | 'pond' | 'shared';
  vh: number;                       // desktop scroll length; mobile = vh * 0.8
  source: Source;
  captions: { at: [number, number]; eyebrow?: string; title: string; body?: string; chips?: string[] }[];
  hud: { at: number; step: string; state: string; temp?: string }[];
  alt: string;                      // describes the poster for reduced-motion/screen readers
  joinNext: 'shared-frame' | 'crossfade' | 'cut';
}
```
`chapters.ts` exports `OCEAN = [start, o1, o2, o3, o4, ...SHARED]`, `POND = [start, p1, p2, p3, ...SHARED]`. The page renders the active list; switching path rebuilds ScrollTriggers once (`ScrollTrigger.refresh()` inside a `requestIdleCallback`), never per frame.

## 5. Scroll engine
- `const lenis = new Lenis({ autoRaf: false, lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false })`; `gsap.ticker.add(t => lenis.raf(t * 1000))`; `gsap.ticker.lagSmoothing(0)`; `lenis.on('scroll', ScrollTrigger.update)`.
- Touch devices (`(pointer: coarse)`): Lenis smoothing off (native scroll), ScrollTrigger `normalizeScroll(false)`, `ignoreMobileResize: true`.
- Each film chapter: `ScrollTrigger.create({ trigger, start: 'top top', end: '+=' + vh + '%', pin: stage, scrub: true, onUpdate: s => store.progress[ch] = s.progress })`. The pinned stage is a single fixed layer; chapters are spacer divs.
- Loader: `lenis.stop()` + `document.documentElement.classList.add('is-locked')` until ready.

## 6. Video engine (ScrubStage)
- Sources: `<source src="/media/<id>_1280.av1.webm" type='video/webm; codecs="av01.0.05M.08"'>` only if that file exists, then `/media/<id>_1280.mp4`. Mobile (`max-width: 820px` or `saveData`): `_720.mp4`.
- Attributes: `muted playsInline preload="auto" disablePictureInPicture` and `tabIndex={-1} aria-hidden` (the poster img carries alt).
- Per tick: `target = progress * (duration - 1/24)`. If `!video.seeking && Math.abs(target - video.currentTime) > 1/48` → `video.currentTime = target`; else remember `pending = target` and apply on `seeked`. Use `video.requestVideoFrameCallback` to flip the poster off only after the first real frame paints.
- Prefetch: when chapter progress > 0.5, set the next chapter's src on the idle element (`preload=auto`). Never more than 2 elements with a src. On leaving, `removeAttribute('src'); load()` the old one to free decoder memory.
- Joins: `shared-frame` = instant swap at the boundary; `crossfade` = opacity over the last 3% of scroll; `cut` = 250 ms fade through the page background.
- Safari: call `video.load()` once after setting src; seeking works on the faststart MP4. If iOS Low Power Mode blocks decoding, fall back to posters (detect via `video.readyState < 2` after 1.5 s).

## 7. 3D engine
- One `<Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: 'high-performance', alpha: true }} frameloop="demand">`, mounted when the globe chapter is ≤ 1 viewport away; unmounted (or paused) when ≥ 2 viewports away. Products uses a second, smaller canvas only while visible (IntersectionObserver), or drei `<View>` tracking on the same canvas.
- `useGLTF.preload` one section ahead; `<Suspense fallback={<DomCard/>}>`; meshopt decoder via drei defaults; KTX2 only if used.
- Globe camera, rotation and route draw-range are read from the scroll store inside `useFrame`, then `invalidate()` from the ticker while the section is active.
- Mobile: dpr 1, globe texture 2048, routes as 1 px lines, product models no shadows, no orbit drag (rotate with scroll only).
- Lighting: `<Environment preset="city" />` or a 1k Poly Haven daylight HDRI; tone mapping ACES, exposure 1.1 for the bright globe.

## 8. Asset pipeline
See ASSETS_SPEC.md (scripts, budgets, measured results) and BLENDER_GLB_SPEC.md. Clip sources: REUSE (skylark repo), 5 Higgsfield clips from Tarun, and 2 Blender renders (`x-cranes`, `x-ship`) that Claude builds, renders headless (`Blender -b assets-src/blender/port.blend -a`) and turns into 1080p masters in `assets-src/video/`; all clips then go through the same encode. All GLBs are built by Claude in Blender via its connector. `npm run assets` = `fetch-sources.sh && encode-clips.sh && make-posters.sh && optimize-glb.sh`. A `weight.spec.ts` test fails the build if any file in `public/media` or `public/models` exceeds its budget.

## 9. Performance budgets (acceptance)
| Metric | Limit |
|---|---|
| Long tasks during a scripted full scroll, desktop (no throttle) | 0 tasks > 50 ms (after the loader) |
| Frame rate desktop | ≥ 58 fps avg, p95 frame ≤ 20 ms |
| Frame rate mobile emulation (4× CPU throttle, 412×915) | ≥ 50 fps avg |
| Lighthouse mobile performance | ≥ 85 |
| LCP / CLS / TBT (mobile) | < 2.5 s / < 0.05 / < 200 ms |
| Initial transfer | ≤ 3 MB (target 1.5) |
| Full scroll transfer | ≤ 25 MB desktop, ≤ 12 MB mobile |
| JS (gzip) initial route | ≤ 250 KB; three/R3F in a lazy chunk |

Rules: animate `transform`/`opacity` only; no layout reads inside the ticker; no `filter: blur()` animations; one grain overlay as a static tiled PNG/WebP with `mix-blend-mode` (not a per-frame canvas); `will-change` only on the pinned stage and the active caption.

## 10. Accessibility
`prefers-reduced-motion: reduce` → no Lenis, no scrubbing (poster stills at full size), no SplitText, no parallax, globe static with all routes drawn. Keyboard: skip link to main and to #quote; Tab order nav → path buttons → rail → content → CTA; ←/→ switch path on the start screen; PageDown/Space advance a chapter. Every poster has alt text from config. Contrast ≥ 4.5:1 for body text over video (use the bottom gradient scrim). Focus rings visible (brass). `aria-live="polite"` on the HUD step only (not per frame). Sound toggle off by default.

## 11. SEO
`<title>Skylark Exim | Seafood Exporter, Visakhapatnam | Shrimp & Marine Fish</title>`, meta description from the company paragraph, canonical `https://skylarkexim.com/`, OG/Twitter image 1200×630 (made from the x-ship or a3 poster plus wordmark), `schema.org` JSON-LD `Organization` (name, url, logo, email, telephone ×2, address: Sheela Nagar, Visakhapatnam, Andhra Pradesh, IN; `department` with the Anandapuram processing unit address) and `makesOffer`/`Product` list only by name. `robots.txt`, `sitemap.xml` (single URL + `/#products`, `/#quote` not needed). All copy is real HTML in the DOM (not canvas) so it's indexable; `<h1>` on the start screen, one `<h2>` per chapter/section.

## 12. RFQ backend
- Client: react-hook-form + zod schema (name, company, country, email required; phone optional; category, species[], form[], state[], quantity, destination, message ≤ 2,000 chars; honeypot field).
- `api/rfq.ts` (Vercel Node function): validate with the same zod schema, rate-limit by IP (simple in-memory token bucket per instance), send via Resend **if** `RESEND_API_KEY` is set (`RFQ_TO` default `info@skylarkexim.com`, `RFQ_FROM` e.g. `quotes@skylarkexim.com` after the domain is verified in Resend). If not set, respond `{ ok: false, fallback: 'mailto' }` and the client opens a pre-filled `mailto:info@skylarkexim.com` with the form summary.
- No secrets in the repo. Document env vars in README and `.env.example`.

## 13. Testing
- `tests/smoke.spec.ts`: loads, loader completes, both path buttons work, every nav link lands, RFQ validation errors show, mailto fallback triggers.
- `tests/scroll-perf.spec.ts`: Chromium, 1440×900, scripted wheel scroll through the whole page at ~1,200 px/s for both paths; collects `PerformanceObserver('longtask')`, `long-animation-frame`, rAF frame times; writes `perf-report.json`. Second run with CDP `Emulation.setCPUThrottlingRate {rate: 4}` at 412×915.
- `tests/weight.spec.ts`: sums transferred bytes (CDP `Network.loadingFinished`) for initial load and full scroll, per path, desktop and mobile; fails over budget.
- `tests/a11y.spec.ts`: axe-core on the start screen, Products and Quote; reduced-motion run.
- Lighthouse CI (`lighthouserc.json`): mobile preset, 3 runs, assertions perf ≥ 0.85, a11y ≥ 0.95, LCP < 2500, CLS < 0.05.

## 14. CI
`.github/workflows/ci.yml` on pull_request: `npm ci` → typecheck → build → `npx playwright install --with-deps chromium` → smoke + weight tests against `vite preview` → Lighthouse CI against the preview server. Scroll-perf runs too but GitHub runners lack a GPU, so it reports without failing; real numbers come from Claude's local run and are pasted into the PR.

## 15. Deployment
- Vercel project linked to `Tarunchintakunta/skylark-exim-v3`; framework preset Vite; output `dist`; Node 20+.
- Every PR → preview URL. `main` → production **only after Tarun approves** the preview.
- `vercel.json`: immutable caching for `/media/(.*)`, `/models/(.*)`, `/textures/(.*)`, `/assets/(.*)`, `/fonts/(.*)`; security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`); `cleanUrls`.
- Custom domain (Tarun does this later; see CLAUDE_PROMPT.md §11).
