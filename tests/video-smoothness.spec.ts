import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type CDPSession, type Page } from '@playwright/test'

/**
 * Real smoothness (redesign §2.9, acceptance §7.4). Run against the deployed preview:
 *   BASE_URL=https://<preview>.vercel.app [VERCEL_BYPASS=<secret>] npx playwright test tests/video-smoothness.spec.ts
 * Cold cache (CDP cache disabled, fresh context), real wheel notches on desktop, CDP touch swipes on mobile.
 * Per chapter: presented video frames/s (requestVideoFrameCallback), seek latency p50/p95, % of scroll time the picture
 * is stale (> 2 frames from the scroll target) or on the poster, long tasks + LoAF, bytes. rAF fps is reported but is not
 * proof of smoothness: rAF stays at 60 while a video is frozen.
 */

const FAST_4G = { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false, net: null, cpu: 1 },
  'desktop-fast4g': { viewport: { width: 1440, height: 900 }, mobile: false, net: FAST_4G, cpu: 1 },
  'android-mid': { viewport: { width: 412, height: 915 }, mobile: true, net: FAST_4G, cpu: 4 },
} as const

const LIMITS = { fps: 20, seekP95Desktop: 50, seekP95Mobile: 100, stalePct: 5, initialDesktop: 3 * 1024 * 1024, initialMobile: 1.5 * 1024 * 1024 }

/** Injected before any page script: rVFC per <video>, seek latency, chapter sampling on every rAF. */
function instrument() {
  type Ch = { scrollMs: number; staleMs: number; frames: number; seeks: number[]; enteredAt: number; video: boolean }
  const w = window as unknown as {
    __m: { run: boolean; chapters: Record<string, Ch>; long: number[]; loaf: number[]; raf: number[]; lastScroll: number }
    __scrub?: { id: string | null; target: number; shown: boolean; chapter: number }
  }
  const m: (typeof w)['__m'] = (w.__m = { run: false, chapters: {}, long: [], loaf: [], raf: [], lastScroll: 0 })
  const presented = new WeakMap<HTMLVideoElement, number>()
  let current = ''
  const ch = () => (m.chapters[current] ??= { scrollMs: 0, staleMs: 0, frames: 0, seeks: [], enteredAt: performance.now(), video: false })

  // seek latency: currentTime set (or fastSeek) → seeked
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!
  const started = new WeakMap<HTMLMediaElement, number>()
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    get() { return desc.get!.call(this) },
    set(v: number) {
      if (!started.has(this)) started.set(this, performance.now())
      desc.set!.call(this, v)
    },
  })
  const fast = HTMLMediaElement.prototype.fastSeek
  if (fast) HTMLMediaElement.prototype.fastSeek = function (t: number) {
    if (!started.has(this)) started.set(this, performance.now())
    return fast.call(this, t)
  }
  document.addEventListener('seeked', (e) => {
    const t0 = started.get(e.target as HTMLMediaElement)
    started.delete(e.target as HTMLMediaElement)
    if (t0 !== undefined && m.run && current) ch().seeks.push(performance.now() - t0)
  }, true)

  // presented frames
  const watch = (v: HTMLVideoElement) => {
    const loop = (_: number, meta: VideoFrameCallbackMetadata) => {
      presented.set(v, meta.mediaTime)
      if (m.run && current && v.style.opacity === '1') ch().frames++
      v.requestVideoFrameCallback(loop)
    }
    v.requestVideoFrameCallback?.(loop)
  }
  new MutationObserver(() => document.querySelectorAll('video').forEach((v) => {
    if (!(v as HTMLVideoElement & { __w?: 1 }).__w) {
      ;(v as HTMLVideoElement & { __w?: 1 }).__w = 1
      watch(v)
    }
  })).observe(document, { subtree: true, childList: true })

  // desktop frame sequences (#hd2): each new frame the stage canvas draws counts as a presented frame
  new MutationObserver((list) => {
    for (const r of list) {
      const c = r.target as HTMLElement
      if (m.run && current && c.style.opacity === '1') ch().frames++
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-frame'] })

  new PerformanceObserver((l) => l.getEntries().forEach((e) => m.run && m.long.push(e.duration))).observe({ type: 'longtask', buffered: false })
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => m.run && m.loaf.push(e.duration))).observe({ type: 'long-animation-frame' })
  } catch {}

  let last = performance.now()
  let lastY = 0
  const frame = (t: number) => {
    const dt = t - last
    last = t
    if (scrollY !== lastY) m.lastScroll = t
    lastY = scrollY
    // the chapter the engine is showing (Lenis-smoothed), not the raw scroll position
    const els = document.querySelectorAll<HTMLElement>('[data-chapter]')
    const here = els[w.__scrub?.chapter ?? -1]?.dataset.chapter ?? ''
    if (here !== current) current = here
    const scrolling = t - m.lastScroll < 200
    if (m.run && current && scrolling) {
      m.raf.push(dt)
      const c = ch()
      c.scrollMs += dt
      const p = w.__scrub
      if (p?.id) c.video = true
      if (p?.id && t - c.enteredAt > 500) {
        const v = [...document.querySelectorAll('video')].find((x) => x.style.opacity === '1')
        const cv = document.querySelector<HTMLCanvasElement>('canvas.stage__seq')
        const mt = v ? presented.get(v) : cv?.style.opacity === '1' ? +(cv.dataset.frame ?? -99) / 24 : undefined
        if (!p.shown || mt === undefined || Math.abs(mt - p.target) > 2 / 24) c.staleMs += dt
      }
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

async function wheelScroll(page: Page, to: number) {
  await page.mouse.move(720, 450)
  let n = 0
  while ((await page.evaluate(() => scrollY)) < to) {
    // 100 px notches at 8-12 notches/s, with a fast flick every ~40 notches
    if (++n % 40 === 0) for (let k = 0; k < 8; k++) await page.mouse.wheel(0, 120)
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(80 + Math.random() * 45)
  }
}

async function touchScroll(cdp: CDPSession, page: Page, to: number) {
  const x = 200
  while ((await page.evaluate(() => scrollY)) < to) {
    // one swipe: 500 px up over ~250 ms, release with momentum, then a pause like a reader
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 750 }] })
    for (let k = 1; k <= 10; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 750 - k * 50 }] })
      await page.waitForTimeout(25)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(500 + Math.random() * 300)
  }
}

