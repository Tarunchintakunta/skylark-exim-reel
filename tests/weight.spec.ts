import { expect, test } from '@playwright/test'
import { statSync, readdirSync } from 'node:fs'
import { PROFILES, scrollThrough, type ProfileName } from './helpers'

// TRD §13 / ASSETS_SPEC budgets (#264). Transferred bytes from CDP, initial (the page ready) and after a full scroll.
// Initial is the page itself: the story's clips and frames (/story's up-front load and the homepage's background warm
// of the story, #preload), and on /story every /media file its intro preloads (posters, stills, photos), are counted in
// the full budget only.
// /story per path, counted once the warm cache is through and the scroll has reached the end. Per tier, because a
// device downloads one tier: every desktop tier 90 MB (PR #324: sharp WebP frame sets; was 60 MB) (#hd2: 2560 clips from the HD masters, streamed by chapter on
// desktop, was 40 MB retina and 28 MB at 1920), a phone 30 MB (PR #324: CRF 22 AV1, streamed by chapter). The homepage carries the hero's frame set, so it has
// its own 8 MB full-scroll budget.
const BUDGET = { desktop: { initial: 2.5e6, full: 90e6 }, mobile: { initial: 3e6, full: 30e6 } }
const RETINA_FULL = 90e6
const HOME_FULL = 8e6
const MB = (b: number) => +(b / 1e6).toFixed(2)
/** the story's clips and frame sequences */
const STORY_MEDIA = /^\/media\/.+(\.mp4|-f_(1920|2560)_\d+\.(avif|webp))$/

/**
 * Per-file caps for everything under public/ (KB). First match wins; an unknown file type fails, so new
 * kinds of assets need a deliberate cap. Every clip, any tier or codec, ≤ 6,000 KB (#hd2, was 2,300; the budget solver in
 * scripts/clip-manifest.ts sets each one's cap); posters and stills ≤ 350 KB; the LCP still (the hero loop's first
 * frame) ≤ 120 KB and its phone AVIF ≤ 60 KB.
 */
const CAPS: [RegExp, number][] = [
  [/\.mp4$/, 6000],
  // product stills (#195): phones get up to the 960 (#hd), under 150 KB
  [/\/prod-[^/]+_(480|640)\.(avif|webp)$/, 70],
  [/\/prod-[^/]+_960\.(avif|webp)$/, 150],
  // desktop frame sequences on the /story stage (#hd2, scripts/clip-frames.sh): one 2560 or 1920 frame ≤ 150 KB
  // (Terminal Industries' desktop frames run 25-135 KB at 1920); phones play those clips as video
  [/\/hf-[^/]+-f_(2560|1920)_\d+\.(avif|webp)$/, 150],
  // the hero's scroll-sequence frames (#249, #264): one frame is never worth more than the LCP still
  [/\/hero-seq_[^/]+\.(avif|webp)$/, 120],
  [/\/hero-loop_m\.avif$/, 60],
  // the hero's own 2560 still, for a retina desktop: 1.78× the pixels of the 1920 one, so 1.6× its cap (#264)
  [/\/hero-loop_2560\.(avif|webp)$/, 200],
  [/\/hero-loop_[^/]+\.(avif|webp)$/, 120],
  // WebP fallbacks of three busy 1920 posters land over 350 KB at q 70, the quality floor (357 / 367 / 351 KB); browsers
  // with AVIF get the AVIF (294 / 349 / 330 KB)
  [/\/hf-(harvest|ship|sort)_1920\.webp$/, 370],
  // a 2560 poster is 1.78× the pixels of a 1920 one, so it gets 1.8× the cap: at the quality floor (WebP q 70) the
  // busiest frames land at 575 KB, and in AVIF, which every browser that plays these clips decodes, at 361 KB (#264)
  [/_2560\.(avif|webp)$/, 630],
  [/\.(avif|webp)$/, 350],
  [/\.glb$/, 1536],
  [/\.woff2$/, 40],
  [/\.(svg|txt|xml)$/, 20],
  // /order is one standalone page (public/order.html): markup, style and script inline
  [/\.html$/, 40],
  [/\.pdf$/, 2300],
  [/\.(ktx2|jpg|png)$/, 1024],
]

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
}

