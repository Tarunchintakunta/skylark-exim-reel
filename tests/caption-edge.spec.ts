import { expect, test } from '@playwright/test'

/**
 * Caption headings never run past the right edge of the window (1440, 1920, and 1440 at 125 % zoom, which is a 1152 px
 * CSS viewport at device scale 1.25). Every caption of both paths is measured by the extent of its text, not its box:
 * a heading wider than its column overflows the box without changing the box's own rect.
 */
const SIZES = [
  { name: '1440', width: 1440, height: 900, scale: 1 },
  { name: '1920', width: 1920, height: 1080, scale: 1 },
  { name: '1440 at 125%', width: 1152, height: 720, scale: 1.25 },
]

for (const s of SIZES)
  for (const path of ['#ocean', '#pond']) {
    test(`caption headings stay inside the window at ${s.name} ${path}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale })
      const page = await ctx.newPage()
      await page.goto('/story' + path)
      // SplitText has run (after the fonts): each line sits in a mask that clips whatever overflows it
      await page.waitForFunction(() => document.querySelectorAll('.caption__title .line').length > 0)
      const over = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.caption__title .line')].flatMap((line) => {
          const mask = line.parentElement!
          // the glyphs' extent: text nodes only, a range over the line would report the line's block box
          const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
          let right = 0
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const r = document.createRange()
            r.selectNodeContents(n)
            for (const q of r.getClientRects()) right = Math.max(right, q.right)
          }
          const edge = Math.min(innerWidth - 8, mask.getBoundingClientRect().right + 1)
          return right > edge ? [`${line.textContent}: ${Math.round(right)} > ${Math.round(edge)}`] : []
        }),
      )
      expect(over).toEqual([])
      await ctx.close()
    })
  }
