import { expect, test, type Page } from '@playwright/test'

/**
 * The homepage Markets globe loads during the intro (#274): its chunk, its decoded texture, the canvas mounted offscreen
 * with its texture uploaded and its shaders compiled, and its first frame drawn, all before Markets is on screen.
 * Two visits: one waits for the intro to end and scrolls down at ~1,500 px/s; one starts scrolling the moment the page
 * is ready (a wheel opens the intro at once) and flings down at ~3,000 px/s. Both stop with the globe in view.
 * Reported, from navigation start: `intro` (the intro gone), `lcp`, `enter` (the globe's box enters the viewport) and
 * `live` (its first live frame), `lead` = enter − live (> 0: live before it was on screen), `poster` (the fallback still
 * was on screen at any moment), `long` (main-thread tasks over 50 ms, the whole visit), `p95` (frame time while the
 * globe is in view, ms). Desktop must pass every check; the throttled profiles are measured and reported (the poster is
 * their fallback when the globe can't finish in time).
 */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }
const FAST_4G = { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false, net: null, cpu: 1 },
  'desktop-4x-slow4g': { viewport: { width: 1440, height: 900 }, mobile: false, net: SLOW_4G, cpu: 4 },
  'android-mid': { viewport: { width: 412, height: 915 }, mobile: true, net: FAST_4G, cpu: 4 },
} as const

type R = { intro: number; lcp: number; enter: number; live: number; lead: number; poster: boolean; long: number[]; p95: number }

function instrument() {
  type G = { intro: number; lcp: number; enter: number; live: number; poster: boolean; long: number[]; frames: number[] }
  const g: G = { intro: -1, lcp: -1, enter: -1, live: -1, poster: false, long: [], frames: [] }
  ;(window as unknown as { __g: G }).__g = g
  new PerformanceObserver((l) => l.getEntries().forEach((e) => e.duration > 50 && g.long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true })
  // LCP up to the first scroll (a scripted scroll is no user input, so the browser would keep counting)
  let scrolled = false
  addEventListener('scroll', () => (scrolled = true), { once: true, passive: true })
  new PerformanceObserver((l) => l.getEntries().forEach((e) => !scrolled && (g.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })
  let last = 0
  const poll = (t: number) => {
    const box = document.querySelector<HTMLElement>('[data-globe]')
    if (g.intro < 0 && document.readyState !== 'loading' && !document.getElementById('boot')) g.intro = t
    if (box) {
      const r = box.getBoundingClientRect()
      const on = r.top < innerHeight && r.bottom > 0
      const live = box.classList.contains('is-globe-live')
      if (live && g.live < 0) g.live = t
      if (on && g.enter < 0) g.enter = t
      const img = box.querySelector('img')
      if (on && !live && img?.complete && img.naturalWidth) g.poster = true
      if (on && last) g.frames.push(t - last)
    }
    last = t
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
}

async function visit(page: Page, mobile: boolean, afterIntro: boolean): Promise<R> {
  await page.goto('/')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
  if (afterIntro) {
    await page.waitForSelector('#boot', { state: 'detached', timeout: 30_000 })
    await page.waitForTimeout(500)
  }
  const pxPerSec = afterIntro ? 1500 : 3000
  const target = () => page.locator('[data-globe]').evaluate((el) => el.getBoundingClientRect().top - innerHeight * 0.15)
  if (mobile) {
    await page.evaluate(
      (v) =>
        new Promise<void>((done) => {
          let last = performance.now()
          const step = (t: number) => {
            const left = (document.querySelector('[data-globe]') as HTMLElement).getBoundingClientRect().top - innerHeight * 0.15
            if (left <= 1) return done() // a sub-pixel scrollBy may not move the page at a fractional DPR
            scrollBy(0, Math.min(left, ((t - last) / 1000) * v))
            last = t
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
      pxPerSec,
    )
  } else {
    await page.mouse.move(700, 450)
    const dy = pxPerSec / 20
    for (let i = 0; i < 400 && (await target()) > 0; i++) {
      await page.mouse.wheel(0, dy)
      await page.waitForTimeout(50)
    }
  }
  await page.waitForTimeout(1500)
  return page.evaluate(() => {
    const g = (window as unknown as { __g: { intro: number; lcp: number; enter: number; live: number; poster: boolean; long: number[]; frames: number[] } }).__g
    const f = [...g.frames].sort((a, b) => a - b)
    return {
      intro: Math.round(g.intro),
      lcp: Math.round(g.lcp),
      enter: Math.round(g.enter),
      live: Math.round(g.live),
      lead: g.live < 0 ? -1 : Math.round(g.enter - g.live),
      poster: g.poster,
      long: g.long,
      p95: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(1),
    }
  })
}

for (const [name, prof] of Object.entries(PROFILES)) {
  for (const afterIntro of [true, false]) {
    test(`markets globe ${name}, ${afterIntro ? 'after the intro' : 'immediate fast scroll'}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.mobile, hasTouch: prof.mobile, deviceScaleFactor: prof.mobile ? 2.625 : 1 })
      await ctx.addInitScript(instrument)
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      if (prof.net) {
        await cdp.send('Network.enable')
        await cdp.send('Network.emulateNetworkConditions', prof.net)
      }
      if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu })
      const r = await visit(page, prof.mobile, afterIntro)
      console.log('markets globe', name, afterIntro ? 'after-intro' : 'fast-scroll', JSON.stringify(r))
      await ctx.close()
      if (name !== 'desktop') return
      expect(r.live, 'live globe').toBeGreaterThan(0)
      expect(r.lead, 'live before the globe enters the viewport (ms)').toBeGreaterThan(0)
      expect(r.poster, 'the poster never shows').toBe(false)
      expect(r.long, 'main-thread tasks over 50 ms').toEqual([])
      expect(r.intro, 'intro gone (ms from navigation)').toBeLessThanOrEqual(1200)
      expect(r.lcp, 'LCP (ms)').toBeLessThanOrEqual(2300)
    })
  }
}
