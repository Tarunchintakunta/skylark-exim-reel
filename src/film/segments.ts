import { heroPoster } from '../config/hero'
import { env } from '../engine/env'
import { MEDIA_V, TOP, type Codec, type Tier } from './manifest'
import { mediaUrl } from './media'

/**
 * Media helpers for the homepage (hero loop, story-entry cards, plant stills, globe): codec and tier choice, versioned
 * URLs. /story's reel has its own frame sets (src/reel).
 */
export { mediaUrl }

const TYPES: Record<Codec, string> = {
  av1: 'video/mp4; codecs="av01.0.08M.08"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
  h264: 'video/mp4; codecs="avc1.640028"',
}
/** phones: AV1, else H.264 (PR #324: the phone tier has no HEVC files); desktop: AV1, HEVC, H.264 */
const ORDER: Codec[] = env.mobile ? ['av1', 'h264'] : ['av1', 'hevc', 'h264']
const probe = typeof document !== 'undefined' ? document.createElement('video') : null
/**
 * One codec per visitor: AV1, else HEVC (Safari), else H.264. A first pick from canPlayType, so the first clip can load at
 * once; `codecReady` then asks MediaCapabilities for the first codec that decodes smoothly at this tier, on phones the
 * first that also decodes power-efficiently (hardware). The warm cache waits for it, so it downloads one codec only.
 */
export let codec: Codec = ORDER.find((c) => probe?.canPlayType(TYPES[c])) ?? 'h264'

/** the hero loop's first frame, AVIF and WebP (config/hero.ts) */
export const HERO_POSTER = heroPoster(mediaUrl)

/** Phones held upright get the portrait crop; landscape phones, Save-Data and 3G the 960 tier. */
const portrait = env.mobile && innerHeight > innerWidth
/**
 * Media tier (#hd), chosen once at load: the smallest of 1280 / 1920 / 2560 that covers 90 % of the frame's device px,
 * 2560 only where the budget solver serves it for this codec (scripts/clip-manifest.ts), else the top tier.
 */
const px = innerWidth * (devicePixelRatio || 1) * 0.9
const desktop = (c: Codec) => ([1280, 1920, 2560] as const).find((t) => t >= px && t <= TOP[c]) ?? TOP[c]
export const W: Tier = env.saveData || env.slow ? 960 : env.mobile ? (portrait ? 'm' : 960) : desktop(codec)

export const codecReady: Promise<Codec> = (async () => {
  const mc = navigator.mediaCapabilities
  if (!mc || W === 960) return codec
  const [width, height] = W === 'm' ? [810, 1440] : [W, Math.round((W * 9) / 16)]
  const info = await Promise.all(
    ORDER.filter((c) => probe?.canPlayType(TYPES[c])).map(async (c) => {
      const r = await mc
        .decodingInfo({ type: 'file', video: { contentType: TYPES[c], width, height, bitrate: 4e6, framerate: 24 } })
        .catch(() => null)
      return { c, ok: !!r?.supported && r.smooth, hw: !!r?.powerEfficient }
    }),
  )
  // phones: hardware decode first (battery, and a seek decodes up to a GOP); desktop: the first smooth one (dav1d is cheap)
  codec = ((env.mobile && info.find((i) => i.ok && i.hw)) || info.find((i) => i.ok))?.c ?? codec
  return codec
})()

/** <id>_<tier>.mp4 is H.264; AV1 and HEVC add .av1 / .hevc. H.264 has no 2560 tier, nor a codec the solver left at 1920. */
export const served = (w: Tier, c: Codec = codec): Tier => (w === 2560 && TOP[c] !== 2560 ? 1920 : w)
export const clipFile = (id: string, w: Tier = W, c: Codec = codec) => `${id}_${served(w, c)}${c === 'h264' ? '' : `.${c}`}.mp4`
export const clipUrl = (id: string, w: Tier = W) => mediaUrl(clipFile(id, w))

/** AVIF where it decodes (every browser with AV1 video, and Safari 16+), else WebP: an 8×8 AVIF, known within a frame of load */
let avif = false
export const avifReady = new Promise<boolean>((done) => {
  if (typeof Image === 'undefined') return done(false)
  const i = new Image()
  i.onload = () => done((avif = i.width === 8))
  i.onerror = () => done(false)
  i.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAD5bWV0YQAAAAAAAAAvaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAFBpY3R1cmVIYW5kbGVyAAAAAA5waXRtAAAAAAABAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAASEAAAAZAAAAKGlpbmYAAAAAAAEAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAAGppcHJwAAAAS2lwY28AAAAUaXNwZQAAAAAAAAAIAAAACAAAABBwaXhpAAAAAAMICAgAAAAMYXYxQ4EADAAAAAATY29scm5jbHgAAgACAAIAAAAAF2lwbWEAAAAAAAAAAQABBAECgwQAAAAhbWRhdAoJAAAAARfjV8gCMgwQANwA88eeEAAQkKA='
})
const img = (name: string) => mediaUrl(`${name}.${avif ? 'avif' : 'webp'}`)

/**
 * first frame of a clip at the media tier (posters follow the clip: a 1920 clip gets a 1920 poster), else the largest
 * poster tier below it that exists (the CG clips have no 2560 poster): never a URL for a file that isn't there
 */
const POSTER_TIERS = [2560, 1920, 1280, 960] as const
const posterTier = (id: string, w: Tier): Tier =>
  w === 'm' ? w : (POSTER_TIERS.find((t) => t <= w && `${id}_${t}.avif` in MEDIA_V) ?? 960)
export const posterUrl = (id: string, w: Tier = W) => img(`${id}_${posterTier(id, served(w))}`)
/** a clip's first frame as a home card, AVIF or WebP at 960 / 1280 / 1920 (covers 2× on a desktop card, 3× on a phone) */
export const cardSrcSet = (id: string, ext: 'avif' | 'webp') => [960, 1280, 1920].map((w) => `${mediaUrl(`${id}_${w}.${ext}`)} ${w}w`).join(', ')
