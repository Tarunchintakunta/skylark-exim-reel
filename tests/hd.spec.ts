import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * HD pass: is every picture sharp on the screen it lands on? For each <img>/<video> on screen, source px ÷ (css px × dpr),
 * taken on the axis that limits it (object-fit: cover crops the other), must be ≥ 0.95. Phone portrait clips come from a
 * 810×1440 crop of the 2560×1440 masters: the master's 1440 rows are the ceiling there, so they are held to that ceiling.
 * Also per viewport: LCP, CLS, rAF p95 during a scroll, and during a scroll once the warm cache is through: no media
 * request on a phone (it holds the whole path), clips of the path only on desktop (it streams them by chapter, #hd2).
 * Prints a table per viewport and writes review/hd-<viewport>.json.
 */
const VIEWPORTS = {
  '1920x1080@1': { viewport: { width: 1920, height: 1080 }, dpr: 1, mobile: false },
  '1440x900@2': { viewport: { width: 1440, height: 900 }, dpr: 2, mobile: false },
  '390x844@3': { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true },
} as const
const MIN = 0.95
/** per tier: every desktop tier 90 MB (PR #324: the WebP q 55-70 KB frame sets; was 60 MB, #hd2), the phone 30 MB (CRF 22 AV1, streamed by chapter; was 12) */
const PATH_MB = { retina: 90, desktop: 90, mobile: 30 }
/** the masters are 1440 rows tall: the best a phone portrait clip or poster can reach at 844 css px × dpr 3 (0.57) */
const MASTER_ROWS = 1440
/** LCP: 2,300 ms is the target, 2,500 ms the hard limit (#264) */
const LCP_TARGET_MS = 2300
const LCP_MS = 2500
/** LCP is taken over a throttled first load: Fast 4G, and 4× CPU on the phone (cache disabled) */
const FAST_4G = { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }
/** one 60 Hz vsync; rAF deltas jitter a few tenths around it with no frame dropped (baseline: 16.7–16.8) */
const FRAME_P95_MS = 16.7 + 0.3

interface Sample {
  src: string
  kind: 'img' | 'video'
  ratio: number
  source: string
  css: string
}

/** Every visible img/video, with its source size and the box it is drawn into. */
async function sample(): Promise<Sample[]> {
  const dpr = devicePixelRatio
  const out: Sample[] = []
  for (const el of document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')) {
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 40 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    let o = 1
    for (let n: Element | null = el; n; n = n.parentElement) o *= +getComputedStyle(n).opacity
    if (o < 0.5) continue
    const video = el instanceof HTMLVideoElement
    const src = video ? el.currentSrc : el.currentSrc || el.src
    if (!src || src.startsWith('data:') || src.endsWith('.svg')) continue
    // an <img> with a srcset reports naturalWidth divided by its density: read the file's own size
    let w = video ? el.videoWidth : el.naturalWidth
    let h = video ? el.videoHeight : el.naturalHeight
    if (!video && el.complete && w) {
      const im = new Image()
      im.src = src
      await im.decode().catch(() => {})
      ;[w, h] = [im.naturalWidth, im.naturalHeight]
    }
    if (!w || !h) continue
    // a video still showing its poster (no frame decoded yet) is the poster, measured as an <img> elsewhere
    if (video && el.readyState < 2) continue
    const fit = getComputedStyle(el).objectFit
    // cover / fill: the axis that is stretched the most decides; contain: the one that fits
    const ratio = (fit === 'contain' ? Math.max(w / r.width, h / r.height) : Math.min(w / r.width, h / r.height)) / dpr
    // blob: URLs (warm cache) carry the clip id on data-clip
    const name = src.startsWith('blob:') ? `blob:${(el as HTMLElement).dataset.clip ?? ''}` : new URL(src).pathname
    out.push({ src: name, kind: video ? 'video' : 'img', ratio: +ratio.toFixed(2), source: `${w}×${h}`, css: `${Math.round(r.width)}×${Math.round(r.height)}` })
  }
  return out
}

/** Steps through the page a viewport at a time and keeps the worst ratio per source. */
async function walk(page: Page, mobile: boolean) {
  const worst = new Map<string, Sample>()
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  const step = await page.evaluate(() => Math.round(innerHeight * 0.5))
  for (let y = 0; y <= max + step; y += step) {
    await page.evaluate((y) => scrollTo(0, y), Math.min(y, max))
    if (!mobile) await page.mouse.wheel(0, 1)
    await page.waitForTimeout(700)
    for (const s of await page.evaluate(sample)) {
      const k = `${s.kind} ${s.src}`
      if (!worst.has(k) || worst.get(k)!.ratio > s.ratio) worst.set(k, s)
    }
  }
  return [...worst.values()]
}

async function vitals(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ lcp: number; cls: number }>((done) => {
        let lcp = 0
        let cls = 0
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = Math.max(lcp, e.startTime)))).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!s.hadRecentInput) cls += s.value
          }),
        ).observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => done({ lcp: Math.round(lcp), cls: +cls.toFixed(3) }), 300)
      }),
  )
}

const p95 = (a: number[]) => +[...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)].toFixed(1)

