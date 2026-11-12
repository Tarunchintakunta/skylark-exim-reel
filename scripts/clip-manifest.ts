import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { SEQ_CLIPS, chaptersFor, firstClip } from '../src/config/chapters.ts'

/**
 * Clip tiers (segments.ts): 'm' = 810×1440 portrait crop for phones held upright, 960 landscape phones / Save-Data,
 * 1280 / 1920 / 2560 by the frame's device px. Codecs: AV1 and HEVC everywhere, H.264 as the fallback (no 2560).
 */
export const TIERS = ['m', 960, 1280, 1920, 2560] as const
export type Tier = (typeof TIERS)[number]
export const CODECS = ['av1', 'hevc', 'h264'] as const
export type Codec = (typeof CODECS)[number]
export const clipFile = (id: string, tier: Tier, codec: Codec) => `${id}_${tier}${codec === 'h264' ? '' : `.${codec}`}.mp4`

/**
 * Budgets per /story path and per file (TRD §13, #264; tests/weight.spec.ts, tests/hd.spec.ts). Per tier, because a
 * device downloads one tier. #hd2: every desktop tier (1280, 1920 and the 2560 retina one) 90 MB a path (PR #324; was 60), each clip file
 * up to 6,000 KB, now that desktop streams a clip only when its chapter is near (src/film/warmcache.ts) instead of
 * fetching the whole path after the first screen (was 28 / 28 / 40 MB and 2,300 KB). Phones stay at 12 MB.
 */
const BUDGET: Record<Tier, number> = { m: 30e6, 960: 12e6, 1280: 90e6, 1920: 90e6, 2560: 90e6 }
export const FILE_CAP = 6000 * 1024
/**
 * What a /story path downloads besides /media (document, JS, CSS, fonts, globe placeholder and texture): the baseline
 * build's "other" bytes over a whole path (tests/hd.spec.ts: 0.78 MB at 1920×1080, 0.60 MB at 390×844), plus 10 %.
 * With the files below this model gave 31.42 MB for the baseline's farmed path at 1920; hd.spec measured 31.34 MB.
 */
const OTHER = { desktop: 0.86e6, mobile: 0.66e6 }
const profile = (t: Tier) => (t === 'm' || t === 960 ? 'mobile' : 'desktop')
/**
 * the hero loop is not a path clip: fixed caps, no larger than before the HD pass (the loader waits for it to play, so
 * its bytes are first-screen time): 6 s of calm sea
 */
const HERO_CAP: Record<Tier, number> = { m: 380 * 1024, 960: 380 * 1024, 1280: 630 * 1024, 1920: 1000 * 1024, 2560: 2300 * 1024 }

const OUT = new URL('../src/film/manifest.ts', import.meta.url)
const media = (f: string) => new URL(`../public/media/${f}`, import.meta.url)
const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 10)
/** a /media file's URL with its content hash, as segments.ts mediaUrl writes it (for the static HTML) */
export const versioned = (f: string) => `/media/${f}${existsSync(media(f)) ? `?v=${hash(readFileSync(media(f)))}` : ''}`
const PATHS = ['ocean', 'pond'] as const
/**
 * Frame sequences (#hd2, chapters.ts SEQ_CLIPS, scripts/clip-frames.sh): <id>-f_1920_NNN.avif. Every desktop tier
 * downloads the one AVIF set instead of the clip's video.
 */
const seqFrames = (id: string, ext = 'avif', tier = 1920) =>
  existsSync(media('')) ? readdirSync(media('')).filter((f) => f.startsWith(`${id}-f_${tier}_`) && f.endsWith(`.${ext}`)) : []
export const isSeq = (id: string) => SEQ_CLIPS.includes(id) && seqFrames(id).length > 0
/** bytes a desktop downloads for a sequence clip: its 1920 AVIF set (PR #324: as small as it goes at the sharp WebP's SSIM) */
const seqBytes = (id: string, _t?: Tier) => seqFrames(id).reduce((a, f) => a + fileSize(f), 0)
const fileSize = (f: string) => (existsSync(media(f)) ? statSync(media(f)).size : 0)
const pathClips = (p: (typeof PATHS)[number]) => [
  ...new Set(chaptersFor(p).flatMap((ch) => ch.media.flatMap((m) => (m.kind === 'video' ? [m.id] : [])))),
]

/**
 * A path's bytes besides its clips at tier t, from the files on disk (AVIF: every browser that plays AV1 or HEVC here
 * decodes it): OTHER, the hero loop at its cap and its poster, each clip's first-frame poster, the documentation still and the product stills the page shows at that size.
 */
