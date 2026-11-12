import { expect, test } from '@playwright/test'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { open, PROFILES, scrollThrough, type ProfileName } from './helpers'

// TRD §13: scripted full scroll of both paths; long tasks, long animation frames and rAF frame times.
// CI runners have no GPU, so CI only reports (TRD §14); local runs assert.
const REPORT = 'perf-report.json'

for (const profile of Object.keys(PROFILES) as ProfileName[]) {
  for (const path of ['ocean', 'pond']) {
    test(`scroll perf ${profile} ${path}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, profile, `#${path}`)
      const cdp = await ctx.newCDPSession(page)
      if (PROFILES[profile].throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: PROFILES[profile].throttle })
      await page.evaluate(() => {
        const w = window as unknown as { __perf: { long: number[]; loaf: number[]; frames: number[]; run: boolean } }
        w.__perf = { long: [], loaf: [], frames: [], run: true }
        new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__perf.long.push(e.duration))).observe({ type: 'longtask' })
        try {
          new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__perf.loaf.push(e.duration))).observe({ type: 'long-animation-frame' })
        } catch {}
        let last = performance.now()
        const f = (t: number) => {
          w.__perf.frames.push(t - last)
          last = t
          if (w.__perf.run) requestAnimationFrame(f)
        }
        requestAnimationFrame(f)
      })
      await scrollThrough(page, PROFILES[profile].mobile)
      const r = await page.evaluate(() => {
        const w = window as unknown as { __perf: { long: number[]; loaf: number[]; frames: number[]; run: boolean } }
        w.__perf.run = false
        const fr = w.__perf.frames.slice(5).sort((a, b) => a - b)
        const avg = fr.reduce((a, b) => a + b, 0) / fr.length
        return {
          frames: fr.length,
          avgFps: +(1000 / avg).toFixed(1),
          p95FrameMs: +fr[Math.floor(fr.length * 0.95)].toFixed(1),
          longTasks: w.__perf.long.length,
          maxLongTaskMs: +Math.max(0, ...w.__perf.long).toFixed(0),
          longAnimationFrames: w.__perf.loaf.length,
        }
      })
      await ctx.close()
      const all = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : {}
      all[`${profile}-${path}`] = r
      writeFileSync(REPORT, JSON.stringify(all, null, 2))
      console.log(profile, path, JSON.stringify(r))
      if (process.env.CI) return
      if (profile === 'desktop') {
        expect.soft(r.longTasks, 'long tasks > 50 ms').toBe(0)
        expect.soft(r.avgFps).toBeGreaterThanOrEqual(58)
        expect.soft(r.p95FrameMs).toBeLessThanOrEqual(20)
      } else expect.soft(r.avgFps).toBeGreaterThanOrEqual(50)
    })
  }
}
