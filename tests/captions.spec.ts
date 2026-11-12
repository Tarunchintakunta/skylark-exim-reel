import { expect, test } from '@playwright/test'
import { open } from './helpers'

/** Count captions a person could see: visible, not transparent, and with at least one line inside its mask. */
const visibleCaptions = () =>
  [...document.querySelectorAll<HTMLElement>('.caption')].filter((el) => {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false
    const lines = el.querySelectorAll<HTMLElement>('.line')
    if (!lines.length) return true
    return [...lines].some((l) => {
      const r = l.getBoundingClientRect()
      const m = (l.parentElement ?? l).getBoundingClientRect()
      return r.bottom > m.top + 2 && r.top < m.bottom - 2
    })
  }).length

for (const path of ['', '#pond']) {
  test(`at most one caption on screen across every chapter boundary ${path || '#ocean'}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'desktop', path)
    const tops = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => el.offsetTop))
    await page.mouse.move(700, 450)
    let worst = 0
    for (const top of tops.slice(1)) {
      // approach the boundary, then cross it with real wheel notches
      await page.evaluate((y) => window.scrollTo(0, y), top - 300)
      await page.waitForTimeout(400)
      for (let n = 0; n < 6; n++) {
        await page.mouse.wheel(0, 100)
        await page.waitForTimeout(90)
      }
      for (const ms of [0, 250, 500, 1000]) {
        if (ms) await page.waitForTimeout(ms === 250 ? 250 : 250 * (ms / 500))
        worst = Math.max(worst, await page.evaluate(visibleCaptions))
      }
    }
    expect(worst).toBeLessThanOrEqual(1)
    await ctx.close()
  })
}

// #146: SplitText must not break a temperature ("−18 °C") across two lines
for (const width of [390, 1440]) {
  test(`temperatures stay on one line after the split at ${width} px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await ctx.newPage()
    // the temperature caption is on the farmed path's cold chain (#219: the wild path's plant has its own copy)
    await page.goto('/story#pond')
    const sel = '[data-chapter="coldchain"] .caption__title .line'
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, sel)
    const lines = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((l) => l.textContent ?? ''), sel)
    expect(lines.join('')).toContain('−18 °C')
    expect(lines.filter((l) => /−\d+\s*$/.test(l) || /^\s*°C/.test(l))).toEqual([])
    await ctx.close()
  })
}
