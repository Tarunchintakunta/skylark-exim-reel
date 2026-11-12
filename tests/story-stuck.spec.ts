import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test'

/**
 * Scroll-film stalls on /story. One test per point of the fix, at 1440×900 and 390×844 (touch through CDP), with no
 * throttle and with 4× CPU + Fast 4G. Each scroll run is made once per profile and shared by the tests that read it.
 * Every run also checks: no html.is-locked after the loader, no non-passive wheel/touchmove listener left by the
 * loader, no console errors. Numbers go to review/stuck-<label>-<profile>.json (STUCK_LABEL=before|after names the file).
 * Runs are cached in test-results/ (cleared by Playwright at the start of every invocation), so a failed test, which
 * restarts the worker, doesn't repeat the scroll.
 *
 * Terms:
 * - poster frame: a frame in a video segment where the clip is not on screen (__scrub.shown false)
 * - frozen: the picture has not changed while the page kept moving (every frame) by more than 5% of the viewport, inside
 *   one video segment
 * - needed: the first frame a clip's segment is on screen; a clip "starts before" when its loadstart is earlier
 */

const FAST_4G = { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false, slow: false },
  'desktop-4x-fast4g': { viewport: { width: 1440, height: 900 }, mobile: false, slow: true },
  phone: { viewport: { width: 390, height: 844 }, mobile: true, slow: false },
  'phone-4x-fast4g': { viewport: { width: 390, height: 844 }, mobile: true, slow: true },
} as const
type Prof = (typeof PROFILES)[keyof typeof PROFILES]
type Mode = 'fling' | 'step' | 'o1' | 'idle'

/** px/s of the fast fling (the brief's ~2,000 px/s wheel) */
const FLING = 2000