for (const [name, v] of Object.entries(VIEWPORTS)) {
  test(`hd ${name}`, async ({ browser }) => {
    test.setTimeout(900_000)
    const report: Record<string, unknown> = { viewport: name }
    const rows: (Sample & { page: string; min: number; ok: boolean })[] = []
    for (const where of ['/', '/story#ocean', '/story#pond']) {
      const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.mobile, hasTouch: v.mobile })
      const page = await ctx.newPage()
      const media: string[] = []
      let counting = false
      page.on('request', (r) => counting && /\/media\//.test(r.url()) && media.push(new URL(r.url()).pathname))
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.emulateNetworkConditions', FAST_4G)
      if (v.mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      // bytes on the wire, split into /media (clips, frames, posters, stills) and everything else. Playwright's events,
      // not CDP's: the hero's frames are fetched inside a Web Worker, a target the page's Network events never see (#264)
      const bytes = { media: 0, other: 0 }
      page.on('requestfinished', async (r) => {
        const s = await r.sizes().catch(() => null)
        if (s) bytes[/\/media\//.test(r.url()) ? 'media' : 'other'] += s.responseBodySize + s.responseHeadersSize
      })
      await page.goto(where)
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
      const vit = await vitals(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      report[`${where} lcp`] = vit.lcp
      report[`${where} cls`] = vit.cls
      if (where !== '/') {
        // warm cache first (#251), then a timed scroll: rAF p95, and nothing from /media over the network
        await page.waitForFunction(() => (globalThis as unknown as { __warmCache?: { warm: boolean } }).__warmCache?.warm === true, null, { timeout: 300_000 })
        await page.waitForTimeout(2000)
        counting = true
        const frames = await page.evaluate(async (mobile) => {
          const max = document.documentElement.scrollHeight - innerHeight
          const dt: number[] = []
          let last = performance.now()
          await new Promise<void>((done) => {
            const f = (t: number) => {
              dt.push(t - last)
              last = t
              scrollBy(0, mobile ? 18 : 24)
              if (scrollY >= max - 2) done()
              else requestAnimationFrame(f)
            }
            requestAnimationFrame(f)
          })
          return dt.slice(5)
        }, v.mobile)
        counting = false
        report[`${where} p95FrameMs`] = p95(frames)
        report[`${where} mediaDuringScroll`] = [...new Set(media)]
        // the whole path, warm cache complete: what a visitor who reads to the end downloads
        report[`${where} MB`] = { total: +((bytes.media + bytes.other) / 1e6).toFixed(2), media: +(bytes.media / 1e6).toFixed(2), other: +(bytes.other / 1e6).toFixed(2) }
        await page.evaluate(() => scrollTo(0, 0))
        await page.waitForTimeout(500)
      }
      for (const s of await walk(page, v.mobile)) {
        // a phone in portrait plays the portrait clips and shows the portrait posters (_m): full master height, never
        // scaled, so the master's rows are the ceiling (1440 for clips, 2160 for the documentation still)
        // nothing is ever upscaled and the clip masters are 2560×1440, so for anything cut from a clip the master's own
        // rows are the ceiling: at 1440×900 DPR 2 the frame wants 1800 rows and the best a clip can give is 0.80. The
        const fromClip = s.kind === 'video' || s.src.startsWith('blob:') || /_(m|960|1280|1920|2560)\.(avif|webp)$/.test(s.src)
        // the documentation still comes from a 3840×2160 master, but it is exported into the same tier ladder as the
        // clips and so tops out at 2560×1440 like them
        // a card cut from a larger master at native size (hf-catch-card, #268) has fewer rows than the master: its own rows are its ceiling
        const masterRows = /-card_/.test(s.src) ? +s.source.split('×')[1] : MASTER_ROWS
        const min = fromClip ? Math.min(MIN, +((0.99 * masterRows) / (+s.css.split('×')[1] * v.dpr)).toFixed(2)) : MIN
        rows.push({ ...s, page: where, min, ok: s.ratio >= min })
      }
      await ctx.close()
    }
    mkdirSync('review', { recursive: true })
    writeFileSync(`review/hd-${name}.json`, JSON.stringify({ ...report, rows }, null, 2))
    console.log(`\n${name}`, JSON.stringify(report))
    console.table(rows.map(({ page, kind, src, source, css, ratio, min, ok }) => ({ page, kind, src, source, css, ratio, min, ok: ok ? '' : 'LOW' })))
    for (const where of ['/', '/story#ocean', '/story#pond']) {
      expect.soft(report[`${where} lcp`] as number, `${where} LCP`).toBeLessThanOrEqual(LCP_MS)
      expect.soft(report[`${where} lcp`] as number, `${where} LCP target`).toBeLessThanOrEqual(LCP_TARGET_MS)
      expect.soft(report[`${where} cls`], `${where} CLS`).toBe(0)
      if (where === '/') continue
      expect.soft(report[`${where} p95FrameMs`] as number, `${where} p95 frame`).toBeLessThanOrEqual(FRAME_P95_MS)
      // phones hold the whole path; desktop streams clips by chapter (#hd2), so only clips and the port film's frames may
      // arrive during the scroll
      const during = report[`${where} mediaDuringScroll`] as string[]
      expect.soft(v.mobile ? during : during.filter((u) => !/(\.mp4|-f_1920_\d+\.(avif|webp))$/.test(u)), `${where} media requests during the scroll`).toEqual([])
      // the tier a viewport is served decides its budget: DPR 2 on a 1440 desktop asks for 2560
      const tier = v.mobile ? 'mobile' : v.viewport.width * v.dpr * 0.9 > 1920 ? 'retina' : 'desktop'
      expect.soft((report[`${where} MB`] as { total: number }).total, `${where} path MB (${tier})`).toBeLessThanOrEqual(PATH_MB[tier])
    }
    expect.soft(rows.filter((r) => !r.ok).map((r) => `${r.page} ${r.src} ${r.ratio} < ${r.min}`)).toEqual([])
  })
}
