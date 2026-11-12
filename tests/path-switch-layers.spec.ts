import { expect, test } from '@playwright/test'
import { open } from './helpers'

/**
 * #311 / #314: after the header toggle swaps Wild catch for Farmed shrimp, every stage layer shows the farmed path's own
 * picture. The stage's <img> layers used to be keyed by index, so React reused the wild path's elements: farmed
 * "Paperwork, done properly." kept the port poster and chapter 01 opened on the boat.
 */
test('farmed layers after a toggle from wild catch', async ({ browser }) => {
  test.setTimeout(180_000)
  const { ctx, page } = await open(browser, 'desktop', '#ocean')
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120_000 })
  // give every wild layer a source: walk to the ending and back
  for (const id of ['docs', 'port']) {
    await page.evaluate((id) => scrollTo(0, document.querySelector<HTMLElement>(`[data-chapter="${id}"]`)!.offsetTop + 300), id)
    await page.waitForTimeout(800)
  }
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.click('.path-toggle a:has-text("Farmed")')
  await page.waitForFunction(() => location.hash === '#pond' && document.querySelector('[data-chapter="p1"]'))
  const srcs = await page.locator('.stage img').evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''))
  expect(srcs.filter((s) => /hf-(depart|catch|ice|return|fish-|unload-fish)/.test(s))).toEqual([])
  // the toggle lands on the new path's top two frames later (engine/path.ts): scroll until the stage is on docs
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>('[data-chapter="docs"]')!
        scrollTo(0, s.offsetTop + s.offsetHeight / 2)
      })
      await page.waitForTimeout(300)
      return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')][(globalThis as { __scrub?: { chapter: number } }).__scrub!.chapter]?.dataset.chapter)
    })
    .toBe('docs')
  await page.waitForTimeout(500)
  const shown = await page.locator('.stage img').evaluateAll((els) =>
    els.filter((e) => Number((e as HTMLElement).style.opacity) > 0.5).map((e) => e.getAttribute('src') ?? ''),
  )
  expect(shown.join()).toContain('ph-docs-blur')
  await ctx.close()
})
