import { expect, test, type Page } from '@playwright/test'
import { scrollThrough } from './helpers'

// #233: the homepage is a normal scrolling page; the film lives on /story.

const ready = async (page: Page) => {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.waitForSelector('#boot', { state: 'detached' })
}

/**
 * anything of the film: its scripts, its clips (every .mp4 but the hero loop and the story entry's own card loops,
 * #268), its posters' end frames. The story warm-up after the intro (home/prefetch.ts warmStory, #preload) fetches the
 * first clips of the active path into the HTTP cache: a `fetch`, not the page playing or loading the film, so it is left out.
 */
const isStory = (url: string) => /\/assets\/(story|Story)-|\/media\/(?!hero-loop_|cg-catch_|cg-sample_)[^/]+\.mp4(\?|$)/.test(url)

/** the chapter whose box covers the top of the viewport on /story */
const chapterOnScreen = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].find((el) => {
    const r = el.getBoundingClientRect()
    return r.top <= 2 && r.bottom > 2
  })?.dataset.chapter)

test('the homepage has no film and requests nothing of the story, even scrolled to the end', async ({ page }) => {
  const story: string[] = []
  page.on('request', (r) => r.resourceType() !== 'fetch' && isStory(r.url()) && story.push(r.url()))
  await page.goto('/')
  await ready(page)
  await expect(page.locator('.stage, [data-chapter], video.stage__video, .path-toggle')).toHaveCount(0)
  // the one video with a source is the hero's city loop; the story cards' loops get a src only on hover
  await expect(page.locator('video[src]')).toHaveCount(1)
  await expect(page.locator('.home-hero video[src*="/media/hero-loop_"]')).toHaveCount(1)
  await scrollThrough(page, false, 3000)
  expect(story).toEqual([])
})

test('homepage sections come in order', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const order = await page.locator('main > .home-hero, main > section').evaluateAll((els) => els.map((el) => el.id || el.className.split(' ').pop()))
  expect(order).toEqual(['home-hero', 'story-entry', 'intro', 'products', 'markets', 'plant', 'why', 'about', 'close', 'contact'])
  await expect(page.locator('#products .pcard')).toHaveCount(8) // marine fish; the shrimp tab has the other 5
  await expect(page.locator('#story-entry [data-card="wild"] .se-btn--primary')).toHaveAttribute('href', '/story#ocean')
  await expect(page.locator('#story-entry [data-card="farmed"] .se-btn--primary')).toHaveAttribute('href', '/story#pond')
})

for (const [label, path, first, other] of [
  ['Wild catch', 'ocean', 'o1', 'p1'],
  ['Farmed shrimp', 'pond', 'p1', 'o1'],
] as const) {
  test(`nav "Our Story → ${label}" opens /story#${path} on ${first}, that path only`, async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.locator('.nav__group').hover()
    await page.locator('.nav__sub').getByRole('link', { name: label }).click()
    await page.waitForURL(new RegExp(`/story#${path}$`))
    await expect.poll(() => chapterOnScreen(page), { timeout: 15_000 }).toBe(first)
    await expect(page.locator(`[data-chapter="${other}"]`)).toHaveCount(0)
    await expect(page.locator('.path-toggle a[aria-current="true"]')).toHaveText(label)
  })

  test(`the old /#${path} link redirects to /story#${path}`, async ({ page }) => {
    await page.goto(`/#${path}`)
    await page.waitForURL(new RegExp(`/story#${path}$`))
    await expect.poll(() => chapterOnScreen(page), { timeout: 15_000 }).toBe(first)
  })
}

test('hovering a story link prefetches the story chunk and that path\'s first clip, nothing before', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await expect(page.locator('link[rel="modulepreload"][href*="/assets/Story-"]')).toHaveCount(0)
  const card = page.locator('#story-entry [data-card="farmed"]')
  await card.hover()
  const b = (await card.boundingBox())!
  await page.mouse.move(b.x + b.width / 2 + 6, b.y + b.height / 2, { steps: 3 }) // a real move: a still pointer under a scroll does not count
  await expect(page.locator('link[rel="modulepreload"][href*="/assets/Story-"]')).toHaveCount(1)
  await expect(page.locator('link[rel="prefetch"][href*="/media/cg-ponds_"][href*=".mp4?v="]')).toHaveCount(1)
  await expect(page.locator('link[rel="prefetch"][href*="/media/cg-depart-1_"]')).toHaveCount(0)
})

test('the header quote button opens /quote', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await expect(page.locator('.nav [aria-current="page"]')).toHaveText('Home')
  await page.locator('a.quote-cta').click()
  await page.waitForURL(/\/quote$/)
  await expect(page.locator('form.rfq')).toBeVisible()
})

test('mobile menu opens, shows both stories, and reaches /story#pond', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto('/')
  await ready(page)
  const nav = page.locator('#site-nav')
  await expect(nav).toBeHidden()
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(nav).toBeVisible()
  for (const name of ['Home', 'Our Story', 'Wild catch', 'Farmed shrimp', 'Products', 'Markets', 'About', 'Contact', 'Request export quote →']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
  }
  await nav.getByRole('link', { name: 'Farmed shrimp' }).click()
  await page.waitForURL(/\/story#pond$/)
  await expect.poll(() => chapterOnScreen(page), { timeout: 15_000 }).toBe('p1')
  await ctx.close()
})

test('every page carries its own title, description, canonical and OG tags', async ({ page }) => {
  for (const [path, canonical] of [['/', 'https://skylarkexim.com/'], ['/story', 'https://skylarkexim.com/story'], ['/quote', 'https://skylarkexim.com/quote'], ['/news', 'https://skylarkexim.com/news']]) {
    await page.goto(path)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical.replace(/\/$/, path === '/' ? '/' : ''))
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Skylark Exim/)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/)
  }
  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  for (const loc of ['/', '/story', '/quote']) expect(sitemap).toContain(`<loc>https://skylarkexim.com${loc}</loc>`)
})
