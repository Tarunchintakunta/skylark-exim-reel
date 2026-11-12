import { expect, test, type Page } from '@playwright/test'

/**
 * The reel QA (PROGRESS.md): every page loads without a 404 or a console error; /story on both paths, desktop and phone:
 * scroll down and back up, the canvas follows (lag p95 <= 2 frames, measured as wanted vs drawn frame each animation
 * frame), reload lands on stage 1 frame 0, the first screen stays under 3 MB.
 */
type ReelState = { cur: number; drawn: number; frames: number; decoded: number }
const state = (page: Page) => page.evaluate(() => (globalThis as unknown as { __reel?: { state: ReelState } }).__reel?.state ?? null)

function watch(page: Page) {
  const bad: string[] = []
  page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`))
  page.on('console', (m) => m.type() === 'error' && bad.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message}`))
  return bad
}

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }

for (const page of ['/', '/quote', '/news']) {
  test(`page ${page}: no 404s, no console errors`, async ({ page: p }) => {
    const bad = watch(p)
    await p.goto(page, { waitUntil: 'networkidle' })
    await p.mouse.wheel(0, 3000)
    await p.waitForTimeout(800)
    expect(bad).toEqual([])
  })
}

for (const device of ['desktop', 'phone'] as const) {
  for (const path of ['ocean', 'pond'] as const) {
    test.describe(`${device} ${path}`, () => {
      if (device === 'phone') test.use(PHONE)

      test('first screen, scroll down and up, lag, reload', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium')
        const bad = watch(page)
        let bytes = 0
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Network.enable')
        cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength))
        await page.goto(`/story#${path}`)
        await expect.poll(() => state(page).then((s) => s?.drawn ?? -1), { timeout: 20_000 }).toBe(0)
        await page.waitForTimeout(1500)
        const first = bytes
        console.log(`${device} ${path} first screen ${(first / 1e6).toFixed(2)} MB`)
        expect(first).toBeLessThan(3e6)

        const s0 = (await state(page))!
        // record wanted vs drawn on every animation frame while scrolling
        await page.evaluate(() => {
          const g = globalThis as unknown as { __lag: number[]; __reel: { state: ReelState } }
          g.__lag = []
          const tick = () => {
            const s = g.__reel.state
            g.__lag.push(Math.abs(s.cur - s.drawn))
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        const end = await page.evaluate(() => document.getElementById('story')!.offsetHeight)
        const step = device === 'phone' ? 120 : 100
        for (let y = 0; y < end; y += step * 4) {
          if (device === 'phone') await page.evaluate((d) => scrollBy(0, d), step * 4)
          else for (let k = 0; k < 4; k++) await page.mouse.wheel(0, step)
          await page.waitForTimeout(device === 'phone' ? 110 : 90)
        }
        await page.waitForTimeout(1200)
        const down = (await state(page))!
        expect(down.cur).toBe(s0.frames - 1)
        for (let y = end; y > 0; y -= step * 4) {
          if (device === 'phone') await page.evaluate((d) => scrollBy(0, -d), step * 4)
          else for (let k = 0; k < 4; k++) await page.mouse.wheel(0, -step)
          await page.waitForTimeout(device === 'phone' ? 110 : 90)
        }
        await page.waitForTimeout(1500)
        const up = (await state(page))!
        expect(up.cur).toBe(0)
        const lag = await page.evaluate(() => (globalThis as unknown as { __lag: number[] }).__lag.slice().sort((a, b) => a - b))
        const p95 = lag[Math.floor(lag.length * 0.95)]
        console.log(`${device} ${path} lag p95 ${p95} frames over ${lag.length} samples, frames ${s0.frames}`)
        expect(p95).toBeLessThanOrEqual(2)

        // reload anywhere: back on stage 1, frame 0
        await page.evaluate(() => scrollTo(0, 4000))
        await page.waitForTimeout(500)
        await page.reload()
        await expect.poll(() => state(page).then((s) => s?.drawn ?? -1), { timeout: 20_000 }).toBe(0)
        expect(await page.evaluate(() => scrollY)).toBe(0)
        await expect(page.locator('.reel-cap__eyebrow b')).toHaveText('01')
        expect(bad).toEqual([])
      })
    })
  }
}

test('stage picker flies through the chain to the port', async ({ page }) => {
  await page.goto('/story')
  await expect.poll(() => state(page).then((s) => s?.drawn ?? -1), { timeout: 20_000 }).toBe(0)
  await page.getByRole('button', { name: 'Choose a stage' }).click()
  await page.getByRole('button', { name: /ready\./ }).click()
  await expect(page.locator('.reel-cap__eyebrow b')).toHaveText('04', { timeout: 10_000 })
})
