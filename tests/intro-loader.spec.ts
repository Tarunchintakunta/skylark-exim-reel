import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const opened = (page: Page, id: string) => page.evaluate((id) => {
  const w = window as unknown as { __warmCache: { ids: string[] }; __sequences: { id: string; progress: number }[] }
  return w.__warmCache.ids.includes(id) || w.__sequences.find((q) => q.id === `stage-${id}`)?.progress === 1
}, id)

/**
 * Intro (#218, #264, #preload): it paints before any JS, dark, with the wordmark, a hairline and 0 %. On every page it
 * locks the scroll and counts real opening work from 0 % to 100 %, then opens: the homepage's city video and hero
 * poster, /story's first clip. The rest of each page keeps loading. It runs on every visit (no session skip), no wheel
 * opens it early, reduced motion gets none, and a page whose script never runs still fades it at 3 s.
 */

/** records when the loader handed over (data-ready on <html>) and when #boot left the DOM, in ms from navigation start */
const TIMES = () => {
  const t: Record<string, number> = ((window as unknown as { __intro: Record<string, number> }).__intro = {})
  new MutationObserver(() => {
    if (!t.ready && document.documentElement.dataset.ready === '1') t.ready = performance.now()
    if (t.ready && !t.gone && !document.getElementById('boot')) t.gone = performance.now()
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready'] })
}
const times = (page: Page) => page.evaluate(() => (window as unknown as { __intro: Record<string, number> }).__intro)

/** DevTools' Fast 4G (9 Mbps down, 1.5 Mbps up, 60 ms RTT), cache off */
async function throttle4g(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 })
}

/** every percentage the intro shows until it opens */
async function percentages(page: Page) {
  const seen: string[] = []
  while (await page.locator('#boot').count()) {
    const t = await page.locator('#boot .loader__pct').textContent().catch(() => null)
    if (t && seen.at(-1) !== t) seen.push(t)
    await page.waitForTimeout(50)
  }
  return seen
}

for (const [name, viewport, mobile] of [
  ['390', { width: 390, height: 844 }, true],
  ['1440', { width: 1440, height: 900 }, false],
] as const) {
  test(`homepage on Fast 4G (${name}): the intro counts 0 % to 100 % and opens once the city video and hero poster are ready`, async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
    const page = await ctx.newPage()
    await page.addInitScript(TIMES)
    await throttle4g(ctx, page)
    await page.goto('/', { waitUntil: 'commit' })
    // static markup: on screen as soon as the document parses, with the wordmark and 0 %
    await page.waitForSelector('#boot .loader__name', { state: 'attached' })
    await expect(page.locator('#boot')).toBeVisible()
    await expect(page.locator('#boot .loader__name')).toHaveText('Skylark Exim')
    await expect(page.locator('#boot .loader__pct')).toHaveText('0%')
    // gated: the page holds still under it
    await page.waitForSelector('#boot.is-gated', { timeout: 15_000 })
    await expect(page.locator('html')).toHaveClass(/is-locked/)
    const seen = await percentages(page)
    const t = await times(page)
    console.log(name, `ready at ${Math.round(t.ready)} ms, loader gone at ${Math.round(t.gone)} ms`, seen.join(' '))
    const n = seen.map((p) => parseInt(p))
    expect(n.every((p, k) => k === 0 || p >= n[k - 1])).toBe(true)
    expect(n.at(-1)).toBe(100)
    // what it waited for is in memory: the city video can play through and the hero poster has decoded
    const media = await page.evaluate(() => ({
      video: document.querySelector<HTMLVideoElement>('.home-hero video')?.readyState ?? 0,
      poster: document.querySelector<HTMLImageElement>('.home-hero picture img')?.complete ?? false,
    }))
    expect(media.video).toBeGreaterThanOrEqual(3)
    expect(media.poster).toBe(true)
    // hand-off: scroll is unlocked and the static hero copy has given way to React's (same place, no shift)
    await expect(page.locator('html')).not.toHaveClass(/is-locked/)
    await expect(page.locator('#hero-static')).toHaveCount(0)
    await expect(page.locator('.hero h1')).toBeVisible()
    await ctx.close()
  })
}

