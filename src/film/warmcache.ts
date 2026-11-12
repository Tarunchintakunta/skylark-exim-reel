import { decodeAll, storyReady } from '../engine/boot'
import { env } from '../engine/env'
import { frame, store, type Path } from '../engine/store'
import { CLIPS, SEQ, type Clip } from './manifest'
import { hasScrolled, pauseSeq, prefetchSeq, seqProgress } from './scrub'
import { W, avifReady, clipUrl, codec, codecReady, isSeq, served } from './segments'

/**
 * Warm cache. The intro opens once the active path's first clip is a Blob (openingReady). The rest of that path keeps
 * loading behind it: every other video clip becomes a Blob (the stage's <video>s play from blob: URLs, so a seek never
 * touches the network) and every desktop frame sequence lands in the decode worker's byte store (sequence.ts),
 * nearest the scroll first. progress() and `warm` still mean the whole active path, which the header hairline and the scroll tests wait
 * for. A path switch loads the other path the same way and keeps the chapters both share. Every image goes in too: the
 * stage's posters and stills (scrub.ts sets them all at mount) and the story's own photos, decoded. Only the active
 * path, at the page's own tier, in one codec (it waits for segments.ts to settle the codec). Save-Data and 2g/3g skip
 * it: the scrub's distance prefetch (scrub.ts) streams those.
 *
 * Desktop plays every story clip as a scroll-scrubbed canvas sequence (sequence.ts): coarse first, bounded decoded LRU,
 * one shared rAF. Phones keep the video. The homepage hero stays a looping MP4.
 */
/** clips the cache fetches at once (a phone's clip is 1–2 MB: two at a time keep the one on screen first in line) */
const VIDEO = 2
/** px/s above which the stream reaches four chapters ahead */
const FAST = 1500
/** the clips the cache holds as Blobs: a desktop frame-sequence clip (#hd2) is the stage canvas's, not a video */
const videos = (p: Path) => CLIPS[p].filter((c) => !isSeq(c.id))
const frameSets = (p: Path) => CLIPS[p].filter((c) => isSeq(c.id))
export const enabled = !(env.saveData || env.slow)

const urls = new Map<string, string>()
let path: Path | null = null
let abort: AbortController | null = null
/** the whole active path is in hand. Tests that scroll with the network quiet wait for this. */
let warm = false
/** the first clip of the active path is a Blob, or its fetch was given up after OPEN_TRIES. The intro waits for this. */
let opening = false
/** bytes of the opening clip, received / declared. The intro's percentage is this, not the whole path. */
let openingBytes = { have: 0, total: 1 }
const OPEN_TRIES = 3
/** a desktop opening frame set: the share of it the intro waits for (all of it: the first chapter never waits on the network), and how long at most (ms) */
const OPEN_SHARE = 1
const OPEN_WAIT = 8000
/**
 * a frame set's coarse level: frame 0 and about every 8th frame (sequence.ts loadOrder), so any scroll position in it is
 * within a few frames of one it has. The intro also waits for the next chapter's first set to reach it (#story-direct:
 * chapter 01 is short, a fast scroll reaches 02 about a second after the intro opens), and inside the loading window
 * every set reaches it before any set fills in.
 */
const COARSE = 0.15
/** ms without a new frame after which a frame set is passed over */
const STALL = 10_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** the run's images, decoded / asked for; each counts as IMG bytes */
let imgs = { done: 0, total: 0 }
const IMG = 150e3
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

// what the cache holds, for tests (navigator.webdriver) and ?debug only
if (navigator.webdriver || new URLSearchParams(location.search).has('debug'))
  Object.defineProperty(globalThis, '__warmCache', {
    get: () => ({ path, ids: [...urls.keys()], progress: progress(), warm, opening, openingProgress: openingProgress() }),
  })

/** blob: URL for a cached clip of the active path, else null */
export const cachedUrl = (id: string) => urls.get(id) ?? null

/** bytes of a clip in the codec and tier this page plays (a frame set: its frames, AVIF or WebP) */
const size = (c: Clip) => (isSeq(c.id) ? SEQ[c.id].bytes : (c.files[codec][served(W, codec)]?.bytes ?? 0))