/** Injected before any page script. */
function instrument() {
  type Frame = [t: number, y: number, chapter: number, id: string | null, shown: 0 | 1, sig: string]
  const w = window as unknown as {
    __stuck: {
      run: boolean
      frames: Frame[]
      loadstart: Record<string, number>
      loadeddata: Record<string, number>
      long: [number, number][]
      lcp: number
      nonPassive: Map<unknown, string>
    }
    __scrub?: { id: string | null; shown: boolean; chapter: number }
  }
  const m: (typeof w)['__stuck'] = (w.__stuck = { run: false, frames: [], loadstart: {}, loadeddata: {}, long: [], lcp: 0, nonPassive: new Map() })
  const idOf = (v: EventTarget | null) => (v as HTMLVideoElement)?.dataset?.clip || /\/media\/(.+?)_(?:m|\d+)(?:\.(?:av1|hevc))?\.mp4/.exec((v as HTMLVideoElement)?.currentSrc || (v as HTMLVideoElement)?.src || '')?.[1]
  for (const [ev, rec] of [['loadstart', m.loadstart], ['loadeddata', m.loadeddata]] as [string, Record<string, number>][])
    document.addEventListener(ev, (e) => {
      const id = idOf(e.target)
      if (id && !(id in rec)) rec[id] = performance.now()
    }, true)
  new PerformanceObserver((l) => l.getEntries().forEach((e) => m.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (m.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })

  // wheel/touchmove listeners registered with passive: false and still attached
  const add = EventTarget.prototype.addEventListener
  const remove = EventTarget.prototype.removeEventListener
  const key = (t: EventTarget, type: string, fn: unknown) => `${t === window ? 'window' : t === document ? 'document' : 'el'}:${type}:${String(fn).slice(0, 60)}`
  EventTarget.prototype.addEventListener = function (type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions) {
    if ((type === 'wheel' || type === 'touchmove') && typeof o === 'object' && o.passive === false) m.nonPassive.set(fn, key(this, type, fn))
    return add.call(this, type, fn, o)
  }
  EventTarget.prototype.removeEventListener = function (type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | EventListenerOptions) {
    if (type === 'wheel' || type === 'touchmove') m.nonPassive.delete(fn)
    return remove.call(this, type, fn, o)
  }

  // the picture on screen: the shown <video>'s last presented frame, or the poster
  const presented = new WeakMap<HTMLVideoElement, number>()
  const watch = (v: HTMLVideoElement) => {
    const loop = (_: number, meta: VideoFrameCallbackMetadata) => {
      presented.set(v, meta.mediaTime)
      v.requestVideoFrameCallback(loop)
    }
    v.requestVideoFrameCallback?.(loop)
  }
  new MutationObserver(() => document.querySelectorAll<HTMLVideoElement & { __w?: 1 }>('video.stage__video').forEach((v) => {
    if (v.__w) return
    v.__w = 1
    watch(v)
  })).observe(document, { subtree: true, childList: true })
  const step = (t: number) => {
    if (m.run) {
      const p = w.__scrub
      const vids = [...document.querySelectorAll<HTMLVideoElement>('video.stage__video')]
      const k = vids.findIndex((v) => v.style.opacity === '1')
      // desktop frame sequences (#hd2): the stage canvas and the frame it drew
      const cv = document.querySelector<HTMLCanvasElement>('canvas.stage__seq')
      const sig = p?.shown && k >= 0 ? `${k}:${vids[k].currentSrc}:${presented.get(vids[k]) ?? -1}` : p?.shown && cv?.style.opacity === '1' ? `seq:${p.id}:${cv.dataset.frame}` : 'poster'
      // a sequence clip has started loading once its set exists, and has a picture once a frame is in
      for (const q of (window as unknown as { __sequences?: { id: string; progress: number }[] }).__sequences ?? []) {
        if (!q.id.startsWith('stage-')) continue
        const id = q.id.slice(6)
        if (!(id in m.loadstart)) m.loadstart[id] = t
        if (q.progress > 0 && !(id in m.loadeddata)) m.loadeddata[id] = t
      }
      m.frames.push([t, scrollY, p?.chapter ?? -1, p?.id ?? null, p?.shown ? 1 : 0, sig])
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

interface Run {
  chapters: string[]
  frames: [number, number, number, string | null, 0 | 1, string][]
  loadstart: Record<string, number>
  loadeddata: Record<string, number>
  long: [number, number][]
  lcp: number
  nonPassive: string[]
  locked: boolean
  errors: string[]
  bytes: number
  vh: number
  /** __scrubSlots when the build exposes it */
  slots: unknown
}

async function wheelTo(page: Page, dist: number, pxPerSec: number, burst = 0) {
  await page.mouse.move(720, 450)
  const t0 = Date.now()
  let sent = 0
  while (sent < dist) {
    if (burst) {
      for (let k = 0; k < 3 && sent < dist; k++, sent += burst) {
        await page.mouse.wheel(0, burst)
        await page.waitForTimeout(90)
      }
      await page.waitForTimeout(450)
      continue
    }
    const dy = Math.min(dist, ((Date.now() - t0) / 1000) * pxPerSec) - sent
    if (dy > 0) {
      await page.mouse.wheel(0, dy)
      sent += dy
    }
    await page.waitForTimeout(16)
  }
}

/** Touch swipes through CDP: `px` per swipe over `ms`, then `pause` ms. Native scrolling on phones. */
async function swipeTo(cdp: CDPSession, page: Page, to: number, px: number, ms: number, pause: number) {
  const x = 195
  const top = 780
  const steps = 8
  while ((await page.evaluate(() => scrollY)) < to - 4) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: top }] })
    for (let k = 1; k <= steps; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: top - (k * px) / steps }] })
      await page.waitForTimeout(ms / steps)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    if (pause) await page.waitForTimeout(pause)
  }
}

