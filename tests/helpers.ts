import type { Browser, BrowserContext, Page } from '@playwright/test'

export const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, throttle: 1, mobile: false },
  mobile: { viewport: { width: 412, height: 915 }, throttle: 4, mobile: true },
} as const
export type ProfileName = keyof typeof PROFILES

export async function open(browser: Browser, profile: ProfileName, hash = ''): Promise<{ ctx: BrowserContext; page: Page }> {
  const p = PROFILES[profile]
  const ctx = await browser.newContext({ viewport: p.viewport, isMobile: p.mobile, hasTouch: p.mobile, deviceScaleFactor: p.mobile ? 2.625 : 1 })
  const page = await ctx.newPage()
  await page.goto('/story' + hash)
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  return { ctx, page }
}

/** Scroll the whole document at `pxPerSec`: wheel events on desktop (Lenis), native scrollBy on touch. */
export async function scrollThrough(page: Page, mobile: boolean, pxPerSec = 1200) {
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  if (mobile) {
    await page.evaluate(
      ([max, v]) =>
        new Promise<void>((done) => {
          let last = performance.now()
          const step = (t: number) => {
            window.scrollBy(0, ((t - last) / 1000) * v)
            last = t
            if (scrollY >= max - 2) done()
            else requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
      [max, pxPerSec],
    )
    return
  }
  await page.mouse.move(700, 450)
  const dt = 50
  const dy = (pxPerSec * dt) / 1000
  // until the page is at the bottom, not until the wheel deltas add up to its height: Lenis scales each wheel delta
  // (wheelMultiplier, engine/ticker.ts), so the same deltas would stop the run partway down. The height is re-read
  // (lazy sections change it after load) every 5 notches, not every one: on a CI runner a busy main thread makes each
  // read a ~60 ms round trip, a third of a step
  const left = () => page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)
  for (let n = 0; n < 4000 && (n % 5 || (await left()) > 2); n++) {
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(dt)
  }
  await page.waitForTimeout(1500)
}