/** 0..1 of the active path's bytes in memory: its clips' Blobs and its frame sets' bytes */
export function progress() {
  if (!path) return 0
  const all = [...videos(path), ...frameSets(path)]
  const total = all.reduce((a, c) => a + size(c), 0)
  const have = all.reduce((a, c) => a + size(c) * (isSeq(c.id) ? seqProgress(c.id) : urls.has(c.id) ? 1 : 0), 0)
  return total ? (have + imgs.done * IMG) / (total + imgs.total * IMG) : 0
}

/** 0..1 of the opening clip. 1 once that clip is cached, or once the intro is allowed to open. */
export function openingProgress() {
  if (!enabled || opening) return 1
  if (!path) return 0
  return Math.min(1, openingBytes.have / Math.max(1, openingBytes.total))
}
export function onCache(f: () => void) {
  listeners.add(f)
  return () => void listeners.delete(f)
}

/** resolves once the active path is in memory (at once where the cache is off) */
export const pathReady = () =>
  new Promise<void>((done) => {
    if (!enabled || warm) return done()
    const off = onCache(() => warm && (off(), done()))
  })

/** resolves once the first clip is in memory (at once where the cache is off). The intro uses this, not pathReady. */
export const openingReady = () =>
  new Promise<void>((done) => {
    if (!enabled || opening) return done()
    const off = onCache(() => opening && (off(), done()))
  })

/**
 * Stream one opening clip and record real bytes. `base` / `grand`: bytes of the opening clips before this one and of all
 * of them, so the intro's percentage runs once across the whole first chapter. Returns false on a failed response;
 * throws on abort.
 */
async function fetchOpening(ctl: AbortController, c: Clip, base = 0, grand = 0) {
  const res = await fetch(clipUrl(c.id), { signal: ctl.signal, priority: 'high' } as RequestInit)
  if (!res.ok) return false
  const declared = Number(res.headers.get('Content-Length')) || size(c) || 1
  grand = Math.max(grand, base + declared)
  openingBytes = { have: base, total: grand }
  emit()
  const finish = (blob: Blob) => {
    if (ctl.signal.aborted) return false
    urls.set(c.id, URL.createObjectURL(blob))
    openingBytes = { have: base + blob.size, total: Math.max(grand, base + blob.size) }
    emit()
    return true
  }
  if (!res.body) return finish(await res.blob())
  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let have = 0
  let reported = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    have += value.byteLength
    openingBytes = { have: base + have, total: Math.max(grand, base + have) }
    if (have - reported >= 16_384) (reported = have), emit()
  }
  return finish(new Blob(chunks, { type: res.headers.get('Content-Type') || 'video/mp4' }))
}

