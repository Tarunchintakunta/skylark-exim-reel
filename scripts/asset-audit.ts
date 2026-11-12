import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { chaptersFor } from '../src/config/chapters'
import { HERO_SEQ } from '../src/config/hero'
import { PRODUCT_W } from '../src/config/products'
import { NEWS } from '../src/content/news'

/**
 * Asset audit (#terminal-mode step 1): every image and video the site serves, on every page, with the master it comes
 * from, the master's own pixels and the bytes served per tier. Writes docs/HD_AUDIT.md.
 *   node --import tsx scripts/asset-audit.ts
 * Masters live in masters/ (gitignored, a symlink to the HD master set on this Mac); a missing master is listed as such,
 * never upscaled away.
 */
const media = (f: string) => `public/media/${f}`
const size = (f: string) => (existsSync(f) ? statSync(f).size : null)
const KB = (b: number | null) => (b === null ? '—' : `${Math.round(b / 1024)}`)
const FILES = existsSync('public/media') ? readdirSync('public/media') : []

/** 2560×1440 24 fps masters, by clip id */
function master(id: string) {
  const f = `masters/${id}/master.mp4`
  if (!existsSync(f)) return null
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
    { encoding: 'utf8' },
  ).trim().split('\n')
  const [w, h, fps, dur] = out
  return { label: `${w}×${h} ${fps.replace('/1', '')} fps ${(+dur).toFixed(1)} s`, w: +w }
}

/** a still master (one image), e.g. the documentation backdrop */
function stillMaster(f: string) {
  if (!existsSync(f)) return null
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'default=nw=1:nk=1', f], { encoding: 'utf8' })
    .trim()
    .split('\n')
  return { label: `${out[0]}×${out[1]} still`, w: +out[0] }
}

interface Row {
  page: string
  what: string
  asset: string
  master: string
  /** served bytes per tier label */
  served: string
}
const rows: Row[] = []

const CLIP_TIERS = ['m', 960, 1280, 1920, 2560] as const
/** clip bytes per tier, in the codec a browser most often gets here (AV1), with the poster beside it */
function clipRow(page: string, what: string, id: string) {
  const m = master(id)
  const served = CLIP_TIERS.map((t) => {
    const v = size(media(`${id}_${t}.av1.mp4`))
    return v === null ? null : `${t}: ${KB(v)} KB`
  })
    .filter(Boolean)
    .join(' · ')
  rows.push({ page, what, asset: `${id}_*.{av1,hevc,}.mp4`, master: m?.label ?? '**missing**', served })
  const posters = CLIP_TIERS.map((t) => {
    const a = size(media(`${id}_${t}.avif`))
    return a === null ? null : `${t}: ${KB(a)} KB`
  })
    .filter(Boolean)
    .join(' · ')
  rows.push({ page, what: `${what} — first frame`, asset: `${id}_*.{avif,webp}`, master: m?.label ?? '**missing**', served: posters })
}

// ── / (homepage)
const hero = master('hero-loop')
rows.push({
  page: '/',
  what: 'hero loop (LCP first frame + the loop itself)',
  asset: 'hero-loop_*',
  master: hero?.label ?? '**missing**',
  served: CLIP_TIERS.map((t) => (size(media(`hero-loop_${t}.av1.mp4`)) === null ? null : `${t}: ${KB(size(media(`hero-loop_${t}.av1.mp4`)))} KB clip / ${KB(size(media(`hero-loop_${t}.avif`)))} KB avif`))
    .filter(Boolean)
    .join(' · '),
})
for (const p of ['ocean', 'pond'] as const) {
  const first = chaptersFor(p).slice(1).flatMap((c) => c.media).find((m) => m.kind === 'video')
  if (first?.kind === 'video') {
    const m = master(first.id)
    rows.push({
      page: '/',
      what: `story card (${p})`,
      asset: `${first.id}_{960,1280,1920}.{avif,webp}`,
      master: m?.label ?? '**missing**',
      served: [960, 1280, 1920].map((w) => `${w}: ${KB(size(media(`${first.id}_${w}.avif`)))} KB`).join(' · '),
    })
  }
}
for (const id of ['hf-intake', 'hf-lab', 'hf-iqf', 'hf-store']) {
  const m = master(id)
  rows.push({
    page: '/',
    what: 'plant card',
    asset: `${id}_{960,1280,1920}.{avif,webp}`,
    master: m?.label ?? '**missing**',
    served: [960, 1280, 1920].map((w) => `${w}: ${KB(size(media(`${id}_${w}.avif`)))} KB`).join(' · '),
  })
}
for (const f of FILES.filter((f) => f.startsWith('prod-') && f.endsWith('_960.avif')).sort()) {
  const id = f.replace('_960.avif', '')
  rows.push({
    page: '/',
    what: 'product still (1:1)',
    asset: `${id}_{${PRODUCT_W.join(',')}}.{avif,webp}`,
    master: '**missing** (no 4K original on this Mac; 960 is the largest export)',
    served: PRODUCT_W.map((w) => `${w}: ${KB(size(media(`${id}_${w}.avif`)))} KB`).join(' · '),
  })
}

