import { expect, test, type Page } from '@playwright/test'

/**
 * The film follows the scroll in both directions. The top of /story is the path's first clip (o1 / p1) on its first
 * frame, still, at y = 0: there is no city view above it to scroll back up to. Once the story has moved, scrolling
 * up rewinds the picture and scrolling down again moves on from that frame.
 * Desktop 1440×900 (Lenis wheel) and phone 390×844 (touch emulation, native scroll), both paths.
 */
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const

type Sample = { y: number; dir: number; chapter: number; id: string | null; t: number; frame: number; shown: boolean }

/** every animation frame: the scroll, the chapter the stage shows, and the picture's own time (decoder or canvas frame) */
function record() {
  const w = window as unknown as { __fwd: Sample[]; __scrub: { id: string | null; chapter: number; shown: boolean } }
  w.__fwd = []
  let last = 0
  const loop = () => {
    const y = scrollY
    const v = [...document.querySelectorAll<HTMLVideoElement>('.stage video')].find((x) => x.style.opacity === '1')
    const c = document.querySelector<HTMLCanvasElement>('canvas.stage__seq')
    const s = w.__scrub
    w.__fwd.push({
      y,
      dir: Math.sign(y - last),
      chapter: s?.chapter ?? -1,
      id: s?.id ?? null,
      t: v && v.dataset.clip === s?.id ? v.currentTime : -1,
      frame: c && c.style.opacity === '1' ? Number(c.dataset.frame ?? -1) : -1,
      shown: !!s?.shown,
    })
    last = y
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

async function open(page: Page, hash = '') {
  await page.goto(`/story${hash}`)
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && !document.getElementById('boot'))
  await page.evaluate(record)
}

async function wheel(page: Page, dy: number, steps: number, gap: number) {
  for (let k = 0; k < steps; k++) {
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(gap)
  }
  // let Lenis settle (a jump with scrollTo while it is still easing would be overridden by its own target)
  await page.waitForFunction(() => !document.documentElement.classList.contains('lenis-scrolling'))
  await page.waitForTimeout(300)
}

type Shot = { y: number; chapter: number; id: string | null; local: number; time: number }

async function shot(page: Page): Promise<Shot> {
  return page.evaluate(() => {
    const s = (window as unknown as { __scrub: { id: string | null; chapter: number; local: number } }).__scrub
    const v = [...document.querySelectorAll<HTMLVideoElement>('.stage video')].find((x) => x.style.opacity === '1')
    return {
      y: scrollY,
      chapter: s.chapter,
      id: s.id,
      local: s.local,
      time: v && v.dataset.clip === s.id ? v.currentTime : -1,
    }
  })
}

/** Earlier chapter, or the same chapter further back through its scroll. */
const rewound = (from: Shot, to: Shot) => to.chapter < from.chapter || (to.chapter === from.chapter && to.local < from.local - 0.05)

/** Further on than `from`, still short of the point the scroll had reached before. */
const resumed = (from: Shot, to: Shot) => to.chapter > from.chapter || (to.chapter === from.chapter && to.local > from.local + 0.03)

for (const [name, view] of Object.entries(VIEWS)) {
  test.describe(name, () => {
    test.use(view)

    for (const [hash, first] of [['', 'cg-depart-1'], ['#ocean', 'cg-depart-1'], ['#pond', 'cg-ponds']])
      test(`top of /story${hash}: ${first} on its first frame at y = 0, and a scroll up goes nowhere`, async ({ page }) => {
        await open(page, hash)
        await page.waitForTimeout(2000)
        const top = () =>
          page.evaluate(() => ({
            y: scrollY,
            hero: document.querySelectorAll('.hero').length,
            chapter: (window as unknown as { __scrub: { chapter: number } }).__scrub.chapter,
            // any decoder that shows a picture is the path's first clip, on frame 0
            shown: [...document.querySelectorAll<HTMLVideoElement>('.stage video')].filter((v) => v.style.opacity === '1').map((v) => [v.dataset.clip, v.currentTime]),
          }))
        const t = await top()
        expect(t.y).toBe(0)
        expect(t.hero).toBe(0)
        expect(t.chapter).toBe(0)
        for (const [id, at] of t.shown) expect([id, at]).toEqual([first, 0])
        if (name === 'desktop') await page.mouse.wheel(0, -600)
        else await page.evaluate(() => scrollBy(0, -600))
        await page.waitForTimeout(600)
        const u = await top()
        expect(u.y).toBe(0)
        expect(u.chapter).toBe(0)
      })

    for (const hash of ['#ocean', '#pond'])
      test(`${hash}: scroll up rewinds the picture and scroll down resumes before the old point`, async ({ page }) => {
        test.setTimeout(180_000)
        await open(page, hash)
        await page.evaluate(() => scrollTo(0, 0))
        await page.waitForTimeout(600)
        await page.evaluate(record)
        await wheel(page, 140, 20, 70)
        const down = (await page.evaluate(() => (window as unknown as { __fwd: Sample[] }).__fwd)) as Sample[]
        let back = 0
        for (let k = 1; k < down.length; k++) {
          const [a, b] = [down[k - 1], down[k]]
          if (b.chapter < a.chapter) back++
          if (a.id === b.id && b.dir >= 0 && a.t >= 0 && b.t >= 0 && b.t < a.t - 1 / 12) back++
        }
        expect(back, 'picture went back while scrolling down').toBe(0)
        const moving = down.filter((s, k) => k > 0 && Math.abs(s.y - down[k - 1].y) > 2 && s.id)
        const shownWhileMoving = moving.filter((s) => s.shown).length
        expect(moving.length, 'the scroll produced video samples').toBeGreaterThan(8)
        expect(shownWhileMoving / moving.length, 'the clip stayed on its poster while scrolling down').toBeGreaterThan(0.35)

        const deep = await shot(page)
        expect(deep.y, 'the page scrolled down').toBeGreaterThan(600)
        expect(deep.chapter, 'the story left the opening').toBeGreaterThan(0)

        await wheel(page, -140, 16, 70)
        const up = await shot(page)
        expect(up.y, 'the page scrolled back up').toBeLessThan(deep.y - 300)
        expect(rewound(deep, up), `picture stayed on chapter ${deep.chapter} (${deep.id} @ ${deep.time.toFixed(2)}s) while the page returned to ${up.y}`).toBe(true)
        if (deep.id && deep.id === up.id && deep.time >= 0 && up.time >= 0)
          expect(up.time, 'the same clip did not rewind').toBeLessThan(deep.time - 0.15)

        await wheel(page, 140, 8, 70)
        const again = await shot(page)
        expect(again.y, 'scroll down moved the page').toBeGreaterThan(up.y + 150)
        expect(again.y, 'scroll down resumed before the old furthest point').toBeLessThan(deep.y - 40)
        expect(resumed(up, again), `picture stayed on chapter ${up.chapter} (${up.id} @ ${up.time.toFixed(2)}s) while the page moved to ${again.y}`).toBe(true)
        if (up.id && up.id === again.id && up.time >= 0 && again.time >= 0)
          expect(again.time, 'the same clip did not move on').toBeGreaterThan(up.time + 0.08)
      })

    test('refresh mid-story lands on the first frame at the top', async ({ page }) => {
      await open(page)
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 3))
      await page.waitForTimeout(800)
      await page.reload()
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
      await page.waitForTimeout(1500)
      const s = await page.evaluate(() => ({ y: scrollY, s: (window as unknown as { __scrub: { chapter: number; target: number } }).__scrub }))
      expect(s.y).toBe(0)
      expect(s.s.chapter).toBe(0)
      expect(s.s.target).toBe(0)
    })
  })
}
