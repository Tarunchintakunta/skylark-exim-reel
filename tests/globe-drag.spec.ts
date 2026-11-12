import { expect, test, type Page } from '@playwright/test'

// Globe interaction: drag turns it, the wheel still scrolls the page, a clicked market lands in front, then it eases home
const toWorld = (page: Page, p: number) =>
  page.evaluate((p) => {
    const el = document.querySelector<HTMLElement>('[data-chapter="world"]')!
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY + p * (el.offsetHeight - innerHeight))
  }, p)
/** a market label's opacity: labels only show on the near side of the globe */
const labelOpacity = (page: Page, name: string) =>
  page.evaluate((n) => Number([...document.querySelectorAll<HTMLElement>('.globe-label')].find((l) => l.textContent === n)!.style.opacity), name)

test('drag turns the globe, wheel scrolls the page, click faces a market', async ({ page }) => {
  page.setDefaultTimeout(10_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/story')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await toWorld(page, 0.5)
  await page.waitForTimeout(1200)
  await toWorld(page, 0.8)
  await page.waitForTimeout(1200)

  const globe = page.locator('.globe-canvas')
  await expect(globe).toHaveCSS('cursor', 'grab')
  await expect(globe).toHaveCSS('touch-action', 'pan-y')
  await expect(page.locator('.globe-hint')).toHaveCSS('opacity', '1')

  // Japan faces the camera after a click (its label shows: labels only show on the near side)
  await page.getByRole('button', { name: 'Japan' }).click()
  await page.waitForTimeout(1500)
  expect(await labelOpacity(page, 'Japan')).toBeGreaterThan(0)
  expect(await labelOpacity(page, 'Algeria')).toBe(0)
  // Algeria too, the other way round
  await page.getByRole('button', { name: 'Algeria' }).click()
  await page.waitForTimeout(1500)
  expect(await labelOpacity(page, 'Algeria')).toBeGreaterThan(0)
  await page.mouse.move(10, 300)

  // drag: grabbing cursor, the hint fades
  await page.mouse.move(1000, 450)
  await page.mouse.down()
  await expect(globe).toHaveClass(/is-grabbing/)
  await page.mouse.move(800, 450, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.globe-hint')).toHaveCSS('opacity', '0')
  await expect(globe).not.toHaveClass(/is-grabbing/)

  // keyboard: focusable while the world chapter is on screen
  await globe.focus()
  await expect(globe).toBeFocused()
  const y1 = await page.evaluate(() => scrollY)
  await page.keyboard.press('ArrowDown')
  expect(await page.evaluate(() => scrollY)).toBe(y1)

  // wheel over the globe scrolls the page
  await page.mouse.move(1000, 450)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(800)
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y1)
})