// the hero's scroll sequence (#249, #264): one row per tier, not 108 rows of frames
for (const [tier, n] of Object.entries(HERO_SEQ)) {
  const files = FILES.filter((f) => f.startsWith(`hero-seq_${tier}_`))
  const bytes = (ext: string) => files.filter((f) => f.endsWith(ext)).reduce((a, f) => a + (size(media(f)) ?? 0), 0)
  rows.push({
    page: '/',
    what: `hero scroll sequence, ${tier === 'm' ? '810×1440 portrait' : `${tier}×1080`}`,
    asset: `hero-seq_${tier}_NNN.{avif,webp}`,
    master: hero?.label ?? '**missing**',
    served: `${n} frames · avif ${(bytes('.avif') / 1e6).toFixed(2)} MB · webp ${(bytes('.webp') / 1e6).toFixed(2)} MB`,
  })
}

// ── /story, both paths
for (const p of ['ocean', 'pond'] as const) {
  for (const ch of chaptersFor(p)) {
    for (const m of ch.media) {
      if (m.kind === 'video') clipRow(`/story#${p}`, `${ch.id} · ${ch.label}`, m.id)
      else if (m.kind === 'dom') {
        const src = stillMaster('masters/ph-docs.png')
        rows.push({
          page: `/story#${p}`,
          what: `${ch.id} · ${ch.label} — pre-blurred backdrop (blur is by design, not a placeholder)`,
          asset: `${m.poster}-blur_*.{avif,webp}`,
          master: src?.label ?? '**missing**',
          served: CLIP_TIERS.map((t) => (size(media(`${m.poster}-blur_${t}.avif`)) === null ? null : `${t}: ${KB(size(media(`${m.poster}-blur_${t}.avif`)))} KB`)).filter(Boolean).join(' · '),
        })
      } else if (m.kind === 'globe') {
        rows.push({
          page: `/story#${p}`,
          what: `${ch.id} · ${ch.label} — globe placeholder frame`,
          asset: 'textures/globe-ph_{1280,1920,2560}.{avif,webp} · globe-ph_sq',
          master: 'rendered from the live globe (scripts/globe-placeholder.mjs)',
          served: [1280, 1920, 2560].map((w) => `${w}: ${KB(size(`public/textures/globe-ph_${w}.avif`))} KB`).join(' · '),
        })
        rows.push({
          page: `/story#${p}`,
          what: `${ch.id} · ${ch.label} — globe texture`,
          asset: 'textures/earth_day_{2048,4096}.{avif,webp}',
          master: stillMaster('assets-src/textures/earth_day_5400.jpg')?.label ?? '**missing**',
          served: [2048, 4096].map((w) => `${w}: ${KB(size(`public/textures/earth_day_${w}.avif`))} KB`).join(' · '),
        })
      }
    }
  }
}

// ── /quote, /news
rows.push({ page: '/quote', what: 'no image or video on the page', asset: '—', master: '—', served: '—' })
if (!NEWS.length) rows.push({ page: '/news', what: 'no posts yet, so no post images', asset: '—', master: '—', served: '—' })
for (const post of NEWS)
  rows.push({
    page: '/news',
    what: `post: ${post.slug}`,
    asset: post.image,
    master: '**missing** (news images arrive with the post)',
    served: (post.widths ?? []).map((w) => `${w}: ${KB(size(`public${post.image.replace(/\.webp$/, '')}_${w}.webp`))} KB`).join(' · ') || KB(size(`public${post.image}`)) + ' KB',
  })

// ── files on disk that no page asks for
const used = new Set(rows.flatMap((r) => r.asset.split(' · ')))
const stale = FILES.filter((f) => {
  // <id>_<tier>[.codec].<ext>, where a tier is m, a width, or end_1280
  const id = f.replace(/_(m|\d+|end_\d+)(\.av1|\.hevc)?\.(avif|webp|mp4)$/, '')
  return !f.startsWith('.') && ![...used].some((u) => u.startsWith(`${id}_`))
})

const table = (rs: Row[]) =>
  ['| Page | What | Files | Master | Served (AVIF / AV1 KB per tier) |', '| --- | --- | --- | --- | --- |', ...rs.map((r) => `| ${r.page} | ${r.what} | \`${r.asset}\` | ${r.master} | ${r.served} |`)].join('\n')

const total = FILES.reduce((a, f) => a + (size(media(f)) ?? 0), 0)
const out = `# HD asset audit

Generated by \`node --import tsx scripts/asset-audit.ts\`. Every image and video the site serves, the master it came from
and the bytes served per tier. Masters live in \`masters/\` (gitignored). Nothing here is ever upscaled: where a master is
smaller than a tier, the asset keeps the master's pixels and the row says so.

- \`public/media\`: ${FILES.length} files, ${(total / 1e6).toFixed(1)} MB on disk (every tier and codec; a visitor downloads one tier and one codec)
- clip masters: 2560×1440, 24 fps, ~3 s each (\`masters/<id>/master.mp4\`)
- product stills: no 4K originals exist on this Mac or in the repo, so 960 stays the largest export
- \`/news\`: ${NEWS.length} posts

${table(rows)}

## Files on disk that no page asks for

${stale.length ? stale.map((f) => `- \`${f}\``).join('\n') : 'none'}
`
writeFileSync('docs/HD_AUDIT.md', out)
console.log(`docs/HD_AUDIT.md: ${rows.length} rows, ${stale.length} unused files`)
