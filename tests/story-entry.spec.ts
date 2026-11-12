import { expect, test, type Browser, type Page } from '@playwright/test'
import { readdirSync } from 'node:fs'

// #268: the story entry after the homepage hero. Three bento cards; one grows to the viewport with its facts, then
// shrinks back to its cell with the page where it was.

const CARDS = [
  { id: 'wild', path: 'ocean', first: 'o1', heading: 'Wild catch' },
  { id: 'farmed', path: 'pond', first: 'p1', heading: 'Farmed shrimp' },
  { id: 'world', path: null, first: null, heading: /Trusted in \d+ markets/ },
] as const

const ready = async (page: Page) => {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.waitForSelector('#boot', { state: 'detached' })
}

/** the homepage, scrolled so the section fills the viewport */
async function atSection(page: Page) {
  await page.goto('/')
  await ready(page)
  await page.locator('#story-entry').waitFor()
  await page.evaluate(() => document.getElementById('story-entry')!.scrollIntoView())
  await page.waitForTimeout(600)
}

const card = (page: Page, id: string) => page.locator(`[data-card="${id}"]`)
/** a hover with real mouse movement: the card only reacts to a mouse that moves (StoryEntry.tsx `move`) */
async function hoverCard(page: Page, id: string) {
  const hit = card(page, id).locator('.se-hit')
  await hit.hover({ position: { x: 60, y: 60 } })
  const b = (await hit.boundingBox())!
  await page.mouse.move(b.x + 80, b.y + 80, { steps: 4 })
}
const isOpen = (page: Page, id: string) => card(page, id).evaluate((el) => el.classList.contains('is-open'))
/** settled: the grow / shrink is 650 ms, the facts finish ~1 s after the click */
const settle = (page: Page) => page.waitForTimeout(1300)

const phone = (browser: Browser) => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

for (const c of CARDS) {
  test(`${c.id}: opens to the viewport with its facts, Esc shrinks it back to the same scroll`, async ({ page }) => {
    await atSection(page)
    const hit = card(page, c.id).locator('.se-hit')
    // Playwright scrolls a target into view before acting on it: read the page's position after that
    await hit.hover()
    const y = await page.evaluate(() => scrollY)
    await expect(hit).toHaveAttribute('aria-expanded', 'false')
    await hit.click()
    await settle(page)
    await expect(hit).toHaveAttribute('aria-expanded', 'true')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(c.heading)
    await expect(dialog.locator('.se-widget')).toHaveCount(6)
    const box = await card(page, c.id).boundingBox()
    expect(box).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
    await page.keyboard.press('Escape')
    await settle(page)
    expect(await isOpen(page, c.id)).toBe(false)
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => scrollY)).toBe(y)
    await expect(hit).toBeFocused()
    // the card is back in its cell, with the cell's 16 px corners
    const radius = await card(page, c.id).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
    expect(radius).toBe('16px')
  })
}

test('Back, the close button and a click on the open card\'s empty space each close it', async ({ page }) => {
  await atSection(page)
  for (const close of [
    () => page.getByRole('dialog').getByRole('button', { name: 'Back' }).click(),
    () => page.getByRole('dialog').getByRole('button', { name: 'Close' }).click(),
    () => page.mouse.click(720, 60),
  ]) {
    await card(page, 'farmed').locator('.se-hit').click()
    await settle(page)
    expect(await isOpen(page, 'farmed')).toBe(true)
    await close()
    await settle(page)
    expect(await isOpen(page, 'farmed')).toBe(false)
  }
})

test('keyboard: Enter opens, focus is trapped in the open card, Esc returns focus to the card', async ({ page }) => {
  await atSection(page)
  const hit = card(page, 'wild').locator('.se-hit')
  await hit.focus()
  await page.keyboard.press('Enter')
  await settle(page)
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeFocused()
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await inside()).toBe(true)
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inside()).toBe(true)
  }
  await page.keyboard.press('Escape')
  await settle(page)
  await expect(hit).toBeFocused()
  await expect(hit).toHaveAttribute('aria-expanded', 'false')
})

