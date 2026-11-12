import { expect, test, type Page } from '@playwright/test'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { PROFILES, scrollThrough, type ProfileName } from './helpers'

// #239 end-to-end checks for the motion round: no console errors on any page, and frame times while scrolling the
// homepage and both /story paths at 4× CPU throttle (run with GPU=1 for real compositing; headless SwiftShader is slower).
const REPORT = 'perf-report.json'
const ready = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })

for (const url of ['/', '/story#ocean', '/story#pond', '/quote', '/news']) {
  test(`no console errors or page errors on ${url}, scrolled to the end`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(url)
    await ready(page)
    await scrollThrough(page, false, 3000)
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })
}

for (const profile of Object.keys(PROFILES) as ProfileName[]) {
  for (const url of ['/', '/story#ocean', '/story#pond']) {
    test(`60 fps scroll at 4x CPU throttle: ${profile} ${url}`, async ({ browser }) => {
      const p = PROFILES[profile]
      const ctx = await browser.newContext({ viewport: p.viewport, isMobile: p.mobile, hasTouch: p.mobile, deviceScaleFactor: p.mobile ? 2.625 : 1 })
      const page = await ctx.newPage()
      await page.goto(url)
      await ready(page)
      await page.waitForSelector('#boot', { state: 'detached' })
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await page.evaluate(() => {
        const w = window as unknown as { __p: { long: number[]; frames: number[]; run: boolean } }
        w.__p = { long: [], frames: [], run: true }
        new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__p.long.push(e.duration))).observe({ type: 'longtask' })
        let last = performance.now()
        const f = (t: number) => (w.__p.frames.push(t - last), (last = t), w.__p.run && requestAnimationFrame(f))
        requestAnimationFrame(f)
      })
      await scrollThrough(page, p.mobile, 1200)
      const r = await page.evaluate(() => {
        const w = window as unknown as { __p: { long: number[]; frames: number[]; run: boolean } }
        w.__p.run = false
        const fr = w.__p.frames.slice(5).sort((a, b) => a - b)
        const avg = fr.reduce((a, b) => a + b, 0) / fr.length
        return {
          frames: fr.length,
          avgFps: +(1000 / avg).toFixed(1),
          p95FrameMs: +fr[Math.floor(fr.length * 0.95)].toFixed(1),
          longTasks: w.__p.long.length,
          maxLongTaskMs: +Math.max(0, ...w.__p.long).toFixed(0),
        }
      })
      await ctx.close()
      const all = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : {}
      all[`4x-${profile}-${url}`] = r
      writeFileSync(REPORT, JSON.stringify(all, null, 2))
      console.log('4x', profile, url, JSON.stringify(r))
      if (process.env.CI || !process.env.GPU) return // frame rates only mean something on a real GPU
      expect.soft(r.avgFps).toBeGreaterThanOrEqual(55)
    })
  }
}