async function run(browser: Browser, prof: Prof, hash: string, mode: Mode): Promise<Run> {
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.mobile, hasTouch: prof.mobile, deviceScaleFactor: prof.mobile ? 3 : +(process.env.DPR ?? 1) })
  await ctx.addInitScript(instrument)
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (prof.slow) {
    await cdp.send('Network.emulateNetworkConditions', FAST_4G)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  let bytes = 0
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength))
  await page.goto('/story' + hash)
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
  // the loader's reveal (mark + hole) runs ~1.2 s after ready
  await page.waitForSelector('#boot', { state: 'detached', timeout: 30_000 })
  if (hash) await page.waitForTimeout(300) // the deep link's jump
  await page.evaluate(() => ((window as unknown as { __stuck: { run: boolean } }).__stuck.run = true))
  const geo = await page.evaluate(() => {
    const top = (id: string) => document.querySelector<HTMLElement>(`[data-chapter="${id}"]`)!
    const s = document.getElementById('story')!
    return { end: s.offsetTop + s.offsetHeight - innerHeight, o1End: top('o1') ? top('o1').offsetTop + top('o1').offsetHeight : 0, y: scrollY }
  })
  if (mode === 'idle') await page.waitForTimeout(4000)
  else if (mode === 'o1') {
    // straight after the reveal, slowly through the first chapter (> 5 s), like a reader
    const dist = geo.o1End - geo.y + 10
    if (prof.mobile) await swipeTo(cdp, page, geo.o1End + 10, 60, 160, 120)
    else await wheelTo(page, dist, 220)
    await page.waitForTimeout(800)
  } else if (mode === 'fling') {
    if (prof.mobile) await swipeTo(cdp, page, geo.end, 700, 160, 0)
    else await wheelTo(page, geo.end - geo.y, FLING)
    await page.waitForTimeout(2000)
  } else {
    if (prof.mobile) await swipeTo(cdp, page, geo.end, 300, 200, 600)
    else await wheelTo(page, geo.end - geo.y, 0, 100)
    await page.waitForTimeout(2000)
  }
  const r = await page.evaluate(() => {
    const m = (window as unknown as { __stuck: Omit<Run, 'nonPassive'> & { nonPassive: Map<unknown, string> } }).__stuck
    return {
      chapters: [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => el.dataset.chapter!),
      frames: m.frames,
      loadstart: m.loadstart,
      loadeddata: m.loadeddata,
      long: m.long,
      lcp: m.lcp,
      nonPassive: [...m.nonPassive.values()],
      locked: document.documentElement.classList.contains('is-locked'),
      vh: innerHeight,
      slots: (window as unknown as { __scrubSlots?: unknown }).__scrubSlots ?? null,
    }
  })
  await ctx.close()
  return { ...r, errors, bytes }
}

/** Per-run numbers for the PR table and the assertions. */
function analyse(r: Run) {
  const segs: { key: string; id: string; frames: number; shown: number }[] = []
  let frozenMax = 0
  let frozenAt = ''
  let lastSig = ''
  let since = 0
  let yAt = 0
  let seg = ''
  let prevY = NaN
  const needed: Record<string, number> = {}
  for (const [t, y, ch, id, shown, sig] of r.frames) {
    const still = y === prevY
    prevY = y
    if (!id) {
      seg = ''
      continue
    }
    const key = `${r.chapters[ch]}:${id}`
    if (!(id in needed)) needed[id] = t
    if (key !== seg) {
      seg = key
      segs.push({ key, id, frames: 0, shown: 0 })
      lastSig = sig
      since = t
      yAt = y
    }
    const s = segs[segs.length - 1]
    s.frames++
    s.shown += shown
    if (sig !== lastSig || still) {
      lastSig = sig
      since = t
      yAt = y
    } else if (Math.abs(y - yAt) > 0.05 * r.vh && t - since > frozenMax) {
      frozenMax = t - since
      frozenAt = key
    }
  }
  const all = segs.reduce((a, s) => a + s.frames, 0)
  const poster = segs.reduce((a, s) => a + s.frames - s.shown, 0)
  const ids = Object.keys(needed)
  const started = ids.filter((id) => (r.loadstart[id] ?? Infinity) < needed[id])
  const ready = ids.filter((id) => (r.loadeddata[id] ?? Infinity) < needed[id])
  // long tasks entering the world chapter (from the sea chapter on), and from the documentation chapter, where the globe
  // starts to warm up (chunks and texture there, the canvas mounts in the port chapter)
  const from = (id: string) => r.frames.find((f) => r.chapters[f[2]] === id)?.[0] ?? Infinity
  const longFrom = (t0: number) => r.long.filter(([t]) => t >= t0).map(([, d]) => Math.round(d))
  // scroll speed over the moving part of the run (first move to the furthest point)
  const yMax = Math.max(...r.frames.map((f) => f[1]))
  const first = r.frames.find((f) => f[1] !== r.frames[0][1])
  const last = r.frames.find((f) => f[1] >= yMax - 1)
  const t0 = first?.[0] ?? 0
  const t1 = last?.[0] ?? 0
  return {
    posterPct: all ? +((100 * poster) / all).toFixed(1) : 0,
    frozenMaxMs: Math.round(frozenMax),
    frozenAt,
    clipsStartedBefore: `${started.length}/${ids.length}`,
    clipsReadyBefore: `${ready.length}/${ids.length}`,
    lateStart: ids.filter((id) => !started.includes(id)),
    globeLongTasks: longFrom(from('sea')),
    warmLongTasks: longFrom(from('docs')),
    fullMB: +(r.bytes / 1048576).toFixed(2),
    pxPerSec: t1 > t0 ? Math.round(((last![1] - first![1]) * 1000) / (t1 - t0)) : 0,
    worstSegments: segs.filter((s) => s.frames && s.shown / s.frames < 0.9).map((s) => `${s.key} ${Math.round((100 * s.shown) / s.frames)}% of ${s.frames}`),
    lcp: Math.round(r.lcp),
  }
}