const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : 0)

for (const [name, prof] of Object.entries(PROFILES)) {
  for (const path of ['ocean', 'pond'] as const) {
    test(`video smoothness ${name} ${path}`, async ({ browser, baseURL }) => {
      test.setTimeout(600_000)
      const ctx = await browser.newContext({
        viewport: prof.viewport,
        isMobile: prof.mobile,
        hasTouch: prof.mobile,
        // DPR=2 on desktop asks for the 2560 tier (#hd2: how the 2560 / 3840 tiers were measured)
        deviceScaleFactor: prof.mobile ? 2.625 : +(process.env.DPR ?? 1),
        extraHTTPHeaders: process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS, 'x-vercel-set-bypass-cookie': 'true' } : undefined,
        recordVideo: process.env.RECORD ? { dir: `review/recordings/${name}-${path}`, size: prof.viewport } : undefined,
      })
      await ctx.addInitScript(instrument)
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      if (prof.net) await cdp.send('Network.emulateNetworkConditions', prof.net)
      if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu })

      let bytes = 0
      const urls = new Map<string, string>()
      const perFile = new Map<string, number>()
      cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, new URL(e.request.url).pathname))
      cdp.on('Network.loadingFinished', (e) => {
        bytes += e.encodedDataLength
        const f = urls.get(e.requestId)
        if (f) perFile.set(f, (perFile.get(f) ?? 0) + e.encodedDataLength)
      })

      await page.goto(`${baseURL}/story#${path}`)
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
      await page.waitForTimeout(500)
      const initial = bytes
      const filmEnd = await page.evaluate(() => {
        const s = document.getElementById('story')!
        return s.offsetTop + s.offsetHeight - innerHeight
      })
      await page.evaluate(() => ((window as unknown as { __m: { run: boolean } }).__m.run = true))
      if (prof.mobile) await touchScroll(cdp, page, filmEnd)
      else await wheelScroll(page, filmEnd)
      await page.waitForTimeout(1000)
      const m = await page.evaluate(() => (window as unknown as { __m: unknown }).__m) as {
        chapters: Record<string, { scrollMs: number; staleMs: number; frames: number; seeks: number[]; video: boolean }>
        long: number[]
        loaf: number[]
        raf: number[]
      }

      const video = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => el.dataset.chapter!))
      const rows = video.map((id) => {
        const c = m.chapters[id] ?? { scrollMs: 0, staleMs: 0, frames: 0, seeks: [], video: false }
        return {
          chapter: id,
          motion: c.video ? 'video' : 'STILL',
          scrollS: +(c.scrollMs / 1000).toFixed(1),
          presentedFps: c.scrollMs ? +(c.frames / (c.scrollMs / 1000)).toFixed(1) : 0,
          seekP50: +pct(c.seeks, 0.5).toFixed(0),
          seekP95: +pct(c.seeks, 0.95).toFixed(0),
          stalePct: c.scrollMs ? +((100 * c.staleMs) / c.scrollMs).toFixed(1) : 0,
          seeks: c.seeks.length,
        }
      })
      const report = {
        url: `${baseURL}/story#${path}`,
        profile: name,
        initialKB: Math.round(initial / 1024),
        fullScrollMB: +(bytes / 1048576).toFixed(2),
        longTasks: m.long.length,
        longTaskMaxMs: Math.round(Math.max(0, ...m.long)),
        loaf: m.loaf.length,
        rafFps: m.raf.length ? +(1000 / (m.raf.reduce((a, b) => a + b, 0) / m.raf.length)).toFixed(1) : 0,
        chapters: rows,
        files: Object.fromEntries([...perFile].filter(([f]) => /\.(mp4|webp|glb)$/.test(f)).map(([f, b]) => [f, Math.round(b / 1024)])),
      }
      mkdirSync('review', { recursive: true })
      writeFileSync(`review/smoothness-${name}-${path}.json`, JSON.stringify(report, null, 2))
      console.log(`\n${name} ${path}: initial ${report.initialKB} KB, full ${report.fullScrollMB} MB, long tasks ${report.longTasks} (max ${report.longTaskMaxMs} ms), LoAF ${report.loaf}, rAF ${report.rafFps} fps`)
      console.table(rows)

      // acceptance §7.4 (soft: every number is reported even when one fails)
      const seekLimit = prof.mobile ? LIMITS.seekP95Mobile : LIMITS.seekP95Desktop
      // §3: every chapter shows motion; stills are reported, not skipped
      // the documentation interlude stays a still by decision (#162)
      // start: /#ocean and /#pond land on the path's first chapter (#210), and the start chapter's motion is the hero
      // loop (#197), not a stage clip; smoke.spec.ts checks the loop on / (#212)
      // the wild path's quality beat is a still until its fish-in-the-plant clips land (#219, "needs clip")
      const stills = ['world', 'docs', 'start']
      expect.soft(rows.filter((r) => r.motion === 'STILL' && !stills.includes(r.chapter)).map((r) => r.chapter), 'chapters with no moving picture').toEqual([])
      for (const r of rows) {
        if (r.motion !== 'video') continue
        expect.soft(r.presentedFps, `${r.chapter} presented fps`).toBeGreaterThanOrEqual(LIMITS.fps)
        expect.soft(r.seekP95, `${r.chapter} seek p95`).toBeLessThanOrEqual(seekLimit)
        if (prof.net) expect.soft(r.stalePct, `${r.chapter} stale %`).toBeLessThanOrEqual(LIMITS.stalePct)
      }
      expect.soft(report.initialKB * 1024, 'initial transfer').toBeLessThanOrEqual(prof.mobile ? LIMITS.initialMobile : LIMITS.initialDesktop)
      if (!prof.mobile && prof.cpu === 1) expect.soft(report.longTasks, 'long tasks > 50 ms (desktop)').toBe(0)
      await ctx.close()
    })
  }
}
