import { expect, test, type Page } from '@playwright/test'
import { scrollThrough } from './helpers'

// No request from our own origin ever fails (PR #324 audit): the homepage and both story paths, on a 1440×900 desktop at
// 1× and 2× and on a phone, scrolled all the way down and back up. A response of 400 or more fails the test. Posters the
// stage never draws (frame-set clips on desktop) must not be requested at all, so there is nothing to 404.

const DEVICES = {
  'desktop 1x': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'desktop 2x': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}
const PAGES = ['/', '/story#ocean', '/story#pond']

const ready = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })

async function scrollUp(page: Page, mobile: boolean) {
  if (mobile) {
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          let last = performance.now()
          const step = (t: number) => {
            window.scrollBy(0, -((t - last) / 1000) * 2400)
            last = t
            if (scrollY <= 1) done()
            else requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
    )
    return
  }
  for (let k = 0; k < 2000 && (await page.evaluate(() => scrollY)) > 1; k++) await page.mouse.wheel(0, -600)
}

for (const [name, d] of Object.entries(DEVICES))
  for (const path of PAGES) {
    test(`no 4xx/5xx from our origin: ${path} ${name}, down and up`, async ({ browser, baseURL }) => {
      test.setTimeout(300_000)
      const ctx = await browser.newContext(d)
      const page = await ctx.newPage()
      const origin = new URL(baseURL!).origin
      const bad: string[] = []
      page.on('response', (r) => {
        if (r.status() >= 400 && new URL(r.url()).origin === origin) bad.push(`${r.status()} ${new URL(r.url()).pathname}`)
      })
      await page.goto(path)
      await ready(page)
      await page.waitForTimeout(1500)
      await scrollThrough(page, d.isMobile, 2400)
      await page.waitForTimeout(1000)
      await scrollUp(page, d.isMobile)
      await page.waitForTimeout(1000)
      await ctx.close()
      expect([...new Set(bad)]).toEqual([])
    })
  }