export function overhead(path: (typeof PATHS)[number], t: Tier) {
  const p = profile(t)
  // no 2560 posters yet when the 2560 tier is being decided: its 1920 posters stand in (an underestimate)
  const poster = (id: string) => fileSize(`${id}_${t}.avif`) || (t === 2560 ? fileSize(`${id}_1920.avif`) : 0)
  const posters = pathClips(path).reduce((a, id) => a + poster(id), 0)
  const products = readdirSync(media('')).filter((f) => f.startsWith('prod-') && f.endsWith(p === 'desktop' ? '_640.avif' : '_960.avif'))
  return OTHER[p] + HERO_CAP[t] + poster('hero-loop') + posters + fileSize(`ph-docs-blur_${t}.avif`) + products.reduce((a, f) => a + fileSize(f), 0)
}

/**
 * What a clip costs to encode clean (#hd2): kbit/s of its master at one fixed quality with the scrub's GOP (H.264
 * veryfast crf 23, 960 wide, keyframe every 6, no B-frames), written by `tsx scripts/clip-manifest.ts cost` into
 * scripts/clip-cost.json (re-run it when a master changes). Motion is most of it: with a keyframe every 6 frames, a
 * fast move or churning water makes every P-frame expensive, a locked-off shot costs little past its keyframes (the
 * locked-off dock 2.2 Mbit/s, the harvest net 8.0). The weight is cost ÷ the median clip's, held to 1–2.5: a cheap clip still gets
 * the median rate (with a 0.7 floor the locked-off shots fell 25-35 % under their old 2560 bytes and the dock's wet
 * floor went soft), the expensive ones up to 2.5×. A clip missing from the file weighs 1.
 */
const COST_FILE = new URL('./clip-cost.json', import.meta.url)
const COST: Record<string, number> = existsSync(COST_FILE) ? JSON.parse(readFileSync(COST_FILE, 'utf8')) : {}
export function motionWeight(id: string) {
  const all = Object.values(COST).sort((a, b) => a - b)
  if (!(id in COST) || !all.length) return 1
  const median = all[Math.floor(all.length / 2)]
  return Math.min(2.5, Math.max(1, COST[id] / median))
}

/**
 * The first clip of each path (o1 / p1) is what /story's loader buffers before the page is ready, so its 1280 and 1920
 * files are first-screen bytes: held to 1,100 KB (the base build's 920-1,150 KB; hf-depart's 1280 files are the base
 * build's own, so no tier is smaller than before), so the desktop first load stays under its 3 MB
 * (tests/weight.spec.ts); at the solver's share it measured 3.29 / 3.37 MB (#hd2).
 */
const FIRST = new Set(PATHS.map((p) => firstClip(p)?.id))
const FIRST_CAP = 1100 * 1024

/**
 * Budget solver: bytes per clip and tier so each path's clips fill (budget − overhead) in proportion to their length,
 * max-min fair across the two paths (a clip on both paths gets the tighter path's rate; what that leaves over in the
 * other path goes to its own clips), never above the file cap (FILE_CAP). Every tier gets the whole budget: a device
 * downloads one tier and one codec, so the tier on screen gets all of it.
 */
export function solveCaps(dur: Record<string, number>, fixed: Record<string, Partial<Record<Tier, number>>> = {}) {
  // desktop tiers share by cost-weighted duration (#hd2): a fast camera move needs far more bytes a second than a
  // locked-off shot to stay free of blocks (the port film smeared at 640 KB a clip); phones keep plain duration
  const len = (id: string, t: Tier) => dur[id] * (profile(t) === 'desktop' ? motionWeight(id) : 1)
  const caps: Record<string, Partial<Record<Tier, number>>> = { 'hero-loop': HERO_CAP }
  for (const t of TIERS) {
    const left = Object.fromEntries(PATHS.map((p) => [p, BUDGET[t] - overhead(p, t)]))
    // clips kept as encoded take their bytes off the top; the rest share what is left
    for (const [id, b] of Object.entries(fixed)) for (const p of PATHS) if (pathClips(p).includes(id)) left[p] -= b[t] ?? 0
    const open = new Set(PATHS.flatMap(pathClips).filter((id) => !(id in fixed)))
    while (open.size) {
      const rate = PATHS.map((p) => {
        const ids = pathClips(p).filter((id) => open.has(id))
        return { p, ids, r: ids.length ? left[p] / ids.reduce((a, id) => a + len(id, t), 0) : Infinity }
      }).sort((a, b) => a.r - b.r)[0]
      for (const id of rate.ids) {
        const bytes = Math.floor(Math.min(FILE_CAP, rate.r * len(id, t), FIRST.has(id) && (t === 1280 || t === 1920) ? FIRST_CAP : Infinity))
        ;(caps[id] ??= {})[t] = bytes
        open.delete(id)
        for (const p of PATHS) if (pathClips(p).includes(id)) left[p] -= bytes
      }
    }
  }
  return caps
}