async function run(p: Path) {
  warm = false
  opening = false
  openingBytes = { have: 0, total: 1 }
  abort?.abort()
  const ctl = (abort = new AbortController())
  await Promise.all([codecReady, avifReady])
  if (ctl.signal.aborted) return
  const clips = videos(p)
  const keep = new Set(clips.map((c) => c.id))
  // the other path's clips go; the chapters both paths share stay cached
  for (const [id, u] of urls) if (!keep.has(id)) (URL.revokeObjectURL(u), urls.delete(id))
  path = p
  const n = (imgs = { done: 0, total: 0 })
  emit()
  const decode = (list: HTMLImageElement[]) => ((n.total += list.length), emit(), decodeAll(list, () => (n.done++, emit())))
  // a frame on: React has the path's stage, and scrub.ts has set its posters' sources
  await new Promise((r) => requestAnimationFrame(r))
  if (ctl.signal.aborted) return
  const pics = Promise.all([
    decode([...document.querySelectorAll<HTMLImageElement>('.stage img[src]')]),
    storyReady.then(() => decode([...document.querySelectorAll<HTMLImageElement>('#main img')])),
  ])
  // the first chapter's clip, byte by byte, before anything else on this path. Three tries, then the intro opens anyway.
  // A desktop path opens on a frame set, frame 0 first.
  const first = clips[0]
  const opener = CLIPS[p][0]
  // the whole first chapter, not just its first clip: a chapter of chained shots (o1, three CG clips) would otherwise
  // reach its second clip on a cold cache before a frame of it is in hand
  const chapter1 = CLIPS[p].filter((c) => opener && c.chapter === opener.chapter)
  if (opener && isSeq(opener.id)) {
    // the opening set whole; the rest of chapter 1 reaches its coarse level in the loop below (PR #324: the first screen
    // under 8 MB at the sharp AVIF sets; o1 is three of them) and fills in from the first scroll
    const sets = [opener]
    sets.forEach((c) => prefetchSeq(c.id))
    const second = CLIPS[p].find((c) => c.chapter === opener.chapter + 1 && isSeq(c.id))
    if (second) prefetchSeq(second.id)
    const ch1 = () => sets.reduce((a, c) => a + Math.min(1, seqProgress(c.id) / OPEN_SHARE) * size(c), 0) / Math.max(1, sets.reduce((a, c) => a + size(c), 0))
    const share = () => ch1() * 0.9 + (second ? Math.min(1, seqProgress(second.id) / COARSE) : 1) * 0.1
    const total = sets.reduce((a, c) => a + size(c), 0) * OPEN_SHARE
    for (const t0 = performance.now(); share() < 1 && !ctl.signal.aborted && performance.now() - t0 < OPEN_WAIT; ) {
      // the next chapter's set only to its coarse level here: on a fast line it would otherwise arrive whole before the
      // first scroll, against the first screen's 8 MB (tests/story-warm-cache.spec.ts)
      if (second && seqProgress(second.id) >= COARSE) pauseSeq(second.id)
      openingBytes = { have: total * share(), total }
      emit()
      await sleep(50)
    }
    if (ctl.signal.aborted) return
    opening = true
    emit()
  } else if (!first || urls.has(first.id)) {
    opening = true
    emit()
  } else {
    // the first clip only (PR #324: a phone's first screen under 3 MB): the rest of chapter 1 streams right behind it,
    // first in the window below, while the visitor watches clip 1 (three tries, then the intro opens anyway)
    const vids = chapter1.filter((c) => !isSeq(c.id)).slice(0, 1)
    const grand = vids.reduce((a, c) => a + size(c), 0)
    let base = 0
    for (const c of vids.length ? vids : [first]) {
      let ok = urls.has(c.id)
      for (let attempt = 0; attempt < OPEN_TRIES && !ok && !ctl.signal.aborted; attempt++)
        ok = await fetchOpening(ctl, c, base, grand).catch(() => false)
      if (ctl.signal.aborted) return
      base += size(c)
    }
    opening = true
    emit()
  }
  const fetching = new Set<string>()
  // a clip that failed: a 4xx (missing file) is given up for good, anything else (network, 5xx) waits before another
  // try, longer each time, and is given up after RETRIES. A given-up clip counts as done, so `warm` doesn't wait on it
  // and it never holds a fetch slot again (the decoders still stream it from the network)
  const failed = new Set<string>()
  const retry = new Map<string, { at: number; tries: number }>()
  const RETRIES = 3
  const giveUp = (id: string) => (failed.add(id), retry.delete(id))
  const fetchOne = async (c: Clip) => {
    fetching.add(c.id)
    try {
      const res = await fetch(clipUrl(c.id), { signal: ctl.signal, priority: 'low' } as RequestInit)
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) giveUp(c.id)
        else throw new Error(String(res.status))
        return
      }
      const blob = await res.blob()
      if (ctl.signal.aborted) return
      retry.delete(c.id)
      urls.set(c.id, URL.createObjectURL(blob))
      emit()
    } catch (e) {
      if (ctl.signal.aborted) return
      const tries = (retry.get(c.id)?.tries ?? 0) + 1
      if (tries >= RETRIES) giveUp(c.id)
      else retry.set(c.id, { at: performance.now() + 1000 * 2 ** tries, tries })
      throw e
    } finally {
      fetching.delete(c.id)
    }
  }
  // Streaming (perf/story-smooth-scroll): nothing loads that the scroll is not about to reach. Before the first scroll,
  // the opening chapter and the next chapter's first batch (its frame sets to their coarse level, its first clip); after
  // it, the chapter on screen, the next two in the direction of travel and the one just passed. Frame sets go breadth
  // first (every set in the window to its coarse level, then the window fills in; the chapter on screen keeps loading
  // throughout); clips go nearest first, VIDEO at a time. Everything else is parked (in-flight frames finish). Re-picked
  // every 50 ms. `warm` is live: the window around the scroll is in hand. A set stuck for STALL (a failed frame) is
  // passed over: the frames it does have still draw.
  const list = CLIPS[p]
  const stalled = new Set<string>()
  const last = new Map<string, { at: number; since: number }>()
  const done = (c: Clip) => (isSeq(c.id) ? seqProgress(c.id) >= 1 || stalled.has(c.id) : urls.has(c.id) || failed.has(c.id))
  let y = frame.scroll
  let reach = 2
  for (;;) {
    if (ctl.signal.aborted) return
    // a fast scroll (over FAST px/s) reaches further ahead: four chapters instead of two, until it slows
    const speed = Math.abs(frame.scroll - y) * 20
    y = frame.scroll
    reach = speed > FAST ? 4 : speed < FAST / 3 ? 2 : reach
    const cur = Math.max(0, frame.index)
    const back = frame.dir < 0
    const ahead = (c: Clip) => (c.chapter - cur) * (back ? -1 : 1)
    const first = !hasScrolled()
    const inWin = (c: Clip) => (first ? ahead(c) === 0 || ahead(c) === 1 : ahead(c) >= -1 && ahead(c) <= reach)
    // before the first scroll the next chapter is a first batch only: its sets to the coarse level, its first clip
    // and the opening chapter's other frame sets to their coarse level only
    const enough = (c: Clip) =>
      first && (ahead(c) === 1 || (isSeq(c.id) && c.id !== list[0]?.id))
        ? isSeq(c.id)
          ? seqProgress(c.id) >= COARSE
          : urls.has(c.id) || c.id !== list.find((d) => d.chapter === c.chapter && !isSeq(d.id))?.id
        : done(c)
    const win = list.filter(inWin)
    const sets = win.filter((c) => isSeq(c.id) && !enough(c))
    const thin = sets.filter((c) => seqProgress(c.id) < COARSE)
    const go = thin.length ? sets.filter((c) => ahead(c) === 0 || thin.includes(c)) : sets
    const now = performance.now()
    for (const c of list.filter((c) => isSeq(c.id) && !done(c))) {
      if (!go.includes(c)) {
        pauseSeq(c.id)
        last.delete(c.id)
        continue
      }
      prefetchSeq(c.id)
      const at = seqProgress(c.id)
      const l = last.get(c.id)
      if (!l || l.at !== at) last.set(c.id, { at, since: now })
      else if (now - l.since > STALL) stalled.add(c.id)
    }
    const vids = win.filter((c) => !isSeq(c.id) && !enough(c) && !fetching.has(c.id) && !failed.has(c.id) && !((retry.get(c.id)?.at ?? 0) > now)).sort((x, y) => Math.abs(ahead(x)) - Math.abs(ahead(y)) || x.seg - y.seg)
    for (const c of vids.slice(0, Math.max(0, VIDEO - fetching.size))) void fetchOne(c).catch(() => {})
    const caught = win.every(enough) && fetching.size === 0
    if (caught !== warm) {
      warm = caught
      emit()
    }
    // the whole path is in hand: nothing left to stream
    if (list.every(done)) break
    await sleep(50)
  }
  await pics
  emit()
  if (!ctl.signal.aborted) {
    warm = true
    emit()
  }
}

/** Starts at mount, before the intro opens, and follows path switches. */
export function startWarmCache() {
  if (!enabled) return () => {}
  void run(store.getState().path)
  return store.subscribe((s) => {
    if (path && s.path !== path) void run(s.path)
  })
}
