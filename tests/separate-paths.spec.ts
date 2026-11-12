import { expect, test, type Page } from '@playwright/test'

/**
 * Wild catch and Farmed shrimp are two separate stories (#219): each path renders only its own chapters and clips,
 * the wild path never says or shows shrimp, and every switch (header toggle, homepage fork, end-of-path link) swaps
 * the list and lands on the new path's first chapter, at the top of /story.
 */
const ENDING = ['docs', 'port', 'sea', 'world']
const ORDER = {
  ocean: ['o1', 'o2', 'o3', 'o4', 'intake', 'process', 'coldchain', ...ENDING],
  pond: ['p1', 'p2', 'p3', 'intake', 'process', 'coldchain', ...ENDING],
}
/** clips that belong to one path only: pond farms and the shrimp plant / the boat and the fish plant */
const POND_CLIPS = /hf-(ponds|sample|harvest|sort|intake|wash|peel|lab|iqf|pack|unload-shrimp)_/
const OCEAN_CLIPS = /hf-(depart|catch|ice|return|fish-[a-z]+|unload-fish)_/
const FIRST = { ocean: 'o1', pond: 'p1' } as const

const ready = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1')
const order = (page: Page) => page.locator('[data-chapter]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.chapter))

/** Collects every media URL the page requests from the moment it is called. */
function requests(page: Page) {
  const urls: string[] = []
  page.on('request', (r) => {
    if (/\/media\//.test(r.url())) urls.push(new URL(r.url()).pathname)
  })
  return urls
}

/** Scrolls the whole film in steps; returns every chapter under the viewport centre and every clip the stage showed. */
async function fullScroll(page: Page) {
  const seen = new Set<string>()
  const clips = new Set<string>()
  const end = await page.evaluate(() => {
    const s = document.getElementById('story')!
    return s.offsetTop + s.offsetHeight
  })
  for (let y = 0; y <= end; y += 350) {
    await page.evaluate((y) => window.scrollTo(0, y), y)
    await page.waitForTimeout(120)
    const s = await page.evaluate(() => {
      const c = innerHeight / 2
      const sec = [...document.querySelectorAll<HTMLElement>('.film > section')].find((e) => {
        const r = e.getBoundingClientRect()
        return r.top <= c && r.bottom >= c
      })
      const video = [...document.querySelectorAll<HTMLVideoElement>('.stage video')].filter((v) => v.style.opacity === '1' && v.currentSrc)
      return { chapter: sec?.id ?? '', clips: video.map((v) => new URL(v.currentSrc).pathname) }
    })
    if (s.chapter) seen.add(s.chapter)
    s.clips.forEach((c) => clips.add(c))
  }
  return { seen: [...seen], clips: [...clips] }
}

/** Waits until the scroll has landed on the path's first chapter. */
async function landsOn(page: Page, path: 'ocean' | 'pond') {
  await expect(page).toHaveURL(new RegExp(`#${path}$`))
  await expect.poll(() => order(page)).toEqual(ORDER[path])
  // the jump waits two frames for the new list: poll until the first chapter's top sits at the viewport top
  await expect
    .poll(() => page.locator(`[data-chapter="${FIRST[path]}"]`).evaluate((el) => Math.abs(Math.round(el.getBoundingClientRect().top))), { timeout: 10_000 })
    .toBeLessThanOrEqual(2)
  await expect(page.getByRole('group', { name: 'Story path' }).getByRole('link', { name: path === 'ocean' ? 'Wild catch' : 'Farmed shrimp' })).toHaveAttribute('aria-current', 'true')
}

for (const url of ['/story', '/story#ocean']) {
  test(`${url} is the wild-catch story only`, async ({ page }) => {
    const urls = requests(page)
    await page.goto(url)
    await ready(page)
    expect(await order(page)).toEqual(ORDER.ocean)
    await expect(page.locator('[data-chapter="p1"], [data-chapter="p2"], [data-chapter="p3"]')).toHaveCount(0)
    // no visible "shrimp" or "pond" in the film; the one link over to the other story is the exception
    const text = await page.locator('#story').evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement
      c.querySelectorAll('[data-other-path], .sr-only').forEach((n) => n.remove())
      return c.textContent ?? ''
    })
    expect(text).not.toMatch(/shrimp|pond/i)
    const alts = await page.locator('#story .sr-only').allTextContents()
    expect(alts.join(' ')).not.toMatch(/shrimp|pond/i)
    const { seen, clips } = await fullScroll(page)
    expect(seen.filter((c) => !ORDER.ocean.includes(c))).toEqual([])
    expect(clips.filter((c) => POND_CLIPS.test(c))).toEqual([])
    expect(urls.filter((u) => POND_CLIPS.test(u))).toEqual([])
  })
}

