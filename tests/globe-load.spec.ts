import { devices, expect, test, type Page } from '@playwright/test'

/**
 * How long the globe takes to show (#D). `shown`: the moment the stage hands over to the globe layer (the Markets
 * chapter owns the frame). From there: `picture`, the first globe picture on screen (the placeholder or the live
 * frame), and `frame`, the first live frame with the earth drawn (`globe:first-frame`, 0 if it was already drawn).
 * `enter` is when the chapter's top edge entered the viewport, for reference.
 * The visitor scrolls in from the documentation chapter at about 1,500 px/s, like a normal wheel or swipe.
 */
type R = { enterToShown: number; frame: number; picture: number }

async function measure(page: Page): Promise<R> {
  await page.goto('/story#ocean')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
  await page.waitForSelector('#boot', { state: 'detached' })
  await page.evaluate(() => {
    const w = window as unknown as { __g: { enter: number; shown: number; picture: number } }
    w.__g = { enter: -1, shown: -1, picture: -1 }
    const world = document.querySelector('[data-chapter="world"]')!
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && w.__g.enter < 0) w.__g.enter = performance.now()
    }).observe(world)
    // the first globe picture on screen: a loaded placeholder or the live canvas, inside the globe's stage layer
    const poll = () => {
      const layer = document.querySelector('.stage__light') as HTMLElement | null
      const ph = layer?.querySelector<HTMLImageElement>('.globe-ph')
      const live = layer?.classList.contains('is-globe-live')
      const shown = layer && +getComputedStyle(layer).opacity > 0.5
      if (shown && w.__g.shown < 0) w.__g.shown = performance.now()
      if (w.__g.shown > 0 && w.__g.picture < 0 && (live || (ph?.complete && ph.naturalWidth))) w.__g.picture = performance.now()
      if (w.__g.picture < 0) requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  })
  const from = await page.locator('[data-chapter="docs"]').evaluate((el) => (el as HTMLElement).offsetTop)
  const to = await page.locator('[data-chapter="world"]').evaluate((el) => (el as HTMLElement).offsetTop + innerHeight * 0.3)
  for (let y = from; y <= to; y += 60) {
    await page.evaluate((y) => window.scrollTo(0, y), y)
    await page.waitForTimeout(40)
  }
  await page.waitForFunction(() => performance.getEntriesByName('globe:first-frame').length > 0, null, { timeout: 30_000 })
  return page.evaluate(() => {
    const g = (window as unknown as { __g: { enter: number; shown: number; picture: number } }).__g
    const frame = performance.getEntriesByName('globe:first-frame')[0].startTime
    return { enterToShown: Math.round(g.shown - g.enter), frame: Math.max(0, Math.round(frame - g.shown)), picture: Math.max(0, Math.round((g.picture > 0 ? g.picture : frame) - g.shown)) }
  })
}

test('globe on desktop', async ({ page }) => {
  const r = await measure(page)
  console.log('desktop', JSON.stringify(r))
  expect.soft(r.picture, 'globe visible after Markets enters view (ms)').toBeLessThan(300)
})

test('globe on a phone, slow 4G, 4x CPU', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const r = await measure(page)
  console.log('mobile slow4g', JSON.stringify(r))
  expect.soft(r.picture, 'globe visible after Markets enters view (ms)').toBeLessThan(800)
  await ctx.close()
})