/**
 * The 2560 tier is served only where it fits (#hd, #264): every 2560 file of a codec under the file cap, and each path's
 * 2560 clips plus overhead inside the 2560 budget. Otherwise that codec tops out at 1920.
 */
export function topTier(codec: Codec, size: (f: string) => number | null) {
  if (codec === 'h264') return { top: 1920 as const, why: 'H.264 has no 2560 tier' }
  const sizes = PATHS.map((p) => pathClips(p).map((id) => (isSeq(id) ? seqBytes(id, 2560) : size(clipFile(id, 2560, codec)))))
  if (sizes.flat().some((s) => s === null)) return { top: 1920 as const, why: `no ${codec} 2560 files: scripts/encode-all.sh drops them when a path does not fit` }
  const total = sizes.map((s, i) => (s as number[]).reduce((a, b) => a + b, 0) + overhead(PATHS[i], 2560))
  // the file cap is a video cap: a frame set's total is not one file (each frame has its own cap, tests/weight.spec.ts)
  const over = PATHS.flatMap(pathClips).filter((id) => !isSeq(id) && (size(clipFile(id, 2560, codec)) ?? 0) > FILE_CAP).length
  const mb = total.map((b, i) => `${PATHS[i]} ${(b / 1e6).toFixed(1)} MB`).join(', ')
  if (over || total.some((b) => b > BUDGET[2560]))
    return { top: 1920 as const, why: `${codec} 2560: ${mb}, ${over} files over ${FILE_CAP / 1024} KB; budget ${BUDGET[2560] / 1e6} MB` }
  return { top: 2560 as const, why: `${codec} 2560 fits: ${mb}` }
}

/**
 * src/film/manifest.ts (#251, #hd): every clip of each path in story order, with its chapter, its place in the chapter,
 * and per codec and tier the byte size and a short content hash; the solver's top tier per codec; and a content hash for
 * every file in public/media. The hash goes on the URL (`?v=`), so /media/* is cached immutably and a re-encoded file is
 * still picked up. Rewritten on every build (only when it changed); committed, so typecheck runs without a build.
 */
/** a frame of a frame sequence: <id>-f_1920_NNN.webp (older sets: .avif, 2560) */
const FRAME = /-f_(1920|2560)_\d+\.(avif|webp)$/

export function manifestSource() {
  const files = readdirSync(media('')).filter((f) => !f.startsWith('.'))
  const v = new Map(files.map((f) => [f, hash(readFileSync(media(f)))]))
  // one hash per set, over every frame's hash in both formats: any re-encoded frame gives the set a new URL
  const setHash = (id: string) => hash(Buffer.from(seqFrames(id).sort().map((f) => v.get(f)).join('')))
  const size = (f: string) => (v.has(f) ? readFileSync(media(f)).length : null)
  const top = Object.fromEntries(CODECS.map((c) => [c, topTier(c, size)]))
  const paths = PATHS.map((path) => {
    const clips = chaptersFor(path).flatMap((ch, chapter) => {
      const videos = ch.media.filter((m) => m.kind === 'video')
      return videos.map((m, seg) => {
        const codecs = CODECS.map((c) => {
          const tiers = TIERS.filter((t) => t !== 2560 || top[c].top === 2560).flatMap((t) => {
            const f = clipFile(m.id, t, c)
            if (!v.has(f)) {
              if (c === 'h264' && t !== 2560) throw new Error(`clip-manifest: missing public/media/${f}`)
              return []
            }
            return [`${typeof t === 'number' ? t : `'${t}'`}: { bytes: ${size(f)}, v: '${v.get(f)}' }`]
          })
          return `${c}: { ${tiers.join(', ')} }`
        })
        return `    { id: '${m.id}', chapter: ${chapter}, seg: ${seg}, of: ${videos.length}, files: { ${codecs.join(', ')} } },`
      })
    })
    return `  ${path}: [\n${clips.join('\n')}\n  ],`
  })
  return `// Generated by scripts/clip-manifest.ts from src/config/chapters.ts and public/media. Do not edit.
export type Tier = 'm' | 960 | 1280 | 1920 | 2560
export type Codec = 'av1' | 'hevc' | 'h264'
export interface ClipFile {
  bytes: number
  v: string
}
export interface Clip {
  id: string
  /** chapter index in the path's chapter list */
  chapter: number
  /** this clip's place among the chapter's clips, and how many it has */
  seg: number
  of: number
  files: Record<Codec, Partial<Record<Tier, ClipFile>>>
}

export const CLIPS: Record<'ocean' | 'pond', Clip[]> = {
${paths.join('\n')}
}

/** the budget solver's top desktop tier per codec (scripts/clip-manifest.ts topTier) */
export const TOP: Record<Codec, 1920 | 2560> = { ${CODECS.map((c) => `${c}: ${top[c].top}`).join(', ')} }

/**
 * desktop frame sequences (chapters.ts SEQ_CLIPS, #hd2): frames per clip, bytes of its 1920 AVIF set (from the
 * master), and one content hash for the whole set (segments.ts seqUrl puts it on every frame's URL)
 */
export const SEQ: Record<string, { frames: number; bytes: number; v: string }> = {
${SEQ_CLIPS.filter(isSeq).map((id) => `  '${id}': { frames: ${seqFrames(id).length}, bytes: ${seqBytes(id)}, v: '${setHash(id)}' },`).join('\n')}
}

/**
 * content hash of every file in public/media; mediaUrl (segments.ts) puts it on the URL. Frame-sequence frames are left
 * out: each set has one hash in SEQ, which keeps ~900 entries out of the homepage's main chunk
 */
export const MEDIA_V: Record<string, string> = {
${[...v].filter(([f]) => !FRAME.test(f)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([f, h]) => `  '${f}': '${h}',`).join('\n')}
}

/**
 * content hash of every file in public/textures (the globe's maps and placeholders); texUrl (film/media.ts) puts it on
 * the URL, so /textures/* is cached immutably (vercel.json) and each file is fetched once
 */
export const TEXTURE_V: Record<string, string> = {
${readdirSync('public/textures').filter((f) => !f.startsWith('.')).sort().map((f) => `  '${f}': '${hash(readFileSync(`public/textures/${f}`))}',`).join('\n')}
}
`
}

