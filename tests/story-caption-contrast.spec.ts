import { test, expect } from '@playwright/test'

// Caption copy stays WCAG AA over the CG chapters' footage (STYLE.md grade, stage.css .is-cg scrim, which shades only
// behind the caption). For each visible caption line: hide the captions, screenshot the stage, and measure the
// background under that line's box. The 90th-percentile background luminance must give ≥ 4.5:1 for body copy and the
// eyebrow, ≥ 3:1 for the large title. Text shadows are ignored, so this is the conservative case.
// the CG chapters per path; add each chapter as it turns CG
const PATHS = { ocean: ['o1', 'o2', 'o3', 'o4'], pond: ['p1', 'p2'] }
const VIEWS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }

for (const [name, viewport] of Object.entries(VIEWS)) for (const [path, CHAPTERS] of Object.entries(PATHS)) {
  test(`CG caption contrast ${name} ${path}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const page = await (await browser.newContext({ viewport, isMobile: name === 'phone', hasTouch: name === 'phone' })).newPage()
    await page.goto(`/story#${path}`, { waitUntil: 'load' })
    await page.waitForFunction(() => !document.querySelector('#boot'), null, { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    const results: string[] = []
    for (const id of CHAPTERS) {
      for (const at of [0.15, 0.6]) {
        await page.evaluate(([id, at]) => {
          const el = document.querySelector(`[data-chapter="${id}"]`) as HTMLElement
          scrollTo(0, el.offsetTop + el.offsetHeight * (at as number))
        }, [id, at] as const)
        await page.waitForTimeout(2500)
        const boxes = await page.evaluate(() => {
          const cap = [...document.querySelectorAll<HTMLElement>('.caption')].find((c) => +getComputedStyle(c).opacity > 0.9)
          if (!cap) return []
          return (['caption__eyebrow', 'caption__title', 'caption__body'] as const).flatMap((k) => {
            const e = cap.querySelector<HTMLElement>(`.${k}`)
            if (!e) return []
            // the text's own extent, not the block's (a block eyebrow spans the column, mostly empty footage)
            const range = document.createRange(); range.selectNodeContents(e)
            const r = range.getBoundingClientRect(), c = getComputedStyle(e).color
            return [{ k, x: r.left, y: r.top, w: r.width, h: r.height, c }]
          })
        })
        if (!boxes.length) continue
        await page.addStyleTag({ content: '.caption{opacity:0 !important;transition:none !important}' }).then((h) => h.evaluate((s) => (s as HTMLElement).setAttribute('id', 'hide-cap')))
        await page.waitForTimeout(150)
        const png = (await page.screenshot()).toString('base64')
        await page.evaluate(() => document.getElementById('hide-cap')?.remove())
        const ratios = await page.evaluate(async ({ png, boxes }) => {
          const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode()
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
          const g = cv.getContext('2d')!; g.drawImage(img, 0, 0)
          const s = img.width / innerWidth
          const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
          const L = (r: number, g2: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g2) + 0.0722 * lin(b)
          return boxes.map((b) => {
            const d = g.getImageData(Math.round(b.x * s), Math.round(b.y * s), Math.max(1, Math.round(b.w * s)), Math.max(1, Math.round(b.h * s))).data
            const [tr, tg, tb, ta = 1] = b.c.match(/[\d.]+/g)!.map(Number)
            const bg: number[] = [], fg: number[] = []
            for (let i = 0; i < d.length; i += 16) {
              bg.push(L(d[i], d[i + 1], d[i + 2]))
              fg.push(L(tr * ta + d[i] * (1 - ta), tg * ta + d[i + 1] * (1 - ta), tb * ta + d[i + 2] * (1 - ta)))
            }
            const order = bg.map((_, i) => i).sort((a, c) => bg[a] - bg[c]), j = order[Math.floor(order.length * 0.9)]
            return { k: b.k, ratio: +((fg[j] + 0.05) / (bg[j] + 0.05)).toFixed(2) }
          })
        }, { png, boxes })
        for (const r of ratios) {
          results.push(`${id}@${at} ${r.k} ${r.ratio}`)
          expect.soft(r.ratio, `${name} ${id}@${at} ${r.k}`).toBeGreaterThanOrEqual(r.k === 'caption__title' ? 3 : 4.5)
        }
      }
    }
    console.log(name, results.join(' · '))
    expect(results.length).toBeGreaterThan(0)
  })
}
