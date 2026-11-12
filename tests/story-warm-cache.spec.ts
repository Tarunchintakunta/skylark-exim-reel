import { expect, test, type Page } from '@playwright/test'
import { CLIPS } from '../src/film/manifest'
import { scrollThrough } from './helpers'

// #251, #preload, perf/story-smooth-scroll: the intro opens on the first clip. The cache then streams: before the first
// scroll only the opening chapter and the next chapter's first batch load (under 8 MB in all); from the first scroll
// on, the chapters around the scroll. `warm` means that window is in hand. A full scroll fetches every file once at
// most. Frame times only mean something with GPU=1.

const ready = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })

async function lcp(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        new PerformanceObserver((l) => {
          const e = l.getEntries()
          done(Math.round(e[e.length - 1].startTime))
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      }),
  )
}

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false },
  phone: { viewport: { width: 390, height: 844 }, mobile: true },
}

for (const [device, d] of Object.entries(DEVICES))
for (const path of ['ocean', 'pond'] as const) {
  test(`${device} /story#${path}: under 8 MB before the first scroll, and a full scroll fetches each file once`, async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile })
    const page = await ctx.newPage()
    const media: string[] = []
    let bytes = 0
    let phase: 'load' | 'scroll' = 'load'
    page.on('requestfinished', async (r) => {
      const s = await r.sizes().catch(() => null)
      if (s && phase === 'load') bytes += s.responseBodySize + s.responseHeadersSize
      // a whole file over the network: not a cache revalidation (304, empty) nor a <video>'s range request (206). The
      // opening frame is both the static first-frame <img> (#309) and the worker's frame 0: one URL, one download.
      const path = new URL(r.url()).pathname
      if (s && s.responseBodySize > 0 && (await r.response())?.status() === 200 && /\/media\/.+(\.mp4|-f_1920_\d+\.(avif|webp))$/.test(path)) media.push(path)
    })
    await page.goto(`/story#${path}`)
    await ready(page)
    const l = await lcp(page)
    await page.waitForSelector('#boot', { state: 'detached', timeout: 120_000 })
    await page.waitForFunction(() => (window as unknown as { __warmCache?: { warm: boolean } }).__warmCache?.warm === true, null, { timeout: 180_000 })
    const held = await cache(page)
    await page.waitForTimeout(1000)
    const initialMB = bytes / 1e6
    phase = 'scroll'
    await page.evaluate(() => {
      const w = window as unknown as { __f: number[]; __run: boolean }
      w.__f = []
      w.__run = true
      let last = performance.now()
      const f = (t: number) => (w.__f.push(t - last), (last = t), w.__run && requestAnimationFrame(f))
      requestAnimationFrame(f)
    })
    await scrollThrough(page, d.mobile, 1200)
    const p95 = await page.evaluate(() => {
      const w = window as unknown as { __f: number[]; __run: boolean }
      w.__run = false
      const f = w.__f.slice(5).sort((a, b) => a - b)
      return +f[Math.floor(f.length * 0.95)].toFixed(1)
    })
    const twice = media.filter((u, k) => media.indexOf(u) !== k)
    console.log(device, path, JSON.stringify({ lcpMs: l, warm: held.warm, held: held.ids.length, initialMB: +initialMB.toFixed(2), mediaRequests: media.length, twice: twice.length, frameP95Ms: p95 }))
    expect(held.warm).toBe(true)
    expect(initialMB).toBeLessThan(8)
    expect(twice).toEqual([])
    if (process.env.GPU) expect(p95).toBeLessThanOrEqual(16.7)
    await ctx.close()
  })
}

type Cache = { path: string; ids: string[]; progress: number; warm: boolean }
async function cache(page: Page) {
  return page.evaluate(() => (window as unknown as { __warmCache: Cache }).__warmCache)
}
const OCEAN_ONLY = ['cg-depart-1', 'cg-depart-2', 'cg-depart-3', 'cg-catch', 'cg-ice', 'cg-return', 'hf-unload-fish', 'hf-unload-crew', 'hf-fish-intake', 'hf-fish-wash', 'hf-fish-cut', 'hf-fish-freeze']
const POND_ONLY = ['cg-ponds', 'cg-sample', 'cg-harvest', 'hf-unload-shrimp', 'hf-intake', 'hf-wash', 'hf-peel', 'hf-lab', 'hf-iqf', 'hf-pack']

test('only the active path is fetched; decoders play from blob: URLs or hold their clip whole; a path switch drops the other path’s clips', async ({ page }) => {
  const clips = new Set<string>()
  page.on('request', (r) => {
    const m = new URL(r.url()).pathname.match(/^\/media\/(.+?)_(?:m|\d+)(?:\.(?:av1|hevc))?\.mp4$/)
    if (m) clips.add(m[1])
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/story#ocean')
  await ready(page)
  await expect.poll(async () => (await cache(page)).warm, { timeout: 20_000 }).toBe(true)
  expect([...clips].filter((c) => POND_ONLY.includes(c))).toEqual([])
  // every decoder plays from the cache or holds its clip whole: a seek never waits on the network
  const waiting = () =>
    page.$$eval('.stage video[src]', (vs) =>
      (vs as HTMLVideoElement[]).filter((v) => {
        if (v.src.startsWith('blob:')) return false
        const b = v.buffered
        return !(b.length === 1 && b.start(0) < 0.05 && b.end(0) > v.duration - 0.05)
      }).length,
    )
  await page.mouse.move(700, 450)
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 120)
  await expect.poll(waiting, { timeout: 10_000 }).toBe(0)

  await page.locator('.path-toggle a', { hasText: 'Farmed shrimp' }).click()
  await expect.poll(async () => (await cache(page)).path).toBe('pond')
  await expect.poll(async () => (await cache(page)).warm, { timeout: 20_000 }).toBe(true)
  const ids = (await cache(page)).ids
  expect(ids.filter((id) => OCEAN_ONLY.includes(id))).toEqual([])
  // every clip held belongs to the farmed path (shared chapters cached on the wild path stay cached across the switch)
  const pond = new Set(CLIPS.pond.map((c) => c.id))
  expect(ids.filter((id) => !pond.has(id))).toEqual([])
})

test('Save-Data keeps the distance prefetch only: nothing is fetched ahead in idle time', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }))
  const page = await ctx.newPage()
  const clips = new Set<string>()
  page.on('request', (r) => /\/media\/.+\.mp4/.test(r.url()) && clips.add(new URL(r.url()).pathname))
  await page.goto('/story#ocean')
  await ready(page)
  await page.waitForTimeout(6000)
  expect(clips.size).toBeLessThanOrEqual(3)
  await expect(page.locator('.cache-bar')).not.toHaveClass(/is-done/)
  await ctx.close()
})
