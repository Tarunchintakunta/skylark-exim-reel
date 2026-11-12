import { expect, test, type Page } from '@playwright/test'

// #147, #194: globe labels never overlap, stay inside the viewport below the fixed header, and at most 4 show at once,
// at every rotation of the idle tour and for every hovered market. The list, the labels and the headline count agree.
const VIEWS = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'tablet', viewport: { width: 1024, height: 900 }, isMobile: false },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
]

const visibleLabels = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.globe-label')]
      .filter((l) => l.style.opacity === '1')
      .map((l) => {
        const r = l.getBoundingClientRect()
        return { name: l.textContent, l: r.left, t: r.top, r: r.right, b: r.bottom }
      }),
  )

function check(boxes: Awaited<ReturnType<typeof visibleLabels>>, vw: number, vh: number, when: string) {
  expect(boxes.length, `${when}: label count`).toBeLessThanOrEqual(4)
  for (const a of boxes) {
    expect(a.l, `${when}: ${a.name} left`).toBeGreaterThanOrEqual(0)
    expect(a.r, `${when}: ${a.name} right`).toBeLessThanOrEqual(vw)
    expect(a.t, `${when}: ${a.name} top`).toBeGreaterThanOrEqual(68)
    expect(a.b, `${when}: ${a.name} bottom`).toBeLessThanOrEqual(vh)
    for (const b of boxes)
      if (a !== b) expect(a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t, `${when}: ${a.name} overlaps ${b.name}`).toBe(false)
  }
}

for (const v of VIEWS) {
  test(`globe labels: <= 4, no overlap at any rotation (${v.viewport.width}×${v.viewport.height})`, async ({ browser }) => {
    const { width: vw, height: vh } = v.viewport
    const ctx = await browser.newContext({ viewport: v.viewport, isMobile: v.isMobile, hasTouch: v.isMobile })
    const page = await ctx.newPage()
    await page.goto('/story')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
    const goto = (p: number) =>
      page.evaluate((p) => {
        const el = document.querySelector<HTMLElement>('[data-chapter="world"]')!
        window.scrollTo(0, el.getBoundingClientRect().top + scrollY + p * (el.offsetHeight - innerHeight))
      }, p)

    await goto(0.5)
    await page.waitForTimeout(1500)
    await goto(0.99)
    await page.waitForTimeout(1500)

    // one market per list item, one label per market, and the headline counts them
    const counts = await page.evaluate(() => ({
      list: document.querySelectorAll('[data-chapter="world"] .markets__item').length,
      labels: document.querySelectorAll('.globe-label:not(.globe-label--origin)').length,
      title: document.querySelector('[data-chapter="world"] .caption__title')!.textContent,
    }))
    expect(counts.list).toBe(counts.labels)
    expect(counts.title).toContain(`${counts.list} markets`)
    expect(counts.title).not.toContain('16')

    // the idle tour: sample rotations over ~4 regions
    const seen = new Set<string>()
    for (let s = 0; s < 10; s++) {
      const boxes = await visibleLabels(page)
      boxes.forEach((b) => seen.add(b.name!))
      check(boxes, vw, vh, `tour sample ${s}`)
      await page.waitForTimeout(1300)
    }
    expect(seen.has('Visakhapatnam')).toBe(true)
    expect(seen.size).toBeGreaterThan(2)

    // hovering / focusing each list item: the globe turns toward it, still ≤ 4 and no overlap
    if (!v.isMobile) {
      const items = page.locator('[data-chapter="world"] .markets__item')
      for (const n of [0, 4, 8, 12]) {
        await items.nth(n).focus()
        await page.waitForTimeout(1200)
        check(await visibleLabels(page), vw, vh, `focus ${n}`)
      }
    }
    await ctx.close()
  })
}
