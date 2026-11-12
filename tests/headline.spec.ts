import { expect, test } from '@playwright/test'

/** #197: the longest headline word ("Visakhapatnam") fits its column at every width, measured on the glyphs (Range), not element boxes. */
for (const width of [320, 390, 768, 1024, 1440, 1920, 2560]) {
  test(`hero headline fits at ${width} px`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: width < 800 ? 844 : Math.round(width * 0.6) } })
    // the hero lives on the homepage only (/story opens on its first chapter)
    await page.goto('/')
    await page.waitForSelector('#boot', { state: 'detached', timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready)
    const r = await page.evaluate(() => {
      const h = document.querySelector('.home-hero .hero__title')!
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT)
      let word: DOMRect | null = null
      let lines = 0
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const i = n.data.indexOf('Visakhapatnam')
        if (i < 0) continue
        const range = document.createRange()
        range.setStart(n, i)
        range.setEnd(n, i + 'Visakhapatnam'.length)
        word = range.getBoundingClientRect()
        lines = range.getClientRects().length
      }
      const col = document.querySelector('.home-hero .hero__copy')!.getBoundingClientRect()
      return { lines, left: word!.left, right: word!.right, top: word!.top, bottom: word!.bottom, colLeft: col.left, colRight: col.right, scroll: document.documentElement.scrollWidth, vw: innerWidth }
    })
    expect(r.left).toBeGreaterThanOrEqual(r.colLeft - 1)
    expect(r.right).toBeLessThanOrEqual(r.colRight + 1)
    expect(r.lines, 'the word breaks across lines').toBe(1)
    expect(r.scroll).toBeLessThanOrEqual(r.vw)
    await page.close()
  })
}