test('reduced motion: a crossfade only, no loops, no floating facts', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const clips: string[] = []
  // the card loops, played by a <video> (the path prefetch on hover and the homepage's story warm-up are fetches, not loops)
  page.on('request', (r) => r.resourceType() === 'media' && /\/hf-(catch-card|sample)_[^/]*\.mp4(\?|$)/.test(r.url()) && clips.push(r.url()))
  await atSection(page)
  await card(page, 'wild').locator('.se-hit').hover()
  await card(page, 'wild').locator('.se-hit').click()
  // the card is full screen at once: no grow, only its opacity moves
  const box = await card(page, 'wild').boundingBox()
  expect(box).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
  await settle(page)
  const moved = await page.locator('.se-widget').evaluateAll((els) => els.filter((el) => getComputedStyle(el).transform !== 'none').length)
  expect(moved).toBe(0)
  await page.mouse.move(100, 100, { steps: 5 })
  await page.mouse.move(1300, 800, { steps: 5 })
  expect(await page.locator('.se-widget').evaluateAll((els) => els.filter((el) => getComputedStyle(el).transform !== 'none').length)).toBe(0)
  expect(clips).toEqual([])
  await ctx.close()
})

for (const c of CARDS.filter((c) => c.path)) {
  test(`${c.id}: "Enter the story" lands on /story#${c.path} at ${c.first}`, async ({ page }) => {
    const chapterOnScreen = () =>
      page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-chapter]')].find((el) => {
        const r = el.getBoundingClientRect()
        return r.top <= 2 && r.bottom > 2
      })?.dataset.chapter)
    await atSection(page)
    await hoverCard(page, c.id)
    // hovering the card warms its path: the story chunk and that path's first clip
    await expect(page.locator(`link[rel="prefetch"][href*="/media/${c.path === 'ocean' ? 'cg-depart-1' : 'cg-ponds'}_"][href*=".mp4"]`)).toHaveCount(1)
    await card(page, c.id).locator('.se-hit').click()
    await settle(page)
    await page.getByRole('dialog').getByRole('link', { name: 'Enter the story', exact: true }).click()
    await page.waitForURL(new RegExp(`/story#${c.path}$`))
    await expect.poll(chapterOnScreen, { timeout: 15_000 }).toBe(c.first)
  })
}

test('phone: stacked cards, a tap opens the sheet with its facts in two columns, close returns to the same scroll', async ({ browser }) => {
  const ctx = await phone(browser)
  const page = await ctx.newPage()
  await atSection(page)
  const widths = await page.locator('.se-cell').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)))
  expect(widths).toEqual([24, 24, 24])
  await page.evaluate(() => document.querySelector('[data-card="farmed"]')!.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  const y = await page.evaluate(() => scrollY)
  await card(page, 'farmed').locator('.se-hit').tap()
  await settle(page)
  const cols = await page.locator('.se-panel:not([hidden]) .se-widgets').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(cols).toBe(2)
  // the open sheet is portrait: the 9:16 crop (in the near-square grid card a landscape tier covers more pixels)
  await expect.poll(() => card(page, 'farmed').locator('img').evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/cg-sample_m\./)
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).tap()
  await settle(page)
  expect(await isOpen(page, 'farmed')).toBe(false)
  expect(await page.evaluate(() => scrollY)).toBe(y)
  await ctx.close()
})

