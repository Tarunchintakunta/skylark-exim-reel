// /story scroll smoothness and transfer report (perf/story-smooth-scroll).
//   node scripts/story-smooth.mjs [base-url] [desktop|mobile] [slow|fast|both] [shots-dir]
// For each run: the page is opened in a fresh context (cold cache), the bytes before any scroll are summed, then the
// whole story is scrolled down and back up at the given speed. Every rAF samples what the scroll asks for (window.__scrub:
// clip + frame/time) and what the stage shows (the canvas's data-clip/data-frame, or the visible <video>'s currentTime,
// or "poster"). A freeze is the time from the first change of the wanted picture until the shown picture changes.
// Reports the longest freeze, the median and p95 rAF frame time, and transfer before scroll / after the full scroll.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4173'
const profile = process.argv[3] ?? 'desktop'
const speeds = { slow: 700, fast: 3500 }
const which = process.argv[4] ?? 'both'
const shots = process.argv[5]
const mobile = profile === 'mobile'
const view = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
// NET=<Mbps>,<ms latency>: throttle the link (default 25 Mbps / 20 ms desktop, 12 Mbps / 40 ms phone, a typical
// broadband line and 4G); NET=0 for none. Applied to the page and to the frame decoder's worker.
const [mbps, rtt] = (process.env.NET ?? (mobile ? '12,40' : '25,20')).split(',').map(Number)
const throttle = async (target) => {
  if (!mbps) return
  const cdp = await target.context?.().newCDPSession(target).catch(() => null)
  if (!cdp) return
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: (mbps * 1e6) / 8, uploadThroughput: (mbps * 1e6) / 8 })
}
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']

const browser = await chromium.launch({ channel: 'chromium', args: GPU })

async function openStory() {
  const ctx = await browser.newContext({ viewport: view, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 })
  let bytes = 0
  ctx.on('requestfinished', async (r) => {
    const s = await r.sizes().catch(() => null)
    if (s) bytes += s.responseBodySize + s.responseHeadersSize
  })
  const page = await ctx.newPage()
  await throttle(page)
  await page.goto(base + '/story')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
  return { ctx, page, bytes: () => bytes }
}

const sampler = () => {
  const w = window
  w.__smooth = { run: true, frames: [], freezes: [], wantAt: 0, have: '', want: '' }
  let last = performance.now()
  const s = w.__smooth
  const f = (t) => {
    s.frames.push(t - last)
    last = t
    const p = w.__scrub
    let have = ''
    const c = document.querySelector('canvas.stage__seq')
    if (c && c.style.opacity === '1' && c.dataset.clip === p?.id) have = `${c.dataset.clip}:${c.dataset.frame}:${c.dataset.mix ?? 0}`
    else {
      const v = [...document.querySelectorAll('video.stage__video')].find((v) => v.style.opacity === '1')
      have = v ? `${v.dataset.clip}:${v.currentTime.toFixed(3)}` : `poster:${p?.id}`
    }
    const want = p?.id ? `${p.id}:${p.target.toFixed(3)}` : ''
    if (have !== s.have) {
      if (s.wantAt) s.freezes.push(t - s.wantAt)
      s.have = have
      s.wantAt = 0
    } else if (want && want !== s.want && !s.wantAt) s.wantAt = t
    // a picture that is not a clip (a still, the globe, the documents) has nothing to keep up with
    if (!p?.id) s.wantAt = 0
    s.want = want
    if (s.run) requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
}

async function scroll(page, pxPerSec, down) {
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  if (mobile)
    return page.evaluate(
      ([max, v, down]) =>
        new Promise((done) => {
          let last = performance.now()
          const step = (t) => {
            window.scrollBy(0, ((t - last) / 1000) * v * (down ? 1 : -1))
            last = t
            if (down ? scrollY >= max - 2 : scrollY <= 1) done()
            else requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
      [max, pxPerSec, down],
    )
  await page.mouse.move(700, 450)
  const dt = 50
  const dy = ((pxPerSec * dt) / 1000) * (down ? 1 : -1)
  for (let n = 0; n < 6000; n++) {
    if (n % 5 === 0) {
      const y = await page.evaluate(() => [scrollY, document.documentElement.scrollHeight - innerHeight])
      if (down ? y[0] >= y[1] - 2 : y[0] <= 1) break
    }
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(dt)
  }
  await page.waitForTimeout(800)
}

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return { median: +s[Math.floor(s.length / 2)]?.toFixed(1), p95: +s[Math.floor(s.length * 0.95)]?.toFixed(1), max: +(s.at(-1) ?? 0).toFixed(0) }
}

const out = { base, profile, net: mbps ? `${mbps} Mbps, ${rtt} ms` : 'unthrottled' }
for (const speed of which === 'both' ? ['slow', 'fast'] : [which]) {
  const { ctx, page, bytes } = await openStory()
  await page.waitForTimeout(3000)
  const before = bytes()
  if (shots && speed === 'slow') {
    mkdirSync(shots, { recursive: true })
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    // reload check: a fresh load sits on chapter 1's first frame
    out.reloadFirstFrame = await page.evaluate(() => ({ y: scrollY, clip: window.__scrub?.id, target: window.__scrub?.target }))
    await page.screenshot({ path: `${shots}/${profile}-0.png` })
    for (const [k, at] of [[1, 0.12], [2, 0.3], [3, 0.55]]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * at))
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${shots}/${profile}-${k}.png` })
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1500)
  }
  await page.evaluate(sampler)
  await scroll(page, speeds[speed], true)
  const down = await page.evaluate(() => {
    const s = window.__smooth
    const r = { frames: s.frames.slice(5), freezes: s.freezes }
    s.frames = []
    s.freezes = []
    return r
  })
  await scroll(page, speeds[speed], false)
  const up = await page.evaluate(() => ((window.__smooth.run = false), { frames: window.__smooth.frames.slice(5), freezes: window.__smooth.freezes }))
  await page.waitForTimeout(500)
  out[speed] = {
    down: { frameMs: stats(down.frames), longestFreezeMs: stats(down.freezes).max },
    up: { frameMs: stats(up.frames), longestFreezeMs: stats(up.freezes).max },
    initialMB: +(before / 1e6).toFixed(2),
    totalMB: +(bytes() / 1e6).toFixed(2),
  }
  console.error(speed, JSON.stringify(out[speed]))
  await ctx.close()
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
