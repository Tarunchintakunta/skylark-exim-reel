import { expect, test, type Page } from '@playwright/test'

/**
 * Homepage hero: one screen (100svh) of the Visakhapatnam city view playing on its own as a muted loop, not scrubbed by
 * the scroll. All its copy is on screen from the start. It keeps playing while any of it is on screen (scrolled into
 * the story cards too), pauses once fully off screen, and reduced motion gets the still first frame.
 */
const ready = async (page: Page) => {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
}
const video = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('.home-hero video')
    return v && { t: v.currentTime, paused: v.paused, muted: v.muted, loop: v.loop, inline: v.playsInline, src: v.currentSrc }
  })
const visible = (page: Page, sel: string) =>
  page.locator(`.home-hero .hero ${sel}`).first().evaluate((el) => getComputedStyle(el).visibility === 'visible' && +getComputedStyle(el).opacity > 0.9)

for (const [label, vp, tier] of [
  ['desktop', { width: 1440, height: 900 }, '1920'],
  ['phone', { width: 390, height: 844 }, 'm'],
] as const) {
  test(`${label}: one screen of city video that plays on its own, from the ${tier} file, no frame sequence`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: label === 'phone', hasTouch: label === 'phone' })
    const page = await ctx.newPage()
    const frames: string[] = []
    page.on('request', (r) => /\/media\/hero-seq_/.test(r.url()) && frames.push(r.url()))
    await page.goto('/')
    await ready(page)
    const h = await page.locator('.home-hero').evaluate((el) => el.getBoundingClientRect().height)
    expect(Math.abs(h - vp.height)).toBeLessThan(2)
    const a = (await video(page))!
    expect(a).toMatchObject({ paused: false, muted: true, loop: true, inline: true })
    expect(a.src).toMatch(new RegExp(`/media/hero-loop_${tier}(\\.av1|\\.hevc)?\\.mp4`))
    // it moves with no scroll at all
    await page.waitForTimeout(1000)
    expect((await video(page))!.t).not.toBe(a.t)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    await expect(page.locator('.home-hero canvas')).toHaveCount(0)
    expect(frames).toEqual([])
    await ctx.close()
  })
}

test('all hero copy is on screen from the start, with no scroll', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  for (const sel of ['.hero__title', '.hero__body', '.hero__exports', '.hero__contact', '.hero__fork']) expect(await visible(page, sel), sel).toBe(true)
})

test('it keeps playing scrolled into the story cards, pauses fully off screen, and plays again on the way back', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const vh = await page.evaluate(() => innerHeight)
  await page.evaluate((y) => scrollTo(0, y), vh * 0.6)
  await page.waitForTimeout(400)
  const a = (await video(page))!
  await page.waitForTimeout(800)
  const b = (await video(page))!
  expect(b.paused).toBe(false)
  expect(b.t).not.toBe(a.t)
  await page.evaluate((y) => scrollTo(0, y), vh * 2.5)
  await expect.poll(async () => (await video(page))!.paused).toBe(true)
  await page.evaluate(() => scrollTo(0, 0))
  await expect.poll(async () => (await video(page))!.paused).toBe(false)
})

test('the static headline (LCP) paints before any script and React takes over in the same place', async ({ page }) => {
  await page.route(/\/assets\/.*\.js$/, (r) => r.abort())
  await page.goto('/')
  const h1 = page.locator('#hero-static h1')
  expect(await h1.evaluate((el) => +getComputedStyle(el).opacity)).toBe(1)
  await expect(page.locator('#hero-static .hero__fork')).toBeVisible()
  const before = (await h1.boundingBox())!
  await page.unroute(/\/assets\/.*\.js$/)
  await page.goto('/')
  await ready(page)
  const after = (await page.locator('.home-hero .hero__title').boundingBox())!
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - before[k])).toBeLessThan(1.5)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('a still first frame, no video, all copy visible', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await expect(page.locator('.home-hero video')).toHaveCount(0)
    await expect(page.locator('.home-hero .hero__poster')).toBeVisible()
    const h = await page.locator('.home-hero').evaluate((el) => el.getBoundingClientRect().height)
    expect(Math.abs(h - (await page.evaluate(() => innerHeight)))).toBeLessThan(2)
    for (const sel of ['.hero__title', '.hero__body', '.hero__contact', '.hero__fork']) expect(await visible(page, sel)).toBe(true)
    await expect(page.locator('#hero-static')).toHaveCount(0)
  })
})