export function clipManifest(): Plugin {
  return {
    name: 'clip-manifest',
    buildStart() {
      const next = manifestSource()
      for (const c of CODECS) {
        const t = topTier(c, (f) => (existsSync(media(f)) ? readFileSync(media(f)).length : null))
        this.info(`top tier ${c}: ${t.top} (${t.why})`)
      }
      if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== next) writeFileSync(OUT, next)
    },
  }
}

// CLI for scripts/encode-hf.sh: `tsx scripts/clip-manifest.ts caps <id>` prints "<tier> <bytes>" per tier, solved over
// the masters' durations; `tsx scripts/clip-manifest.ts top <codec>` prints the 2560 decision for that codec.
if (process.argv[1]?.endsWith('clip-manifest.ts')) {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'caps') {
    const probe = (id: string) =>
      +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `masters/${id}/master.mp4`], { encoding: 'utf8' })
    const all = [...new Set(PATHS.flatMap(pathClips))]
    // SOLVE="<ids>": only those clips are being encoded; every other clip keeps its files on disk, counted at its
    // largest codec per tier (a device downloads one)
    const solve = process.env.SOLVE?.split(/\s+/).filter(Boolean)
    // a sequence clip is fixed too, unless it is being encoded: its frame set on desktop tiers, its video files on the phone ones
    const kept = (id: string, t: Tier) => (isSeq(id) && profile(t) === 'desktop' ? seqBytes(id, t) : Math.max(...CODECS.map((c) => fileSize(clipFile(id, t, c)))))
    const fixed = Object.fromEntries(all.filter((id) => !solve?.includes(id) && (solve || isSeq(id))).map((id) => [id, Object.fromEntries(TIERS.map((t) => [t, kept(id, t)]))]))
    const dur = Object.fromEntries(all.filter((id) => !(id in fixed)).map((id) => [id, probe(id)]))
    const caps = solveCaps(dur, fixed)[arg]
    if (!caps) throw new Error(`clip-manifest: ${arg} is on no path`)
    for (const t of TIERS) console.log(t, caps[t])
  } else if (cmd === 'cost') {
    const out: Record<string, number> = {}
    const tmp = `${process.env.TMPDIR ?? '/tmp'}/clip-cost.mp4`
    for (const id of [...new Set(PATHS.flatMap(pathClips))]) {
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', `masters/${id}/master.mp4`, '-vf', 'scale=960:-2', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '6', '-keyint_min', '6', '-sc_threshold', '0', '-bf', '0', tmp])
      const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp], { encoding: 'utf8' })
      out[id] = Math.round((statSync(tmp).size * 8) / d / 1000)
    }
    writeFileSync(COST_FILE, JSON.stringify(out, null, 2) + '\n')
    console.log(out)
  } else if (cmd === 'top') {
    const t = topTier(arg as Codec, (f) => (existsSync(media(f)) ? readFileSync(media(f)).length : null))
    console.log(t.top, t.why)
  }
}