test('/#pond is the farmed-shrimp story only', async ({ page }) => {
  const urls = requests(page)
  await page.goto('/story#pond')
  await ready(page)
  await landsOn(page, 'pond')
  await expect(page.locator('[data-chapter="o1"], [data-chapter="o2"], [data-chapter="o3"], [data-chapter="o4"]')).toHaveCount(0)
  const { seen, clips } = await fullScroll(page)
  expect(seen.filter((c) => !ORDER.pond.includes(c))).toEqual([])
  expect(clips.filter((c) => OCEAN_CLIPS.test(c))).toEqual([])
  expect(urls.filter((u) => OCEAN_CLIPS.test(u))).toEqual([])
})

test('header toggle swaps the story both ways', async ({ page }) => {
  await page.goto('/story')
  await ready(page)
  await page.waitForSelector('#boot', { state: 'detached' })
  const toggle = page.getByRole('group', { name: 'Story path' })
  await toggle.getByRole('link', { name: 'Farmed shrimp' }).click()
  await landsOn(page, 'pond')
  await toggle.getByRole('link', { name: 'Wild catch' }).click()
  await landsOn(page, 'ocean')
})

for (const p of ['ocean', 'pond'] as const)
  test(`the homepage hero fork opens the ${p} story on its first chapter`, async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
    await page.locator(`.home-hero .hero__fork-btn[data-path="${p}"]`).click()
    await ready(page)
    await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
    await landsOn(page, p)
    expect(await page.evaluate(() => scrollY)).toBe(0)
  })

for (const [from, to] of [['ocean', 'pond'], ['pond', 'ocean']] as const) {
  test(`end-of-path link switches ${from} → ${to}`, async ({ page }) => {
    await page.goto(`/story#${from}`)
    await ready(page)
    await page.waitForSelector('#boot', { state: 'detached' })
    // the last caption of the path's own plant carries the link
    const y = await page.locator('[data-chapter="coldchain"]').evaluate((el) => (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight * 0.9)
    await page.evaluate((y) => window.scrollTo(0, y), y)
    const link = page.locator(`[data-chapter="coldchain"] [data-other-path="${to}"]`)
    await expect(link).toBeVisible()
    await link.click()
    await landsOn(page, to)
  })
}

test('after a switch the other path is gone: no stale clip, no prefetch of its clips', async ({ page }) => {
  await page.goto('/story#ocean')
  await ready(page)
  await page.waitForSelector('#boot', { state: 'detached' })
  // inside the wild story, past the point where its next clips are prefetched
  const y = await page.locator('[data-chapter="o2"]').evaluate((el) => (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight * 0.6)
  await page.evaluate((y) => window.scrollTo(0, y), y)
  await page.waitForTimeout(800)
  await page.getByRole('group', { name: 'Story path' }).getByRole('link', { name: 'Farmed shrimp' }).click()
  await landsOn(page, 'pond')
  const urls = requests(page)
  const { seen, clips } = await fullScroll(page)
  expect(seen.filter((c) => !ORDER.pond.includes(c))).toEqual([])
  expect(clips.filter((c) => OCEAN_CLIPS.test(c))).toEqual([])
  expect(urls.filter((u) => OCEAN_CLIPS.test(u))).toEqual([])
})
