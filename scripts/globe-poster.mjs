// The homepage globe's poster (#274): the live Markets globe's first view (settled, every route drawn, labels and hint
// off), rendered at 2560 px square (a 1280 px box on a 2880 px wide page at dpr 2, real GPU) on the section's sand, written as
// public/textures/globe-home_{1280,2560}.{avif,webp}. Motion is reduced so the idle tour holds the first view.
//   npm run build && npm run preview &   then   node scripts/globe-poster.mjs [base url]
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:4173'
const tmp = mkdtempSync(`${process.env.TMPDIR ?? tmpdir()}/globe-`)
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 2880, height: 1500 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
await page.goto(base)
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
await page.evaluate(() => document.querySelector('[data-globe]').scrollIntoView({ block: 'center' }))
await page.addStyleTag({
  content: `[data-globe] { width: 1280px !important; max-width: none !important } .globe-ph, .globe-labels, .globe-hint { display: none !important }`,
})
await page.waitForSelector('[data-globe].is-globe-live', { timeout: 60_000 })
// the layout is re-measured once a second
await page.waitForTimeout(2500)
await page.evaluate(() => document.querySelector('[data-globe]').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(500)
await page.locator('[data-globe]').screenshot({ path: `${tmp}/globe.png` })
await browser.close()

const out = 'public/textures/globe-home'
for (const w of [2560, 1280]) {
  const vf = w === 2560 ? 'null' : `scale=${w}:-2:flags=lanczos`
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', `${tmp}/globe.png`, '-vf', `${vf},format=yuv420p`, '-c:v', 'libsvtav1', '-preset', '4', '-crf', '30', '-frames:v', '1', `${out}_${w}.avif`], { stdio: 'ignore' })
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', `${tmp}/globe.png`, '-vf', vf, `${tmp}/${w}.png`])
  execFileSync('cwebp', ['-quiet', '-m', '6', '-q', '75', `${tmp}/${w}.png`, '-o', `${out}_${w}.webp`])
}
console.log(`globe poster written from ${base}`)
