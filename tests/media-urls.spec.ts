import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Node-only: every media URL the chapter config can request, on every tier and codec, in AVIF and WebP, must exist in
// public/ (#144, #hd). Tiers (segments.ts): m (phones upright), 960, 1280, 1920, and 2560 where the solver serves it.
test('every chapter media URL exists in public/ for every tier and codec', async () => {
  // segments.ts reads the window size at import; stub it for Node
  Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900 })
  const { OCEAN, POND } = await import('../src/config/chapters')
  const { clipFile, posterFor } = await import('../src/film/segments')
  const { TOP } = await import('../src/film/manifest')

  const files = new Set<string>()
  const both = (u: string) => [u, u.replace(/\.webp(\?|$)/, '.avif$1')]
  for (const w of ['m', 960, 1280, 1920, 2560] as const)
    for (const ch of [...OCEAN, ...POND])
      for (const m of ch.media) {
        const poster = posterFor(m, w)
        if (poster) both(poster).forEach((u) => files.add(u))
        if (m.kind !== 'video') continue
        for (const c of ['av1', 'hevc', 'h264'] as const) if (w !== 2560 || TOP[c] === 2560) files.add(`/media/${clipFile(m.id, w, c)}`)
      }

  const missing = [...files].filter((u) => !existsSync(join('public', u.split('?')[0])))
  expect(files.size).toBeGreaterThan(300)
  expect(missing).toEqual([])
})
