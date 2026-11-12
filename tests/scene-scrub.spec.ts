import { expect, test } from '@playwright/test'
import { SEQ } from '../src/film/manifest'
import { open } from './helpers'

/**
 * Every scene moves with the scroll: stepping the page 40 px at a time through the whole film, each clip (video or frame
 * sequence) gets at least 15 samples, and its picture advances at least 0.15 s per 100 px. A scene below that rate
 * reads as a still frame under a normal wheel (the wild-catch freezer before #coldchain got its 220 vh).
 */
const STEP = 40
const MIN_SAMPLES = 15
const MIN_RATE = 0.15
/** frame sets thinned to fit the path budget still span the whole take: seconds of source, not frames / 24 */
const TAKE_S: Record<string, number> = { 'hf-fish-cut': 2.04, 'hf-peel': 1.79 }
const sourceTime = (id: string, t: number) => (SEQ[id] ? (t / (SEQ[id].frames / 24)) * (TAKE_S[id] ?? 3) : t)

for (const path of ['#ocean', '#pond']) {
  test(`every scene advances at least ${MIN_RATE} s per 100 px ${path}`, async ({ browser }) => {
    test.setTimeout(300_000)
    const { ctx, page } = await open(browser, 'desktop', path)
    // the whole path in memory, so every clip has its duration when the scroll reaches it
    await page.waitForFunction(() => (globalThis as { __warmCache?: { warm: boolean } }).__warmCache?.warm, null, { timeout: 120_000 })
    const end = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('[data-chapter]')]
      const last = els[els.length - 1]
      return last.offsetTop
    })
    const scenes = new Map<string, { y: number; t: number }[]>()
    for (let y = 0; y <= end; y += STEP) {
      const s = await page.evaluate(
        (y) =>
          new Promise<{ id: string | null; chapter: number; target: number }>((done) => {
            window.scrollTo(0, y)
            // two frames: the controller reads the scroll, then the stage works out the clip and its time
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const p = (globalThis as { __scrub?: { id: string | null; chapter: number; target: number } }).__scrub!
                done({ id: p.id, chapter: p.chapter, target: p.target })
              }),
            )
          }),
        y,
      )
      if (!s.id) continue
      const key = `${s.chapter}:${s.id}`
      if (!scenes.has(key)) scenes.set(key, [])
      scenes.get(key)!.push({ y, t: sourceTime(s.id, s.target) })
    }
    const report = [...scenes].map(([key, xs]) => {
      const px = xs[xs.length - 1].y - xs[0].y
      const rate = px > 0 ? ((xs[xs.length - 1].t - xs[0].t) / px) * 100 : 0
      return { key, samples: xs.length, px, rate: +rate.toFixed(3) }
    })
    console.log(path, JSON.stringify(report))
    expect(report.length).toBeGreaterThan(10)
    expect(report.filter((r) => r.samples < MIN_SAMPLES)).toEqual([])
    expect(report.filter((r) => r.rate < MIN_RATE)).toEqual([])
    await ctx.close()
  })
}