/** rAF intervals while a card opens and closes, ms */
async function frameTimes(page: Page, id: string) {
  await page.evaluate(() => {
    const w = window as unknown as { __ft: number[]; __on: boolean }
    w.__ft = []
    w.__on = true
    let last = performance.now()
    const step = (t: number) => {
      w.__ft.push(t - last)
      last = t
      if (w.__on) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  await card(page, id).locator('.se-hit').click()
  await settle(page)
  await page.keyboard.press('Escape')
  await settle(page)
  const ft = await page.evaluate(() => {
    const w = window as unknown as { __ft: number[]; __on: boolean }
    w.__on = false
    return w.__ft.slice(2)
  })
  const sorted = [...ft].sort((a, b) => a - b)
  return { p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1], n: ft.length }
}

// 60 fps: p95 of the frame interval within a frame (16.7 ms) plus 10 % for timer jitter. Desktop, and a phone at 4×
// CPU throttle standing in for a mid Android. GPU=1 runs it on the real GPU (headless SwiftShader paints in software).
for (const profile of ['desktop', 'mobile'] as const) {
  test(`open/close stays at 60 fps on ${profile}`, async ({ browser }) => {
    const ctx = profile === 'desktop' ? await browser.newContext({ viewport: { width: 1440, height: 900 } }) : await phone(browser)
    const page = await ctx.newPage()
    // the transition's own cost, without the loops: headless Chromium paces requestAnimationFrame at 30 Hz whenever a
    // <video> plays, which a real browser does not (desktop Chrome with the loops playing: p95 9 ms at 120 Hz, #268)
    await page.route(/\.mp4(\?|$)/, (r) => r.abort())
    await atSection(page)
    if (profile === 'mobile') await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const runs = []
    for (const c of CARDS) runs.push({ card: c.id, ...(await frameTimes(page, c.id)) })
    console.log(profile, JSON.stringify(runs.map((r) => ({ ...r, p95: +r.p95.toFixed(1), max: +r.max.toFixed(1) }))))
    for (const r of runs) expect(r.p95, `${r.card} p95 frame`).toBeLessThanOrEqual(16.7 * 1.1)
    await ctx.close()
  })
}

// budgets: the section adds at most 1.5 MB at first load (its two stills; the loops wait for hover or view), each
// still ≤ 250 KB; the homepage keeps LCP ≤ 2.3 s and CLS 0
for (const profile of ['desktop', 'mobile'] as const) {
  test(`weight and vitals on ${profile}`, async ({ browser }) => {
    const ctx = profile === 'desktop' ? await browser.newContext({ viewport: { width: 1440, height: 900 } }) : await phone(browser)
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    const files: [string, number][] = []
    page.on('requestfinished', async (r) => {
      // the story warm-up after the intro (home/prefetch.ts warmStory) is a fetch for /story, not the section's weight
      if (r.resourceType() === 'fetch') return
      const s = await r.sizes().catch(() => null)
      if (s) files.push([r.url(), s.responseBodySize])
    })
    await page.addInitScript(() => {
      const w = window as unknown as { __v: { lcp: number; cls: number } }
      w.__v = { lcp: 0, cls: 0 }
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__v.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => {
          const s = e as PerformanceEntry & { hadRecentInput: boolean; value: number }
          if (!s.hadRecentInput) w.__v.cls += s.value
        }),
      ).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    await ready(page)
    // the homepage warms its lazy images once the browser is idle (home/prefetch.ts): wait for that
    await page.waitForTimeout(4000)
    const mine = files.filter(([u]) => /\/media\/hf-(catch-card|sample-card|sample)_/.test(u))
    const bytes = mine.reduce((a, [, b]) => a + b, 0)
    const v = await page.evaluate(() => (window as unknown as { __v: { lcp: number; cls: number } }).__v)
    console.log(profile, `story entry ${(bytes / 1e6).toFixed(2)} MB`, mine.map(([u, b]) => `${u.replace(/^.*\/media\//, '')} ${Math.round(b / 1024)} KB`).join(', '), `LCP ${Math.round(v.lcp)} ms CLS ${v.cls}`)
    expect(mine.filter(([u]) => /\.mp4/.test(u))).toEqual([])
    expect(bytes).toBeLessThanOrEqual(1.5e6)
    for (const [u, b] of mine) expect(b, u).toBeLessThanOrEqual(250 * 1024)
    expect(v.lcp).toBeLessThanOrEqual(2300)
    expect(v.cls).toBe(0)
    await ctx.close()
  })
}

/**
 * Media sharpness (#268): every card's still and playing loop, grid and open, at each screen. A frame drawn larger than
 * its native pixels (object-fit cover, device pixels) fails when the clip has a larger file that should have been
 * picked; where the clip has nothing larger (the crate-free wild cut is 1920 native, the phone crops 670 / 810 wide) the
 * upscale is listed, not failed, so the PR can show it.
 */
const SCREENS = [
  { name: '1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: '1440@2x', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: '2560', viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 },
  { name: '390@3x', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
]
for (const sc of SCREENS) {
  test(`no card media is drawn above its native size where a larger file exists, ${sc.name}`, async ({ browser }) => {
    test.setTimeout(180_000)
    const { name, ...opts } = sc
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await atSection(page)
    // every tier on disk for each clip: what "a larger file exists" is checked against
    const measure = (state: string) =>
      page.evaluate(async (state) => {
        const dpr = devicePixelRatio
        // a srcset image's naturalWidth is divided by its density: load the file on its own for its real pixels
        const pixels = (src: string) =>
          new Promise<[number, number]>((done) => {
            const i = new Image()
            i.onload = () => done([i.naturalWidth, i.naturalHeight])
            i.src = src
          })
        const els = [...document.querySelectorAll<HTMLElement>('.se-card')].flatMap((card) =>
          [...card.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img.se-media__still, video.se-media__loop.is-on')].map((el) => ({ card, el })),
        )
        const rows = []
        for (const { card, el } of els) {
          const r = el.getBoundingClientRect()
          if (!el.currentSrc || !r.width || (state === 'open' && !card.classList.contains('is-open'))) continue
          const [nw, nh] = el instanceof HTMLImageElement ? await pixels(el.currentSrc) : [el.videoWidth, el.videoHeight]
          if (!nw) continue
          // object-fit cover: the frame is scaled to the larger of the two ratios
          const scale = Math.max((r.width * dpr) / nw, (r.height * dpr) / nh)
          rows.push({ state, card: card.dataset.card!, file: el.currentSrc.replace(/^.*\/media\//, '').replace(/\?.*$/, ''), native: `${nw}×${nh}`, scale: +scale.toFixed(2) })
        }
        return rows
      }, state)
    const rows = []
    for (const c of CARDS.filter((c) => c.id !== 'world')) {
      await hoverCard(page, c.id)
      await page.waitForTimeout(1500)
      rows.push(...(await measure('grid')).filter((r) => r.card === c.id))
      await card(page, c.id).locator('.se-hit').click()
      await page.waitForTimeout(2500)
      rows.push(...(await measure('open')))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1300)
    }
    const media = readdirSync('public/media')
    const width = (f: string) => {
      const t = f.match(/_(m|\d+)(\.(av1|hevc))?\.(mp4|avif|webp)$/)![1]
      return t === 'm' ? 0 : +t
    }
    // a phone crop has no larger crop: the desktop tiers are another framing, not a bigger copy of it
    const larger = (file: string) => {
      if (/_m(\.(av1|hevc))?\.(mp4|avif|webp)$/.test(file)) return false
      const [, id, ext] = file.match(/^(.*)_(?:m|\d+)((?:\.(?:av1|hevc))?\.(?:mp4|avif|webp))$/)!
      return media.some((f) => f.startsWith(`${id}_`) && f.endsWith(ext) && !f.includes('_end_') && width(f) > width(file))
    }
    const flagged = rows.filter((r) => r.scale > 1.01)
    console.log(name, JSON.stringify(rows))
    if (flagged.length) console.log(name, 'drawn above native (source-limited):', JSON.stringify(flagged.filter((r) => !larger(r.file))))
    expect(flagged.filter((r) => larger(r.file))).toEqual([])
    await ctx.close()
  })
}

// from the parallel phase-2 pass on this branch (ff0c71e, b47224e): Europe reads as a region, and the phone sheet
// scrolls its last widget clear of the bottom safe area
test('Europe is labelled as a region, not listed as a country', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const world = card(page, 'world')
  const text = await world.locator('.se-widgets').innerText()
  expect(text).toContain('Europe (region)')
  expect(text.split('·').map((s) => s.trim())).not.toContain('Europe')
  await expect(world.locator('.se-heading')).toHaveText(/Trusted in 15 markets/)
})

test('phone: the open sheet scrolls all six widgets fully into view above the safe area', async ({ browser }) => {
  const ctx = await phone(browser)
  const page = await ctx.newPage()
  await page.goto('/')
  await ready(page)
  for (const id of ['wild', 'farmed', 'world']) {
    const c = card(page, id)
    await c.scrollIntoViewIfNeeded()
    await c.locator('.se-hit').tap()
    const panel = c.locator('.se-panel')
    await expect(panel).toBeVisible()
    await settle(page)
    const last = c.locator('.se-widget').last()
    await last.evaluate((el) => el.scrollIntoView({ block: 'end' }))
    await page.waitForTimeout(300)
    await expect(last).toBeInViewport({ ratio: 1 })
    const [w, p] = await Promise.all([last.boundingBox(), panel.boundingBox()])
    expect(p!.y + p!.height - (w!.y + w!.height)).toBeGreaterThanOrEqual(24)
    await c.locator('.se-close').tap()
    await settle(page)
  }
  await ctx.close()
})
