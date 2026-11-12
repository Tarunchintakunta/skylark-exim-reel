import { expect, test } from '@playwright/test'
import { open } from './helpers'

/**
 * Pictures a person could see: stage layers (posters, stills, globe), the shown <video> and the frame-sequence canvas.
 * A clip's poster goes once the clip paints, so a chapter shows exactly one of them.
 */
const visibleLayers = () =>
  [...document.querySelectorAll<HTMLElement>('.stage__layer, .stage video, .stage__seq')].filter((el) => Number(getComputedStyle(el).opacity) > 0.01).length

test('exactly one stage layer per chapter after coming back from the business sections', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'desktop')
  await page.evaluate(() => document.getElementById('contact')!.scrollIntoView())
  await page.waitForTimeout(1500)
  const mids = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => el.offsetTop + el.offsetHeight * 0.4),
  )
  // the rail / a fast trackpad fling lands mid-film without passing through the globe chapter
  await page.evaluate((y) => window.scrollTo(0, y), mids[3])
  await page.waitForTimeout(700)
  expect(await page.evaluate(visibleLayers), 'landing chapter').toBe(1)
  // nav "Story" (smooth scroll back up), then walk every chapter
  await page.evaluate(() => document.getElementById('contact')!.scrollIntoView())
  await page.waitForTimeout(1500)
  await page.getByRole('link', { name: 'Story' }).first().click()
  await page.waitForTimeout(2500)
  for (const [k, y] of mids.entries()) {
    await page.evaluate((y) => window.scrollTo(0, y), y)
    await page.waitForTimeout(700)
    expect(await page.evaluate(visibleLayers), `chapter ${k}`).toBe(1)
  }
  await ctx.close()
})
