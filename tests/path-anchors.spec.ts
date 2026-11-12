import { devices, expect, test, type Page } from '@playwright/test'

/**
 * #ocean / #pond deep links and the header path toggle land on that path's first chapter (#210),
 * showing its own heading and Higgsfield clip.
 */
const PATHS = {
  ocean: { hash: '#ocean', toggle: 'Wild catch', chapter: 'o1', title: 'Before the harbour wakes.', clip: 'cg-depart-1' },
  pond: { hash: '#pond', toggle: 'Farmed shrimp', chapter: 'p1', title: 'Partner farms on the Andhra coast.', clip: 'cg-ponds' },
} as const

type W = Window & { __scrub?: { id: string | null; chapter: number } }

/** The chapter under the viewport centre, its visible heading, and the clip the stage is showing. */
async function onScreen(page: Page) {
  return page.evaluate(() => {
    const c = innerHeight / 2
    const sec = [...document.querySelectorAll<HTMLElement>('.film > section')].find((e) => {
      const r = e.getBoundingClientRect()
      return r.top <= c && r.bottom >= c
    })
    const video = [...document.querySelectorAll('video')].find((v) => v.style.opacity === '1' && v.currentSrc)
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.stage__seq')
    return {
      chapter: sec?.id ?? null,
      titles: [...(sec?.querySelectorAll('.caption__title') ?? [])].map((t) => t.textContent?.trim()),
      probe: (window as W).__scrub?.id ?? null,
      src: video?.dataset.clip ?? video?.currentSrc ?? (canvas?.style.opacity === '1' ? canvas.dataset.clip : '') ?? '',
      hash: location.hash,
    }
  })
}

/** Wait until the scroll has landed on `chapter` and the stage has painted its clip. */
async function landed(page: Page, p: (typeof PATHS)[keyof typeof PATHS]) {
  await expect.poll(async () => (await onScreen(page)).chapter, { timeout: 15_000 }).toBe(p.chapter)
  await expect.poll(async () => (await onScreen(page)).src, { timeout: 15_000 }).toContain(p.clip)
  const s = await onScreen(page)
  expect(s.titles).toContain(p.title)
  expect(s.probe).toBe(p.clip)
  expect(s.hash).toBe(p.hash)
}

for (const p of Object.values(PATHS)) {
  test(`deep link ${p.hash} lands on ${p.chapter}`, async ({ page }) => {
    await page.goto('/story' + p.hash)
    await landed(page, p)
  })
}

// phones scroll natively and round a fractional chapter top down: the stage must still switch to the chapter's clip
for (const p of Object.values(PATHS)) {
  test(`deep link ${p.hash} lands on ${p.chapter} on a phone`, async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] })
    const page = await ctx.newPage()
    await page.goto('/story' + p.hash)
    await landed(page, p)
    await ctx.close()
  })
}

test('header path toggle lands on each path from the top and from inside the film', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'the toggle sits in the header on both widths, but one width is enough for the click path')
  await page.goto('/story')
  await page.waitForFunction(() => document.querySelector('.loader') === null || getComputedStyle(document.querySelector('.loader')!).opacity === '0', null, { timeout: 15_000 })
  for (const p of [PATHS.pond, PATHS.ocean]) {
    await page.locator('.path-toggle a', { hasText: p.toggle }).click()
    await landed(page, p)
  }
  // from deeper in the story
  await page.evaluate(() => scrollTo(0, document.getElementById('intake')!.getBoundingClientRect().top + scrollY + 40))
  await page.waitForTimeout(800)
  for (const p of [PATHS.pond, PATHS.ocean]) {
    await page.locator('.path-toggle a', { hasText: p.toggle }).click()
    await landed(page, p)
  }
})

test('a same-page hash change switches the path and lands on it', async ({ page }) => {
  await page.goto('/story' + PATHS.pond.hash)
  await landed(page, PATHS.pond)
  await page.evaluate(() => (location.hash = '#ocean'))
  await landed(page, PATHS.ocean)
})

for (const path of ['ocean', 'pond'] as const) {
  test(`every chapter on the ${path} path shows its own clip and copy`, async ({ page }) => {
    test.setTimeout(120_000)
    const { chaptersFor } = await import('../src/config/chapters')
    const list = chaptersFor(path)
    await page.goto('/story#' + path)
    await landed(page, path === 'ocean' ? PATHS.ocean : PATHS.pond)
    for (const ch of list) {
      const clips = ch.media.flatMap((m) => (m.kind === 'video' ? [m.id] : []))
      if (!clips.length) continue // docs (DOM), world (globe)
      await page.evaluate((id) => {
        const el = document.getElementById(id)!
        scrollTo(0, el.getBoundingClientRect().top + scrollY + Math.min(el.offsetHeight / 2, innerHeight / 2))
      }, ch.id)
      await expect.poll(async () => (await onScreen(page)).probe, { timeout: 10_000, message: `${path} ${ch.id}` }).toMatch(new RegExp(`^(${clips.join('|')})$`))
      const s = await onScreen(page)
      expect(s.chapter, `${path} ${ch.id}`).toBe(ch.id)
      // its own copy: the first caption title of this chapter
      if (ch.captions.length) expect(s.titles, `${path} ${ch.id} copy`).toContain(ch.captions[0].title)
    }
  })
}