/** The common checks, on every run. */
function hygiene(r: Run, label: string, prof: Prof) {
  expect.soft(r.locked, `${label}: html.is-locked after the loader`).toBe(false)
  // Lenis (desktop smooth wheel) owns one non-passive wheel and one touchmove listener on window by design; phones have none
  const own = r.nonPassive.filter((k) => !k.startsWith('window:wheel') && !k.startsWith('window:touchmove'))
  expect.soft(own, `${label}: non-passive wheel/touchmove listeners`).toEqual([])
  expect.soft(r.nonPassive.length, `${label}: non-passive wheel/touchmove listeners`).toBeLessThanOrEqual(prof.mobile ? 0 : 2)
  expect.soft(r.errors, `${label}: console errors`).toEqual([])
}

for (const [name, prof] of Object.entries(PROFILES)) {
  test.describe(`story stuck ${name}`, () => {
    const get = async (browser: Browser, hash: string, mode: Mode): Promise<Run> => {
      const f = `test-results/stuck-cache/${name}${hash}-${mode}.json`
      if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
      // STUCK_REUSE=1: re-derive the numbers from the raw runs of an earlier invocation
      const raw = `review/stuck-raw-${process.env.STUCK_LABEL ?? 'run'}/${name}${hash}-${mode}.json`
      if (process.env.STUCK_REUSE && existsSync(raw)) return JSON.parse(readFileSync(raw, 'utf8'))
      const r = await run(browser, prof, hash, mode)
      mkdirSync('test-results/stuck-cache', { recursive: true })
      writeFileSync(f, JSON.stringify(r))
      // the raw run too, so the numbers can be re-derived later
      mkdirSync(`review/stuck-raw-${process.env.STUCK_LABEL ?? 'run'}`, { recursive: true })
      writeFileSync(`review/stuck-raw-${process.env.STUCK_LABEL ?? 'run'}/${name}${hash}-${mode}.json`, JSON.stringify(r))
      return r
    }
    const save = (k: string, v: unknown) => {
      const f = `review/stuck-${process.env.STUCK_LABEL ?? 'run'}-${name}.json`
      mkdirSync('review', { recursive: true })
      const all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
      writeFileSync(f, JSON.stringify({ ...all, [k]: v }, null, 2))
    }

    test('1 · a clip mid-seek is not marked dead: o1 stays on screen for > 5 s', async ({ browser }) => {
      test.setTimeout(300_000)
      const r = await get(browser, '#ocean', 'o1')
      hygiene(r, 'o1', prof)
      const o1 = r.chapters.indexOf('o1')
      const frames = r.frames.filter((f) => f[2] === o1)
      const first = frames.findIndex((f) => f[4])
      const span = frames.length ? frames.at(-1)![0] - frames[0][0] : 0
      const dropped = first < 0 ? frames.length : frames.slice(first).filter((f) => !f[4]).length
      save('o1', { ms: Math.round(span), frames: frames.length, droppedAfterFirstShown: dropped })
      expect(span, 'time spent in o1 (ms)').toBeGreaterThan(5000)
      expect(first, 'o1 clip shown at all').toBeGreaterThanOrEqual(0)
      expect(dropped, 'o1 frames on the poster after the clip was shown').toBe(0)
    })

    for (const path of ['ocean', 'pond'] as const) {
      test(`2 · prefetch by distance, ${path} fling: clips start before their segment, ≥ 90% clip frames`, async ({ browser }) => {
        test.setTimeout(300_000)
        const r = await get(browser, `#${path}`, 'fling')
        hygiene(r, `${path} fling`, prof)
        const a = analyse(r)
        save(`${path}-fling`, a)
        console.log(name, path, 'fling', JSON.stringify(a))
        expect.soft(a.lateStart, 'clips whose loadstart came after their segment').toEqual([])
        expect.soft(a.worstSegments, 'segments with the clip on screen < 90% of frames').toEqual([])
      })

      test(`4 · no frozen frame, ${path} fling: the picture never sits still > 400 ms while the page moves`, async ({ browser }) => {
        test.setTimeout(300_000)
        const a = analyse(await get(browser, `#${path}`, 'fling'))
        expect(a.frozenMaxMs, `longest frozen picture (${a.frozenAt})`).toBeLessThanOrEqual(400)
      })

      // targets: none on desktop (no throttle); at most one, under 100 ms, on a phone at 4x CPU; the rest is reported
      test(`6 · globe: long tasks entering world, ${path} fling`, async ({ browser }) => {
        test.setTimeout(300_000)
        const a = analyse(await get(browser, `#${path}`, 'fling'))
        if (prof.mobile && prof.slow) {
          expect(a.globeLongTasks.length, `long tasks ${a.globeLongTasks}`).toBeLessThanOrEqual(1)
          expect(Math.max(0, ...a.globeLongTasks), 'longest task (ms)').toBeLessThan(100)
        } else if (!prof.mobile && !prof.slow) expect(a.globeLongTasks, 'long tasks > 50 ms from the sea chapter to world').toEqual([])
      })
    }

    test('4 · no frozen frame, /story step scroll', async ({ browser }) => {
      test.setTimeout(600_000)
      const r = await get(browser, '', 'step')
      hygiene(r, 'step', prof)
      const a = analyse(r)
      save('story-step', a)
      console.log(name, 'step', JSON.stringify(a))
      expect.soft(a.worstSegments, 'segments with the clip on screen < 90% of frames').toEqual([])
      expect(a.frozenMaxMs, `longest frozen picture (${a.frozenAt})`).toBeLessThanOrEqual(400)
    })

    for (const hash of ['', '#pond'])
      test(`5 · after the reveal, /story${hash} fetches its first clips before the first scroll; LCP ≤ 2,500 ms`, async ({ browser }) => {
        test.setTimeout(120_000)
        const r = await get(browser, hash, 'idle')
        hygiene(r, `idle ${hash}`, prof)
        const want = hash ? ['cg-ponds'] : ['cg-depart-1']
        save(`idle${hash}`, { loadstart: r.loadstart, lcp: Math.round(r.lcp), slots: r.slots })
        for (const id of want) expect.soft(r.loadstart[id], `${id} loadstart`).toBeGreaterThan(0)
        expect.soft(r.lcp, 'LCP (ms)').toBeLessThanOrEqual(2500)
      })

    test('7 · __scrubSlots is exposed to tests', async ({ browser }) => {
      test.setTimeout(120_000)
      const r = await get(browser, '#pond', 'idle')
      const slots = r.slots as { id: string | null; readyState: number; ready: boolean; dead: boolean; painted: boolean }[]
      expect(slots, '__scrubSlots').not.toBeNull()
      expect(slots.length, 'decoder pool').toBe(prof.mobile ? 4 : 5)
      for (const s of slots) expect(Object.keys(s).sort()).toEqual(['dead', 'id', 'painted', 'ready', 'readyState'])
      // a desktop opens on the frame set, not a decoder
      if (prof.mobile) expect(slots.find((s) => s.id === 'cg-ponds')?.readyState, 'first clip decoded').toBeGreaterThanOrEqual(2)
    })
  })
}

test('3 · every video segment is at least 90vh of desktop scroll', async () => {
  Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: 1440 })
  const { OCEAN, POND } = await import('../src/config/chapters')
  const { toSegments } = await import('../src/film/segments')
  const short: string[] = []
  for (const list of [OCEAN, POND])
    for (const s of toSegments(list)) {
      const vh = (s.to - s.from) * list[s.chapter].vh
      if (s.media.kind === 'video' && vh < 90) short.push(`${list[s.chapter].id}:${s.media.id} ${vh.toFixed(0)}vh`)
    }
  expect(short).toEqual([])
})
