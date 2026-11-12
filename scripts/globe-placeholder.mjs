// The globe placeholder (#D, #hd): the live globe's first frame of the world chapter, captured at 2560×1440 (1280×720 at
// dpr 2, real GPU), written as public/textures/globe-ph_{1280,1920,2560}.{avif,webp} for the desktop film and a centre
// square crop, globe-ph_sq.{avif,webp} at 1440 px, for the round homepage globe and phones held upright.
//   npm run build && npm run preview &   then   node scripts/globe-placeholder.mjs [base url]
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:4173'
const tmp = mkdtempSync(`${process.env.TMPDIR ?? tmpdir()}/globe-`)
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
await page.goto(`${base}/story#ocean`)
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
// in steps, so the film follows the scroll chapter by chapter (one jump leaves it behind)
const top = await page.evaluate(() => document.querySelector('[data-chapter="world"]').offsetTop)
for (let y = 0; y < top; y += 900) {
  await page.evaluate((y) => scrollTo(0, y), y)
  await page.waitForTimeout(150)
}
await page.evaluate((y) => scrollTo(0, y), top)
await page.waitForSelector('.stage__light.is-globe-live', { timeout: 60_000 })
await page.waitForTimeout(2500)
// the globe alone: every overlay (copy, header, scrims, hints) hidden, the stage's own light background kept
await page.addStyleTag({ content: 'body * { visibility: hidden !important } .stage__light, .stage__light canvas { visibility: visible !important } .globe-ph { display: none !important }' })
await page.waitForTimeout(500)
await page.screenshot({ path: `${tmp}/globe.png` })
await browser.close()

// AVIF (SVT-AV1 crf 25) and WebP (q 82) per tier, from the lossless capture
const out = 'public/textures/globe-ph'
const enc = (vf, name) => {
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', `${tmp}/globe.png`, '-vf', `${vf},format=yuv420p`, '-c:v', 'libsvtav1', '-preset', '8', '-crf', '25', '-frames:v', '1', `${out}_${name}.avif`], { stdio: 'ignore' })
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', `${tmp}/globe.png`, '-vf', vf, `${tmp}/${name}.png`])
  execFileSync('cwebp', ['-quiet', '-m', '6', '-q', '82', `${tmp}/${name}.png`, '-o', `${out}_${name}.webp`])
}
for (const w of [1280, 1920, 2560]) enc(w === 2560 ? 'null' : `scale=${w}:-2:flags=lanczos`, w)
enc('crop=1440:1440:560:0', 'sq')
console.log(`globe placeholder written from ${base}`)
