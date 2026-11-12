import { expect, test } from '@playwright/test'

const ready = (page: import('@playwright/test').Page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1')

test('loads, loader completes, one h1', async ({ page }) => {
  await page.goto('/story')
  await ready(page)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('.loader')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveClass(/is-locked/)
})

test('header toggle swaps the story and keeps the hash; Ocean is the default', async ({ page }) => {
  await page.goto('/story')
  await ready(page)
  const ocean = page.getByRole('group', { name: 'Story path' }).getByRole('link', { name: 'Wild catch' })
  const pond = page.getByRole('group', { name: 'Story path' }).getByRole('link', { name: 'Farmed shrimp' })
  await expect(ocean).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('[data-chapter="o1"]')).toHaveCount(1)
  await pond.click()
  await expect(pond).toHaveAttribute('aria-current', 'true')
  await expect(page).toHaveURL(/#pond$/)
  // two separate stories (#219): the pond path has no ocean chapter
  await expect(page.locator('[data-chapter="p1"]')).toHaveCount(1)
  await expect(page.locator('[data-chapter="o1"]')).toHaveCount(0)
})

test('inside the film the toggle lands on the other path\'s first chapter', async ({ page }) => {
  await page.goto('/story#ocean')
  await ready(page)
  const o2 = await page.locator('[data-chapter="o2"]').evaluate((el) => (el as HTMLElement).offsetTop + 50)
  await page.evaluate((y) => window.scrollTo(0, y), o2)
  await page.waitForTimeout(500)
  await page.getByRole('group', { name: 'Story path' }).getByRole('link', { name: 'Farmed shrimp' }).click()
  await expect(page).toHaveURL(/#pond$/)
  await page.waitForTimeout(500)
  const top = await page.locator('[data-chapter="p1"]').evaluate((el) => Math.round(el.getBoundingClientRect().top))
  expect(Math.abs(top)).toBeLessThan(4)
})

test('/story opens on the path\'s first clip at y = 0, with no hero, and the clip scrubs on scroll', async ({ page }) => {
  await page.goto('/story')
  await ready(page)
  await page.waitForSelector('#boot', { state: 'detached' })
  await expect(page.locator('.hero, [data-chapter="start"]')).toHaveCount(0)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.mouse.move(700, 450)
  for (let k = 0; k < 6; k++) {
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(800)
  const shown = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas.stage__seq')!
    return c.style.opacity === '1' ? [c.dataset.clip, Number(c.dataset.frame)] : null
  })
  expect(shown?.[0]).toBe('cg-depart-1')
  expect(shown?.[1]).toBeGreaterThan(0)
})

// #212: the start chapter's moving picture is the homepage hero loop, not a stage clip (video-smoothness skips it), so
// the loop itself must advance before the first scroll
test('the homepage hero loop plays before the first scroll', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const video = page.locator('.hero video')
  await expect(video).toHaveCount(1)
  const t0 = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t0)
})
