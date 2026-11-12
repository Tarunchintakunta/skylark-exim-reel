import { COPY_RIGHT, type ChapterDef, type Media } from '../config/chapters'
import { heroPoster } from '../config/hero'
import { env } from '../engine/env'
import { MEDIA_V, SEQ, TOP, type Codec, type Tier } from './manifest'
import { mediaUrl } from './media'

export interface Segment {
  media: Media
  chapter: number
  /** range inside the chapter's local progress */
  from: number
  to: number
  /** set on the last segment of a chapter */
  join?: ChapterDef['joinNext']
  scrim?: ChapterDef['scrim']
  /** the chapter's copy sits in the right-hand column (the soft scrim shades that side) */
  right?: boolean
  /** this segment's desktop scroll length in vh (its share of the chapter's) */
  vh: number
}

/**
 * A chapter's scroll length is split evenly across its media, unless a still or a video sets its `span`.
 * Segments inside a chapter cut straight to each other (scrub.ts); the last one uses the chapter's join.
 */
export function toSegments(chapters: ChapterDef[]): Segment[] {
  return chapters.flatMap((ch, chapter) =>
    segmentBounds(ch).map(([from, to], j, all) => {
      const last = j === all.length - 1
      return { media: ch.media[j], chapter, from, to, vh: ch.vh * (to - from), join: last ? ch.joinNext : ('crossfade' as const), scrim: ch.scrim, right: COPY_RIGHT.has(ch.id) }
    }),
  )
}

/** [from, to] of each of a chapter's media inside its local progress */
export function segmentBounds(ch: ChapterDef): [number, number][] {
  let from = 0
  return ch.media.map((media, j, all) => {
    const span = (media.kind === 'still' || media.kind === 'video') && media.span ? media.span : 1 / all.length
    const to = j === all.length - 1 ? 1 : from + span
    const b: [number, number] = [from, to]
    from = to
    return b
  })
}

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
/** stand-in stills (ph-*) come from 3840 px masters: the tier that covers the frame, up to 2560 */
const stillW = (w: Tier): Tier => (w === 'm' || w === 960 ? w : (([1280, 1920, 2560] as const).find((t) => t >= px) ?? 2560))
const stillUrl = (id: string, w: Tier) => (id.startsWith('ph-') ? img(`${id}_${stillW(w)}`) : posterUrl(id, w))

/**
 * Desktop frame sequences (#hd2, chapters.ts SEQ_CLIPS): the stage canvas plays these clips frame by frame instead of a
 * <video>. Phones, Save-Data and 3G keep the video. One 1920 AVIF set on every desktop tier (scripts/clip-frames.sh).
 */
export const isSeq = (id: string) => !env.mobile && W !== 960 && W !== 'm' && id in SEQ
export const seqFrames = (id: string) => SEQ[id]?.frames ?? 0
/**
 * One 1920 AVIF set per CG clip (PR #324, 12 Nov): from the master, lanczos and a light unsharp, each set encoded at the
 * highest crf whose SSIM still matches the sharp WebP q 55-70 KB sets (scripts/clip-frames.sh SSIM_MATCH), ~45-63 KB a
 * frame. AVIF only: every desktop browser that runs the canvas decodes it (Chrome 85, Firefox 93, Safari 16)
 */
export const seqUrl = (id: string, i: number) => `/media/${id}-f_1920_${String(i).padStart(3, '0')}.avif?v=${SEQ[id]?.v}`

/**
 * First-frame poster for a segment, or null for gradient/globe and for a desktop frame-set clip (the canvas draws its
 * frame 0; a poster under it would only be bytes). `w` is the media tier (tests pass each one).
 */
export function posterFor(m: Media, w: Tier = W): string | null {
  if (m.kind === 'video') return isSeq(m.id) ? null : posterUrl(m.id, w)
  if (m.kind === 'still') return stillUrl(m.poster, w)
  // documentation: a pre-blurred, darkened still (no live CSS blur over the stage)
  if (m.kind === 'dom') return stillUrl(`${m.poster}-blur`, w)
  return null
}
