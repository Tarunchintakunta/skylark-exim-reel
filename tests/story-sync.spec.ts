import { expect, test } from '@playwright/test'
import { open } from './helpers'

/**
 * Scrolling down and back up shows the same picture and caption at the same scroll position. Sampled through the whole
 * path once its frames are in memory: same clip, same canvas frame, same caption, and the stage is never empty.
 */
const STEP = 160

const sample = (y: number) =>
  new Promise<{ id: string | null; frame: string | null; caption: string | null; painted: boolean }>((done) => {
    window.scrollTo(0, y)
    // settle: the controller reads the scroll, the stage draws, the caption's own timeline catches up
    setTimeout(() => {
      const s = (globalThis as { __scrub?: { id: string | null; painted: boolean } }).__scrub!
      const c = document.querySelector<HTMLCanvasElement>('canvas.stage__seq')
      const on = [...document.querySelectorAll<HTMLElement>('.caption')].find((el) => {
        const cs = getComputedStyle(el)
        return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5
      })
      done({
        id: s.id,
        frame: c && c.style.opacity === '1' ? (c.dataset.frame ?? null) : null,
        caption: on?.querySelector('.caption__title')?.textContent ?? null,
        painted: s.painted,
      })
    }, 350)
  })

for (const path of ['#ocean', '#pond']) {
  test(`frames and captions match down and back up ${path}`, async ({ browser }) => {
    test.setTimeout(600_000)
    const { ctx, page } = await open(browser, 'desktop', path)
    await page.waitForFunction(() => (globalThis as { __warmCache?: { warm: boolean } }).__warmCache?.warm, null, { timeout: 180_000 })
    const end = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].at(-1)!.offsetTop)
    const ys: number[] = []
    for (let y = 0; y <= end; y += STEP) ys.push(y)

    const down = []
    for (const y of ys) down.push(await page.evaluate(sample, y))
    const mismatches = []
    const empty = []
    for (let k = ys.length - 1; k >= 0; k--) {
      const up = await page.evaluate(sample, ys[k])
      if (!up.painted) empty.push(ys[k])
      const d = down[k]
      if (up.id !== d.id || up.frame !== d.frame || up.caption !== d.caption) mismatches.push({ y: ys[k], down: d, up })
    }
    expect(down.filter((d) => d.frame !== null).length).toBeGreaterThan(40)
    expect(empty).toEqual([])
    expect(mismatches).toEqual([])
    await ctx.close()
  })
}
