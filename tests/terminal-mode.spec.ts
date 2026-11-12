import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * Terminal mode (#264): once a page is warm, scrolling it fetches nothing and always has a picture to show.
 *
 * Per viewport, with no throttling and again on Fast 4G with a 4× slower CPU:
 * - the homepage hero's muted loop, once buffered and with the story warmed: on a step scroll it is painted and
 *   moving at every stop, on a fast fling it keeps playing while on screen, never blank or stuck
 * - /story, warm: a step scroll and a fast fling always have a clip on screen (no frozen frame, no blank stage)
 * - no request to /media once the page is warm: the homepage, and /story on a phone; desktop /story streams its clips
 *   and the port film's frames by chapter (#hd2), so only those
 * - the frame-time p95 table, written to review/terminal-mode.json
 */
const VIEWPORTS = {
  '1920x1080@1': { viewport: { width: 1920, height: 1080 }, dpr: 1, mobile: false },
  '1440x900@2': { viewport: { width: 1440, height: 900 }, dpr: 2, mobile: false },
  '390x844@3': { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true },
} as const
/** DevTools' Fast 4G */
const FAST_4G = { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }
/** one 60 Hz vsync, plus the jitter a run with no dropped frame still shows */
const FRAME_P95_MS = 16.7 + 0.3

/** The hero loop: decoded and on screen (a picture), its time (moving or stuck), and whether any of it is in view. */
const heroState = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('.home-hero video')!
    const r = v.getBoundingClientRect()
    return { painted: v.readyState >= 2 && v.videoWidth > 0, paused: v.paused, t: v.currentTime, visible: r.bottom > 0 && r.top < innerHeight }
  })

const p95 = (a: number[]) => +[...a].sort((x, y) => x - y)[Math.max(0, Math.floor(a.length * 0.95) - 1)].toFixed(1)

/** Scrolls with rAF and returns every frame delta, so the table is the browser's own frame times. */
const timedScroll = (page: Page, step: number) =>
  page.evaluate(
    (step) =>
      new Promise<number[]>((done) => {
        const max = document.documentElement.scrollHeight - innerHeight
        const dt: number[] = []
        let last = performance.now()
        const f = (t: number) => {
          dt.push(t - last)
          last = t
          scrollBy(0, step)
          if (scrollY >= max - 2) done(dt.slice(5))
          else requestAnimationFrame(f)
        }
        requestAnimationFrame(f)
      }),
    step,
  )