test('every file under public/ is within its per-file cap', () => {
  const over: string[] = []
  for (const f of walk('public')) {
    if (f.endsWith('.DS_Store')) continue
    const cap = CAPS.find(([re]) => re.test(f))?.[1]
    const kb = statSync(f).size / 1024
    if (cap === undefined) over.push(`${f}: no cap for this file type`)
    else if (kb > cap) over.push(`${f} ${kb.toFixed(0)} KB > ${cap} KB`)
  }
  expect(over).toEqual([])
})

for (const profile of Object.keys(PROFILES) as ProfileName[]) {
  for (const path of ['home', 'ocean', 'pond']) {
    test(`weight ${profile} ${path}`, async ({ browser }) => {
      // the whole path at a scroll and then the warm cache (#hd)
      test.setTimeout(360_000)
      const p = PROFILES[profile]
      const ctx = await browser.newContext({ viewport: p.viewport, isMobile: p.mobile, hasTouch: p.mobile })
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      // Playwright's own request events, not CDP's: the hero's frames are fetched inside a Web Worker, which is a
      // separate CDP target and so never shows up in the page's Network events (#264)
      let bytes = 0
      let film = 0
      page.on('requestfinished', async (r) => {
        const s = await r.sizes().catch(() => null)
        if (!s) return
        const b = s.responseBodySize + s.responseHeadersSize
        const f = new URL(r.url()).pathname
        if (STORY_MEDIA.test(f) || (path !== 'home' && f.startsWith('/media/'))) film += b
        else bytes += b
      })
      await page.goto(path === 'home' ? '/' : `/story#${path}`)
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
      await page.waitForTimeout(500)
      const initial = bytes
      // the whole path (#hd, #264): the warm cache first, then the scroll — in that order, each file is fetched once.
      // Scrolling first with the cache disabled makes the decoders download what they need and the warm cache then
      // fetch the same files again for its Blobs; in a browser that second fetch hits an immutable file for nothing.
      if (path !== 'home') {
        await page.waitForFunction(() => (globalThis as unknown as { __warmCache?: { warm: boolean } }).__warmCache?.warm === true, null, { timeout: 300_000 })
        await page.waitForTimeout(1500)
      }
      await scrollThrough(page, p.mobile, 900)
      // the homepage's own weight; the story it warms in the background is /story's budget
      const full = path === 'home' ? bytes : bytes + film
      await ctx.close()
      console.log(profile, path, `initial ${MB(initial)} MB · full scroll ${MB(full)} MB · story clips and frames ${MB(film)} MB`)
      expect(initial).toBeLessThanOrEqual(BUDGET[profile].initial)
      expect(full).toBeLessThanOrEqual(path === 'home' ? HOME_FULL : BUDGET[profile].full)
    })
  }
}

// the 2560 tier (#264): a retina desktop downloads the largest files the site serves, inside its own budget (90 MB, PR #324)
for (const path of ['ocean', 'pond']) {
  test(`weight retina 2560 ${path}`, async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    let bytes = 0
    page.on('requestfinished', async (r) => {
      const s = await r.sizes().catch(() => null)
      if (s) bytes += s.responseBodySize + s.responseHeadersSize
    })
    await page.goto(`/story#${path}`)
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
    // warm first, then scroll: with the cache disabled, a fast scroll before the warm cache is through downloads what
    // the decoders need and the warm cache then fetches the same files again for its Blobs. In a browser that second
    // fetch is a hit on an immutable file, so counting it here measures something no visitor pays for.
    await page.waitForFunction(() => (globalThis as unknown as { __warmCache?: { warm: boolean } }).__warmCache?.warm === true, null, { timeout: 300_000 })
    await page.waitForTimeout(1500)
    await scrollThrough(page, false, 900)
    const tier = await page.evaluate(() => document.querySelector<HTMLVideoElement>('video.stage__video')?.currentSrc ?? '')
    await ctx.close()
    console.log('retina', path, `full scroll ${MB(bytes)} MB`, tier.replace(/^.*\/media\//, ''))
    expect(bytes).toBeLessThanOrEqual(RETINA_FULL)
  })
}
