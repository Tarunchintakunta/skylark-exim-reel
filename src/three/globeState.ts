import { PORTRAIT } from '../config/hero'
import { env } from '../engine/env'
import { texUrl } from '../film/media'
import { avifReady } from '../film/segments'

/** phones for the homepage globe (#280): a coarse pointer or 768 px wide at most */
export const PHONE = env.coarse || (typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches)
const earth = (w: number) => avifReady.then((avif) => texUrl(`earth_day_${w}.${avif ? 'avif' : 'webp'}`))
/**
 * Earth albedo, AVIF (281 / 92 KB) or WebP where AVIF doesn't decode (scripts/globe-texture.sh); no other maps (#D).
 * The homepage globe (#274): 4096×2048 on desktop, so the full globe at DPR 2 is drawn from texels, not upscaled;
 * 2048×1024 on phones (#280). The film keeps 2048×1024 everywhere, inside its 25 MB path budget.
 */
export const GLOBE_TEXTURE = { home: earth(PHONE ? 2048 : 4096), film: earth(2048) }
export type GlobeKind = keyof typeof GLOBE_TEXTURE

/**
 * The earth texture as an ImageBitmap (decoded off the main thread), fetched once per URL for the page's life: the
 * homepage warm-up, the preload and the globe itself all read this one promise, so a page load fetches each file once.
 */
const bitmaps = new Map<string, Promise<ImageBitmap>>()
const byKind: Partial<Record<GlobeKind, Promise<ImageBitmap>>> = {}
export const earthBitmap = (kind: GlobeKind) =>
  (byKind[kind] ??= GLOBE_TEXTURE[kind].then((url) => {
    let p = bitmaps.get(url)
    if (!p) {
      p = fetch(url, { priority: 'low' } as RequestInit)
        .then((r) => r.blob())
        .then((b) => createImageBitmap(b, { imageOrientation: 'flipY' }))
      // a failed fetch is tried again by the next caller
      p.catch(() => (bitmaps.delete(url), delete byKind[kind]))
      bitmaps.set(url, p)
    }
    return p
  }))

/**
 * The globe's placeholder (#D, #hd): its first frame of the world chapter, shown until the live globe draws. 16:9 at
 * 1280 / 1920 / 2560 for the desktop film, a 1440 px centre square for the round homepage globe and upright phones
 * (scripts/globe-placeholder.mjs).
 */
export const GLOBE_PH = (ext: 'avif' | 'webp') => ({
  sq: texUrl(`globe-ph_sq.${ext}`),
  /** the <img> src for a browser without srcset support */
  fallback: texUrl(`globe-ph_1920.${ext}`),
  wide: [1280, 1920, 2560].map((w) => `${texUrl(`globe-ph_${w}.${ext}`)} ${w}w`).join(', '),
})
/**
 * The homepage globe's poster (#274): the live globe's exact first view, 1280 and 2560 px square
 * (scripts/globe-placeholder.mjs), so the crossfade to the live globe doesn't move a pixel.
 */
export const GLOBE_POSTER = (ext: 'avif' | 'webp') => [1280, 2560].map((w) => `${texUrl(`globe-home_${w}.${ext}`)} ${w}w`).join(', ')
/** fetch the placeholder the film's <picture> will pick (GlobeLayer), ahead of time */
export function warmGlobePlaceholder(avif: boolean) {
  const ph = GLOBE_PH(avif ? 'avif' : 'webp')
  const img = new Image()
  if (matchMedia(PORTRAIT).matches) img.src = ph.sq
  else {
    img.sizes = '100vw'
    img.srcset = ph.wide
  }
  return img
}

/** Shared, mutable UI state between the DOM market list and the globe (no React renders). */
export const globeUi = {
  /** index into MARKET_COORDS of the hovered/focused market, or -1 */
  highlight: -1,
  /** index of the clicked market the globe turns to face, or -1 */
  focus: -1,
  /** true after the first drag: the "Drag to explore" hint stays hidden */
  explored: false,
}
