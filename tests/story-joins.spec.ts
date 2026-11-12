import { expect, test } from '@playwright/test'
import { open } from './helpers'

/**
 * Chapter and shot joins never overlap two pictures, in either scroll direction, so no ghost or double exposure can
 * show. And the story opens on its first chapter's true first frame.
 */
const pictures = () =>
  [...document.querySelectorAll<HTMLElement>('.stage img.stage__layer, .stage .stage__seq, .stage .stage__video')].filter(
    (el) => Number(getComputedStyle(el).opacity) > 0,
  ).length

for (const path of ['#ocean', '#pond']) {
  test(`one picture at a time through every join ${path}`, async ({ browser }) => {
    test.setTimeout(600_000)
    const { ctx, page } = await open(browser, 'desktop', path)
    await page.waitForFunction(() => (globalThis as { __warmCache?: { warm: boolean } }).__warmCache?.warm, null, { timeout: 300_000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => document.querySelector<HTMLCanvasElement>('canvas.stage__seq')?.dataset.frame)).toBe('0')

    const end = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].at(-1)!.offsetTop)
    const ys: number[] = []
    for (let y = 0; y <= end; y += 40) ys.push(y)
    const over: number[] = []
    for (const y of [...ys, ...ys.toReversed()]) {
      const n = await page.evaluate(
        ([y, f]) =>
          new Promise<number>((done) => {
            window.scrollTo(0, y)
            requestAnimationFrame(() => requestAnimationFrame(() => done(new Function(`return (${f})()`)())))
          }),
        [y, pictures.toString()] as const,
      )
      if (n > 1) over.push(y)
    }
    expect(over).toEqual([])
    await ctx.close()
  })
}