test('/story: the intro counts up to 100 % and opens once the first clip is in memory; the page holds still meanwhile', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/story')
  await page.waitForSelector('#boot.is-gated', { timeout: 15_000 })
  await expect(page.locator('html')).toHaveClass(/is-locked/)
  const seen = new Set<string>()
  while (await page.locator('#boot').count()) {
    const t = await page.locator('#boot .loader__pct').textContent().catch(() => null)
    if (t) seen.add(t)
    await page.waitForTimeout(100)
  }
  console.log('percentages', [...seen].join(' '))
  const cache = await page.evaluate(() => (window as unknown as { __warmCache: { path: string; ids: string[]; opening: boolean; warm: boolean } }).__warmCache)
  expect(cache.path).toBe('ocean')
  expect(cache.opening).toBe(true)
  expect(await opened(page, 'cg-depart-1')).toBe(true)
  await expect(page.locator('html')).not.toHaveClass(/is-locked/)
})

test('no wheel opens the intro early: it holds the page still until 100 %', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('#boot.is-gated')
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(100)
  // still counting: the wheel moved nothing
  const pct = parseInt((await page.locator('#boot .loader__pct').textContent().catch(() => null)) ?? '100')
  if (pct < 100) expect(await page.evaluate(() => scrollY)).toBe(0)
  const seen = await percentages(page)
  expect(seen.at(-1) ?? '100%').toBe('100%')
  await expect(page.locator('html')).not.toHaveClass(/is-locked/)
})

test('a return visit in the same session runs the intro again, from the cache', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
  await page.addInitScript(TIMES)
  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/intro-skip/)
  await page.waitForSelector('#boot.is-gated')
  await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
  const t = await times(page)
  console.log(`revisit: intro gone at ${Math.round(t.gone)} ms`)
  await expect(page.locator('html')).not.toHaveClass(/is-locked/)
})

test('a deep link loads its own path behind the intro and lands on it', async ({ page }) => {
  await page.goto('/story#pond')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
  await page.waitForSelector('#boot', { state: 'detached', timeout: 120_000 })
  const cache = await page.evaluate(() => (window as unknown as { __warmCache: { path: string; ids: string[]; opening: boolean } }).__warmCache)
  expect(cache).toMatchObject({ path: 'pond', opening: true })
  expect(await opened(page, 'cg-ponds')).toBe(true)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __scrub?: { id: string | null } }).__scrub?.id), { timeout: 10_000 }).toBe('cg-ponds')
})

test('the intro: wordmark, hairline and percentage, dark from the first paint, no layout shift (#270)', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.addInitScript(TIMES)
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForSelector('#boot .loader__name', { state: 'attached' })
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(7, 31, 38)')
  await expect(page.locator('#boot .loader__line')).toHaveCount(1)
  await expect(page.locator('#boot .loader__pct')).toHaveCount(1)
  await expect(page.locator('#boot svg, #boot img')).toHaveCount(0) // a text wordmark, no logo
  await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
  const t = await times(page)
  console.log(`intro gone at ${Math.round(t.gone)} ms`)
  expect(t.gone).toBeGreaterThanOrEqual(700)
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
})

test('reduced motion: no intro at all', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForSelector('#boot .loader__name', { state: 'attached' })
  await expect(page.locator('#boot')).toBeHidden() // display: none from the first paint
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
  await page.waitForSelector('#boot', { state: 'detached' })
  await ctx.close()
})

for (const [route, entry] of [
  ['/', /\/assets\/main-.*\.js$/],
  ['/story', /\/assets\/story-.*\.js$/],
] as const) {
  test(`never traps: with no script, the loader on ${route} fades away on its own at 3 s`, async ({ page }) => {
    await page.route(entry, (r) => r.abort())
    await page.goto(route)
    await expect(page.locator('#boot')).toBeVisible()
    await page.waitForTimeout(3600)
    await expect(page.locator('#boot')).toBeHidden()
    // the homepage's static hero copy and its links are there to use
    if (route === '/') {
      await expect(page.locator('#hero-static h1')).toBeVisible()
      await expect(page.locator('#hero-static .hero__contact')).toBeVisible()
    }
  })
}