for (const [name, v] of Object.entries(VIEWPORTS)) {
  for (const throttled of [false, true]) {
    test(`terminal mode ${name}${throttled ? ' fast 4G + 4× CPU' : ''}`, async ({ browser }) => {
      test.setTimeout(900_000)
      const report: Record<string, unknown> = { viewport: name, throttled }
      const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.mobile, hasTouch: v.mobile })
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      if (throttled) {
        await cdp.send('Network.emulateNetworkConditions', FAST_4G)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      }
      let media: string[] = []
      let counting = false
      page.on('request', (r) => counting && /\/media\//.test(r.url()) && media.push(new URL(r.url()).pathname))

      // ── the homepage hero: the city view's muted loop (c8cdc94 replaced the canvas frame sequence with it)
      await page.goto('/')
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
      // warm: the loop is buffered to its end, and every story file the homepage warms in the background is fetched
      await page.waitForFunction(
        () => {
          const v = document.querySelector<HTMLVideoElement>('.home-hero video')
          const b = v?.buffered
          const whole = !!v && v.readyState >= 4 && !!b && b.length > 0 && b.end(b.length - 1) >= v.duration - 0.05
          return whole && (globalThis as unknown as { __homeWarm?: boolean }).__homeWarm === true
        },
        null,
        { timeout: 600_000, polling: 500 },
      )
      report.heroLoop = await page.evaluate(() => document.querySelector<HTMLVideoElement>('.home-hero video')!.duration)
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForTimeout(600)

      // step scroll through the hero's screen: the loop is painted and moving at every stop, never blank, never stuck
      counting = true
      const stalled: string[] = []
      for (const f of [0, 0.2, 0.4, 0.6, 0.8]) {
        await page.evaluate((f) => scrollTo(0, document.querySelector<HTMLElement>('.home-hero')!.offsetHeight * f), f)
        const was = await heroState(page)
        await page.waitForTimeout(500)
        const now = await heroState(page)
        if (!now.painted) stalled.push(`${f}: blank`)
        else if (now.t === was.t) stalled.push(`${f}: the frame did not change`)
      }
      report.heroStalled = stalled

      // fast fling from the top: while any of the hero is on screen it keeps playing (off screen it pauses by design)
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForTimeout(400)
      const flung: boolean[] = []
      // 1200 px notches on desktop (Lenis eases them, so the hero is sampled on its way out); a phone scrolls natively,
      // and a 1200 px notch takes its one-screen, non-sticky hero off screen before the first sample: 45% of the screen
      const notch = v.mobile ? Math.round(v.viewport.height * 0.45) : 1200
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, notch)
        await page.waitForTimeout(120)
        const h = await heroState(page)
        if (h.visible) flung.push(h.painted && !h.paused)
      }
      report.heroFlingPainted = flung
      report.heroFrameP95 = p95(await timedScroll(page, v.mobile ? 18 : 24))
      counting = false
      report.heroMediaDuringScroll = [...new Set(media)]

      // ── /story, warm
      media = []
      await page.goto('/story#ocean')
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
      // the whole warm routine, not just the clips: the posters, the page's lazy images and the globe come after them
      await page.waitForFunction(() => (globalThis as unknown as { __warmCache?: { warm: boolean } }).__warmCache?.warm === true, null, { timeout: 600_000 })
      await page.waitForTimeout(1500)
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForTimeout(800)
      counting = true
      const stuck: string[] = []
      // the film's own stops only: past it the business sections cover the stage and no clip is meant to be on screen
      const onFilm = () =>
        page.evaluate(() => {
          const s = (globalThis as unknown as { __scrub?: { id: string | null; shown: boolean; painted: boolean } }).__scrub
          // before the story chunk mounts there is no film: nothing to check
          const film = document.querySelector('.film')?.getBoundingClientRect()
          return { ...s, film: !!film && film.bottom > innerHeight * 0.5 }
        })
      for (const f of [0.05, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6]) {
        await page.evaluate((f) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), f)
        await page.waitForTimeout(700)
        const s = await onFilm()
        if (s.film && !s.painted) stuck.push(`step ${f}: ${s.id ?? 'no clip'} and nothing painted`)
      }
      // a fast fling through the film: it still has a clip painted at the end of it
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForTimeout(500)
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel(0, 1600)
        await page.waitForTimeout(150)
      }
      await page.waitForTimeout(800)
      const after = await onFilm()
      if (after.film && !after.painted) stuck.push('after the fling: nothing painted')
      report.storyStuck = stuck
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForTimeout(600)
      report.storyFrameP95 = p95(await timedScroll(page, v.mobile ? 18 : 24))
      counting = false
      report.storyMediaDuringScroll = [...new Set(media)]
      await ctx.close()

      mkdirSync('review', { recursive: true })
      writeFileSync(`review/terminal-mode-${name}${throttled ? '-4g' : ''}.json`, JSON.stringify(report, null, 2))
      console.log(`\n${name}${throttled ? ' fast 4G + 4× CPU' : ''}`, JSON.stringify(report))

      expect.soft(stalled, `${name} hero blank or stuck on a step scroll`).toEqual([])
      expect.soft(flung.length, `${name} hero samples while on screen during a fling`).toBeGreaterThan(0)
      expect.soft(flung.filter((p) => !p), `${name} hero blank or paused during a fling`).toEqual([])
      expect.soft(report.heroMediaDuringScroll, `${name} hero media requests once warm`).toEqual([])
      expect.soft(stuck, `${name} story stuck or blank`).toEqual([])
      // /story streams by chapter on every device: clips, the port film's frames (desktop), the stage posters and the
      // products' lazy images may arrive during the scroll; nothing else
      const story = report.storyMediaDuringScroll as string[]
      const streamed = /(\.mp4|-f_1920_\d+\.(avif|webp)|\/(hf-|opening|ph-|prod-)[^/]*\.(avif|webp))$/
      expect.soft(story.filter((u) => !streamed.test(u)), `${name} story media requests once warm`).toEqual([])
      expect.soft(report.heroFrameP95 as number, `${name} hero frame p95`).toBeLessThanOrEqual(FRAME_P95_MS)
      expect.soft(report.storyFrameP95 as number, `${name} story frame p95`).toBeLessThanOrEqual(FRAME_P95_MS)
    })
  }
}
