import { expect, test } from '@playwright/test'
import { open } from './helpers'

/** Redesign §3 / acceptance §7.5: no HUD, rail, pills, placeholder labels or live blur anywhere in the film. */
for (const path of ['', '#pond'])
  test(`no dashboard chrome or placeholder text ${path || '#ocean'}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'desktop', path)
    const tops = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => el.offsetTop + el.offsetHeight / 2))
    for (const y of tops) {
      await page.evaluate((y) => window.scrollTo(0, y), y)
      await page.waitForTimeout(500)
      const found = await page.evaluate(() => {
        const bad: string[] = []
        if (document.querySelector('.hud, .rail, .path-pill, .stage__ph, .chip, .doc-card, .label-card')) bad.push('chrome element')
        if (/placeholder|awaiting/i.test(document.body.innerText)) bad.push('placeholder text')
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const cs = getComputedStyle(el)
          if (cs.backdropFilter && cs.backdropFilter !== 'none') bad.push(`backdrop-filter on .${el.className}`)
          if (cs.filter.includes('blur')) bad.push(`blur filter on .${el.className}`)
        }
        return bad
      })
      expect(found, `at ${y}px`).toEqual([])
    }
    await ctx.close()
  })
