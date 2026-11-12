import { env } from '../engine/env'
import { frame, store } from '../engine/store'
import { landing } from '../engine/path'
import { onTick } from '../engine/ticker'
import { Sequence, createStage } from './sequence'
import { avifReady, clipUrl, isSeq, posterFor, seqFrames, seqUrl, type Segment } from './segments'
import { cachedUrl, enabled } from './warmcache'

/**
 * Video engine (TRD §6, redesign §2.3-2.4). A pool of POOL <video> decoders.
 * - The picture follows the scroll in both directions. Scrolling up rewinds the clip and returns to earlier chapters.
 *   Scrolling down again moves on from the frame now on screen.
 * - The current clip loads on entry; after the first scroll, once it has metadata, the next AHEAD clips below it load
 *   in parallel (one more while the scroll is fast), never past the next chapter. A clip on screen for under a second
 *   can't wait for its neighbour to finish buffering first.
 * - A new clip takes the decoder whose clip is furthest from the current segment, never one inside that window.
 * - One seek in flight; the newest target is applied on `seeked`. Targets outside `buffered` are held for HOLD ms, so the
 *   last presented frame stays up instead of stalling or flashing back to the poster; after that the picture follows the
 *   buffered frame nearest the target, so it keeps moving with the page as the download arrives.
 * - While the scroll is fast (`vel > FAST`), `fastSeek()` keeps a hardware decoder from queueing exact 40 ms seeks.
 *   Slow travel, and the settle seek that applies `pending`, use exact `currentTime`. A `seeked` marks the frame
 *   painted before any follow-up seek, so a clip entered mid-scroll is visible while the wheel is still moving.
 */
interface Slot {
  v: HTMLVideoElement
  id: string | null
  painted: boolean
  pending: number | null
  /** when the current target was first found outside `buffered` (0: it wasn't) */
  holdSince: number
  dead: boolean
  /** fired loadeddata since the last load(): a slot that ever decoded a frame is never marked dead by the timer */
  loaded: boolean
  /** fired canplaythrough */
  ready: boolean
  /** last time this slot was the current clip (breaks eviction ties) */
  used: number
  /** playing from the warm cache's blob: URL (#251), so its seeks never touch the network */
  blob: boolean
}

const FRAME = 1 / 24
const EPS = 1 / 48
/** ms a target outside `buffered` is held before the picture moves to the nearest buffered frame */
const HOLD = 250
/** px per tick above which a seek uses fastSeek instead of an exact currentTime */
const FAST = 30
/** share of a segment's scroll the dip to the veil takes on each side of a chapter join */
const DIP = 0.025
/**
 * The canvas crossfade into the next frame set (every join between two sets, inside a chapter too): the last 20-25 % of
 * the outgoing segment, and never under 150 px of scroll at 900 px tall (16.7 vh) (PR #324 audit, item 4; was 6 %)
 */
const XF_MIN = 0.2
const XF_MAX = 0.25
const XF_VH = (150 / 900) * 100
const xfOf = (seg: Segment) => Math.min(XF_MAX, Math.max(XF_MIN, XF_VH / Math.max(1, seg.vh)))
const light = env.mobile || env.saveData || env.slow
/** decoders on the stage (ScrubStage renders this many <video>s) */
export const POOL = env.mobile ? 4 : 5
/** clips prefetched ahead of the scroll: three on desktop, two on phones, Save-Data and 3G or slower; one more while fast */
const AHEAD = light ? 2 : 3

let segs: Segment[] = []
let posters: (HTMLElement | null)[] = []
let slots: Slot[] = []
/** one slot per <video> for the page's life: a path switch rebinds the stage but keeps what the decoders already hold */
const slotOf = new WeakMap<HTMLVideoElement, Slot>()
let veil: HTMLElement | null = null
let stage: HTMLElement | null = null
let cur = -1
let shown: Slot | null = null
let dip = 0
let veilLight = false
let hidden = false
let isLight = false
let isSoft = false
let isCg = false
let isRight = false
let zoomKey = ''
let lastY = 0
/** px moved on the last tick, so a follow-up seek can stay on fastSeek until the wheel slows */
let travel = 0
/**
 * Read by tests/video-smoothness.spec.ts and tests/terminal-mode.spec.ts: the clip that should be on screen, the time
 * it should show, whether its decoder is the picture (`shown`) and whether the stage has a picture at all (`painted`:
 * the clip, or the poster, still, gradient or globe layer under it). Plain writes, no DOM.
 */
const probe = { id: null as string | null, target: 0, shown: false, chapter: -1, painted: false, local: 0 }
;(globalThis as { __scrub?: typeof probe }).__scrub = probe
// the decoder pool, for tests (navigator.webdriver) and ?debug only
if (navigator.webdriver || new URLSearchParams(location.search).has('debug'))
  Object.defineProperty(globalThis, '__scrubSlots', {
    get: () => slots.map((s) => ({ id: s.id, readyState: s.v.readyState, ready: s.ready, dead: s.dead, painted: s.painted })),
  })
let clock = 0

/**
 * Desktop frame sequences (#hd2, chapters.ts SEQ_CLIPS): one canvas over the posters, at the decoders' level, drawing
 * the frame nearest the scroll position of a sequence clip (sequence.ts). A set starts fetching (frame 0, then coarse
 * first) when its clip comes within the decoders' look-ahead or the warm cache's window; a set off screen keeps its
 * bytes in the worker and closes its bitmaps.
 */
let seqCanvas: HTMLCanvasElement | null = null
let seqStage: ReturnType<typeof createStage> | null = null
let seqOn = false
const seqs = new Map<string, Sequence>()
/** decoded around the frame on screen: 24 ahead in the scroll's direction, 3 behind (sequence.ts pump; PR #324 item 5) */
const SEQ_LRU = 28
let avifKnown = false
void avifReady.then(() => (avifKnown = true))
const seqFor = (id: string) => {
  if (!avifKnown) return null
  let s = seqs.get(id)
  if (!s) seqs.set(id, (s = new Sequence({ id: `stage-${id}`, frames: seqFrames(id), url: (i) => seqUrl(id, i), lru: SEQ_LRU })))
  return s
}
/** start fetching a sequence clip's frames (the warm cache calls this for every set of the path, at mount) */
export const prefetchSeq = (id: string) => void seqFor(id)?.prefetch()
/** park a set's fetching (the warm cache's scheduler, for a set far from the scroll) */
export const pauseSeq = (id: string) => void seqs.get(id)?.pause()
/** 0..1 of a sequence clip's frames in the worker */
export const seqProgress = (id: string) => seqs.get(id)?.progress ?? 0
/** neighbours are only prefetched after the visitor first scrolls, so the first screen costs just the first clip */
let scrolled = false
/** the visitor has scrolled since the page opened (the warm cache streams a wider window from then on) */
export const hasScrolled = () => scrolled
let stopTick: (() => void) | null = null

export function bindStage(el: HTMLElement, segments: Segment[]) {
  stage = el
  segs = segments
  posters = segments.map((_, i) => el.querySelector<HTMLElement>(`[data-seg="${i}"]`))
  veil = el.querySelector('.stage__veil')
  slots = [...el.querySelectorAll('video')].map((v) => slotOf.get(v) ?? makeSlot(v))
  seqCanvas = el.querySelector('canvas.stage__seq')
  seqStage = seqCanvas && createStage(seqCanvas)
  const ro = seqCanvas && seqStage ? new ResizeObserver(seqStage.resize) : null
  if (ro && seqCanvas && seqStage) (ro.observe(seqCanvas), seqStage.resize())
  seqOn = false
  // a path switch: the canvas still holds the other path's last frame until this path draws
  if (seqCanvas) seqCanvas.style.opacity = '0'
  for (const s of slots) s.v.style.opacity = '0'
  cur = -1
  shown = null
  stopTick?.()
  stopTick = onTick(tick, -5)
  const stopReady = store.subscribe((st, was) => st.ready && !was.ready && cur >= 0 && loadPosters(cur))
  // the first poster loads now, under the intro; the rest follow the scroll (loadPosters), so the first screen costs only
  // the chapter it shows (perf/story-smooth-scroll)
  if (enabled) void avifReady.then(() => loadRange(0, 0))
  return () => {
    ro?.disconnect()
    stopReady()
    stopTick?.()
    stopTick = null
  }
}

/**
 * Loader gate (#218): buffer these clips into free decoders before the reveal, so the chosen path's first chapter plays
 * on arrival. Returns their elements; the loader waits for `canplaythrough`.
 */
export function warm(ids: string[]) {
  return ids.flatMap((id) => (isSeq(id) ? [] : (slotFor(id, ids, 0)?.v ?? [])))
}

function makeSlot(v: HTMLVideoElement): Slot {
  const s: Slot = { v, id: null, painted: false, pending: null, holdSince: 0, dead: false, loaded: false, ready: false, used: 0, blob: false }
  slotOf.set(v, s)
  v.muted = true // React doesn't reflect the muted attribute reliably
  const markPainted = () => {
    if (v.requestVideoFrameCallback) {
      let done = false
      v.requestVideoFrameCallback(() => (done = s.painted = true))
      // rVFC may not fire for a paused element in every browser; don't leave the poster up forever
      setTimeout(() => !done && v.readyState >= 2 && (s.painted = true), 120)
    } else s.painted = true
  }
  v.addEventListener('loadeddata', () => {
    s.loaded = true
    s.dead = false
    markPainted()
  })
  v.addEventListener('canplay', () => (s.dead = false))
  v.addEventListener('canplaythrough', () => (s.ready = true))
  v.addEventListener('error', () => (s.dead = true))
  v.addEventListener('seeked', () => {
    // Paint before any follow-up. Returning first left a clip entered mid-scroll invisible until the wheel stopped.
    if (v.readyState >= 2) s.painted = true
    else markPainted()
    s.dead = false
    if (s.pending !== null && Math.abs(v.currentTime - s.pending) > EPS) {
      const next = s.pending
      s.pending = null
      // Still moving fast: keyframe seek. The settle, once the wheel has slowed, is the exact frame.
      if (travel > FAST && typeof v.fastSeek === 'function') v.fastSeek(next)
      else v.currentTime = next
      return
    }
    s.pending = null
  })
  return s
}

function load(s: Slot, id: string) {
  s.id = id
  s.painted = false
  s.pending = null
  s.dead = false
  s.loaded = false
  s.ready = false
  const cached = cachedUrl(id)
  s.blob = cached !== null
  // the clip id, readable whether the source is a file or a blob: URL
  s.v.dataset.clip = id
  s.v.src = cached ?? clipUrl(id)
  s.v.load()
  // iOS Low Power Mode and friends: no first frame after 4 s → posters until `loadeddata` arrives. Not readyState: it
  // drops below 2 during every seek, and a clip caught mid-seek would sit on its poster for the rest of the chapter.
  setTimeout(() => {
    if (s.id === id && !s.loaded) s.dead = true
  }, 4000)
}

const videoId = (i: number) => {
  const m = segs[i]?.media
  return m?.kind === 'video' ? m.id : null
}

/** The next `n` distinct clips after segment i, in this chapter and the next only (skipping stills/globe). */
function clipsFrom(i: number, n: number) {
  const out: string[] = []
  const last = segs[i].chapter + 1
  for (let k = i + 1; k < segs.length && segs[k].chapter <= last && out.length < n; k++) {
    const id = videoId(k)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** The previous `n` distinct clips before segment i, in this chapter and the one above it. */
function clipsBehind(i: number, n: number) {
  const out: string[] = []
  const first = segs[i].chapter - 1
  for (let k = i - 1; k >= 0 && segs[k].chapter >= first && out.length < n; k--) {
    const id = videoId(k)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** Segments between segment `at` and the nearest one playing `id` (Infinity: not on this path). */
function distance(id: string | null, at: number) {
  let best = Infinity
  segs.forEach((s, k) => s.media.kind === 'video' && s.media.id === id && (best = Math.min(best, Math.abs(k - at))))
  return best
}

/** Slot holding `id`, else load it into a free slot or the one whose clip is furthest from segment `at`, never one in `keep`. */
function slotFor(id: string, keep: (string | null)[], at: number) {
  const have = slots.find((s) => s.id === id)
  if (have) return have
  const free = slots.filter((x) => x !== shown && (x.id === null || !keep.includes(x.id)))
  const far = (x: Slot) => (x.id === null ? Infinity : distance(x.id, at))
  const s = free.sort((a, b) => far(b) - far(a) || a.used - b.used)[0]
  if (!s) return null
  load(s, id)
  return s
}

function setShown(s: Slot | null) {
  if (shown === s) return
  if (shown) shown.v.style.opacity = '0'
  if (s) s.v.style.opacity = '1'
  shown = s
}

function tick() {
  if (!segs.length) return
  clock++
  const vel = Math.abs(frame.scroll - lastY)
  lastY = frame.scroll
  travel = vel
  // the whole film is off screen: stop all work, keep the decoders' sources so the way back doesn't re-download
  if (frame.past !== hidden) {
    hidden = frame.past
    if (stage) stage.style.visibility = hidden ? 'hidden' : 'visible'
    if (hidden) {
      setShown(null)
      clearLayers(-1)
      cur = -1
    }
  }
  if (hidden) return

  // current segment from (chapter, local)
  let i = segs.findIndex((s) => s.chapter === frame.index && frame.local < s.to)
  if (i < 0) i = segs.findLastIndex((s) => s.chapter === frame.index)
  if (i < 0) return
  const seg = segs[i]
  const span = seg.to - seg.from
  const at = span > 0 ? Math.min(1, Math.max(0, (frame.local - seg.from) / span)) : 0
  // The segment under scrollY owns the stage. An earlier chapter replaces the later picture; nothing is held.
  if (i !== cur) enter(i, cur)
  // Inside the segment the picture is `at` in both directions. Down assigns that position directly, so a rewind
  // never blocks the next scroll down. Up scrubs the same position, so the stage stays with the caption.
  const p = at

  // decoders: current now; neighbours ahead while scrolling down, neighbours behind while scrolling up
  const clip = videoId(i)
  const seqNow = clip !== null && isSeq(clip)
  // decoders take the video clips only; a sequence clip is drawn on the canvas
  const want = seqNow ? null : clip
  const up = frame.dir < 0
  const behindN = up ? (vel > FAST ? 2 : 1) : 0
  const aheadN = Math.min(POOL - 1 - behindN, AHEAD + (vel > FAST && !up ? 1 : 0))
  const near = clipsFrom(i, aheadN)
  const behind = clipsBehind(i, behindN)
  const ahead = near.filter((id) => !isSeq(id))
  const behindVideo = behind.filter((id) => !isSeq(id))
  const keep = [want, ...ahead, ...behindVideo]
  let active: Slot | null = null
  if (want) {
    active = slotFor(want, keep, i)
    if (active) {
      active.used = clock
      seek(active, p, vel, playUntil(seg), playFrom(seg))
      probe.target = mediaTime(p, active.v.duration || 0, playUntil(seg), playFrom(seg))
    }
  }
  // a deep link (#ocean / #pond) lands mid-film: measure the first scroll from there, so it doesn't prefetch on arrival
  if (!scrolled && !landing.pending && Math.abs(frame.scroll - Math.max(0, landing.y)) > 2) {
    scrolled = true
    loadPosters(i)
  }
  if (scrolled && (!want || (active && (active.v.readyState >= 1 || active.dead)))) {
    for (const id of ahead) slotFor(id, keep, i)
    for (const id of behindVideo) slotFor(id, keep, i)
  }
  // Never an empty stage: until this segment has a picture of its own (its decoder painted, or its poster/still loaded),
  // the previous picture stays up, whether that is a decoder or the sequence canvas.
  const ready = layerReady(i)
  const painted = !!(active && active.painted && !active.dead)
  setShown(painted ? active : ready || seqNow ? null : shown)
  // the sequence clip on screen, and the sets coming up (fetch only); every other set gives back its bitmaps
  const nextSeg = segs[i + 1]
  // a crossfade at every join between two frame sets, inside a chapter or into the next: the next set's entry frame fades
  // in over this one on the canvas over the last xf of the segment, tied to the scroll, so it plays the same both ways
  // (both are decoded pictures, so no blank or teal frame between). Every other join (the docs cut) stays a cut.
  const nextClip = videoId(i + 1)
  const crossTo = seqNow && seg.join === 'crossfade' && nextSeg && nextClip && isSeq(nextClip) ? seqFor(nextClip) : null
  const xf = xfOf(seg)
  const nextAt = crossTo && nextSeg ? crossTo.index(seqAt(0, crossTo.spec.frames, playUntil(nextSeg), playFrom(nextSeg))) : 0
  let fadeNow = 0
  let drawn = -1
  if (seqNow && seqStage && clip) {
    const sq = seqFor(clip)
    if (sq) {
      const at = seqAt(p, sq.spec.frames, playUntil(seg), playFrom(seg))
      // a far decoded neighbour of a trimmed clip is the frame this join skips (the seated spreader, the chassis gone)
      const slack = playFrom(seg) > 0 || playUntil(seg) < 1 ? 2 : undefined
      // a clip trimmed with `until` never blends in a frame past its end (hf-ship: the placard after frame 28)
      const last = playUntil(seg) < 1 ? Math.floor(seqAt(1, sq.spec.frames, playUntil(seg), playFrom(seg)) * (sq.spec.frames - 1)) : undefined
      const fade = crossTo ? Math.max(0, (p - (1 - xf)) / xf) : 0
      // the next set is handed to the stage only near the join: draw() pumps it, and from the top of the chapter that
      // fetched a whole next set before the first scroll (the entry frame is decoded ahead by pumpEntry anyway)
      const xNext = crossTo && p >= 1 - 2 * xf ? crossTo : undefined
      fadeNow = xNext ? fade : 0
      drawn = seqStage.draw({ seq: sq, at, slack, last, next: xNext, nextAt, fade: fadeNow })
      probe.target = sq.index(at) / 24
    }
  }
  // a set coming up has its entry frame decoded already (its bytes are in memory), so the cut onto it draws at once:
  // the decoders' look-ahead, and always the next two scenes, whichever chapter they are in
  const ahead2 = [i + 1, i + 2].map(videoId).filter((id): id is string => id !== null && isSeq(id))
  // One set at a time, nearest first: the next set starts once the one before it is whole, so the frames under the scroll
  // are never queued behind frames further on. Up the page, the same from the set above.
  if (scrolled || seqNow) {
    for (const id of up ? [clip, ...behind] : [clip, ...near, ...ahead2]) {
      if (!id || !isSeq(id)) continue
      const sq = seqFor(id)
      if (!sq) break
      // before the first scroll a neighbour gets only its entry frame here: the warm cache brings the next chapter to
      // its coarse level, and a whole next set fetched now would count against the first screen (story-warm-cache)
      if (!scrolled && id !== clip) {
        pumpEntry(id)
        continue
      }
      sq.prefetch()
      // after the first screen the set on screen and the next one fetch fine-first around where the scroll is, or will
      // enter (PR #324 item 5): no gap under the scroll waits behind the coarse levels of frames far off
      sq.fine = scrolled && (id === clip || id === (up ? behind[0] : near[0]))
      if (id !== clip) up ? sq.pump(sq.spec.frames - 1, false) : (pumpEntry(id), sq.fine && sq.pump(entryOf(id), false))
      if (!sq.complete) break
    }
  }
  for (const [id, sq] of seqs) if (id !== clip && !near.includes(id) && !ahead2.includes(id) && !behind.includes(id)) sq.release()
  // the canvas keeps the last frame it drew while this segment's own picture isn't ready yet (a set still decoding, a
  // poster still loading): the hold, instead of the stage's teal background
  const hold = seqOn && drawn < 0 && !painted && !ready
  const on = drawn >= 0 || hold
  if (seqCanvas && on !== seqOn) seqCanvas.style.opacity = (seqOn = on) ? '1' : '0'
  if (seqCanvas && on) {
    seqCanvas.dataset.frame = String(drawn)
    seqCanvas.dataset.mix = String(seqStage?.mix ?? 0)
    seqCanvas.dataset.xf = fadeNow.toFixed(3)
    seqCanvas.dataset.clip = clip ?? ''
  }
  // a decoder still on its network source moves to the warm cache's blob once that clip is cached: right away when it's
  // off screen, never under a clip the visitor is watching
  for (const s of slots) if (s.id && !s.blob && cachedUrl(s.id) && s !== shown) load(s, s.id)
  probe.id = clip
  probe.chapter = seg.chapter
  probe.local = frame.local
  probe.shown = seqNow ? drawn >= 0 : shown !== null && shown === active
  // something is on screen: the clip's decoder, the layer under it (a poster, a still, a gradient or the globe), or the
  // previous picture held until one of those is ready
  probe.painted = probe.shown || ready || on || shown !== null

  // placeholders (stills and the port/sea gradients): slow push-in
  const m = seg.media
  if (m.kind === 'still' || m.kind === 'gradient') posters[i]!.style.transform = `scale(${1 + 0.04 * p})`

  // the clip is painted: its poster goes, so the stage never shows a poster and a clip at once
  const cover = posters[i]
  if (cover && m.kind === 'video') {
    const want = probe.shown ? '0' : '1'
    if (cover.style.opacity !== want) cover.style.opacity = want
  }

  // Joins between two frame sets crossfade on the canvas (above); every other join is a straight cut that holds the
  // previous picture until the next one is ready. Only the globe join still dips, through the light veil (the globe is
  // a DOM layer the canvas can't blend), tied to the scroll so it plays the same in both directions.
  const prevSeg = segs[i - 1]
  const globeJoin = (a?: Segment, b?: Segment) => a?.media.kind === 'globe' || b?.media.kind === 'globe'
  const dipIn =
    prevSeg?.join === 'crossfade' && prevSeg.chapter !== seg.chapter && globeJoin(prevSeg, seg) ? Math.max(0, 1 - p / DIP) : 0
  const dipOut =
    seg.join === 'crossfade' && nextSeg && nextSeg.chapter !== seg.chapter && globeJoin(seg, nextSeg) ? Math.max(0, (p - (1 - DIP)) / DIP) : 0
  const d = Math.max(dipIn, dipOut)
  if (d !== dip && veil) veil.style.opacity = String((dip = d))
  // the stage turns light (no dark scrim) once the globe owns the frame; the veil is light either side of that join
  const light = seg.media.kind === 'globe'
  if (light !== isLight) {
    isLight = light
    stage?.classList.toggle('is-light', light)
  }
  const toLight = light || nextSeg?.media.kind === 'globe'
  if (toLight !== veilLight) {
    veilLight = toLight
    stage?.classList.toggle('veil-light', toLight)
  }
  const soft = seg.scrim === 'soft'
  if (soft !== isSoft) {
    isSoft = soft
    stage?.classList.toggle('is-soft', soft)
  }
  const cg = seg.scrim === 'cg'
  if (cg !== isCg) {
    isCg = cg
    stage?.classList.toggle('is-cg', cg)
  }
  // a segment's desktop reframe (chapters.ts Media zoom), through two custom properties on the stage (stage.css)
  const z = seg.media.kind === 'video' && !env.mobile ? seg.media.zoom : undefined
  const zk = z ? `${z.scale} ${z.x}` : ''
  if (zk !== zoomKey && stage) {
    zoomKey = zk
    stage.style.setProperty('--zoom', String(z?.scale ?? 1))
    stage.style.setProperty('--zoom-x', `${(z?.x ?? 0.5) * 100}%`)
  }
  if (!!seg.right !== isRight) {
    isRight = !!seg.right
    stage?.classList.toggle('is-right', isRight)
  }
}

/** Where scroll starts inside a clip. 0 keeps the head, including a shared boundary frame. */
function playFrom(seg: Segment) {
  return seg.media.kind === 'video' && seg.media.from ? seg.media.from : 0
}

/** A clip may stop short of its last frame (`until`), so a push-in that crops the subject is never the picture on screen. */
function playUntil(seg: Segment) {
  return seg.media.kind === 'video' && seg.media.until ? seg.media.until : 1
}

function mediaTime(p: number, duration: number, until: number, from = 0) {
  const end = Math.max(0, duration * until - FRAME)
  const start = Math.min(end, Math.max(0, duration * from))
  return start + p * (end - start)
}

/**
 * Sequence progress for the same window a video uses. A full clip (`from` 0, `until` 1) stays `p`, so a shared
 * boundary still meets the next clip's first frame. `until` of 1 still ends on the last frame.
 */
function seqAt(p: number, frames: number, until: number, from: number) {
  if (from === 0 && until === 1) return p
  const dur = frames / 24
  const end = until >= 1 ? dur : Math.max(0, dur * until - FRAME)
  const start = Math.min(end, Math.max(0, dur * from))
  return Math.min(1, Math.max(0, (start + p * (end - start)) / dur))
}

/** The frame a sequence clip is entered on (a trimmed head starts past 0). */
function entryOf(id: string) {
  const sq = seqFor(id)
  const seg = segs.find((s) => s.media.kind === 'video' && s.media.id === id)
  return sq && seg ? sq.index(seqAt(0, sq.spec.frames, playUntil(seg), playFrom(seg))) : 0
}

/** Decode the frame a neighbour sequence is entered on, so a trimmed head is ready before the cut. */
function pumpEntry(id: string) {
  seqFor(id)?.pumpOne(entryOf(id))
}

function seek(s: Slot, p: number, vel: number, until = 1, from = 0) {
  const v = s.v
  if (v.readyState < 1 || !Number.isFinite(v.duration)) return
  // no extra easing here: Lenis already smooths the scroll, a second lerp only adds lag behind the page
  let t = mediaTime(p, v.duration, until, from)
  // hold the last presented frame while the range is still downloading; if the browser stopped preloading, the seek asks for it.
  // Held for more than HOLD ms: show the buffered frame nearest the target instead, so the picture doesn't sit still
  if (!buffered(v, t) && v.networkState === v.NETWORK_LOADING) {
    const now = performance.now()
    s.holdSince ||= now
    const near = now - s.holdSince > HOLD ? nearestBuffered(v, t) : null
    if (near === null) return
    t = near
  } else s.holdSince = 0
  if (v.seeking) {
    s.pending = t
    return
  }
  if (Math.abs(v.currentTime - t) <= EPS) return
  // Fast travel steps by keyframe. Slow travel lands on the exact frame. The pending settle in `seeked` is exact too.
  if (vel > FAST && typeof v.fastSeek === 'function') v.fastSeek(t)
  else v.currentTime = t
}

function buffered(v: HTMLVideoElement, t: number) {
  const b = v.buffered
  for (let k = 0; k < b.length; k++) if (t >= b.start(k) - EPS && t <= b.end(k) + EPS) return true
  return false
}

/** The buffered time closest to `t` between the current frame and `t` (in the direction of travel), or null. */
function nearestBuffered(v: HTMLVideoElement, t: number) {
  const from = v.currentTime
  const lo = Math.min(from, t)
  const hi = Math.max(from, t)
  let best: number | null = null
  const b = v.buffered
  for (let k = 0; k < b.length; k++) {
    // a frame short of the range's end: the last buffered frame may not be complete yet
    const c = Math.min(Math.max(t, b.start(k)), Math.max(b.start(k), b.end(k) - FRAME))
    if (c >= lo && c <= hi && (best === null || Math.abs(c - t) < Math.abs(best - t))) best = c
  }
  return best
}

/** Segment k's own layer can show a picture now: a loaded poster/still image, or a gradient, desk or globe layer. */
function layerReady(k: number) {
  const el = posters[k]
  if (!el) return false
  return el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : true
}

/** Every stage layer to opacity 0 except `keep`. */
function clearLayers(keep: number) {
  posters.forEach((el, k) => {
    if (el && k !== keep) el.style.opacity = '0'
  })
}

/**
 * Posters load lazily: this segment's and every one to the end of the next chapter (the clips' window: a poster is what
 * a fast scroll shows before its clip arrives), but only this one until the loader is done (first screen = LCP).
 */
function loadPosters(i: number) {
  if (!scrolled) return
  const next = (segs[i]?.chapter ?? 0) + 1
  loadRange(i, store.getState().ready ? Math.max(i + 2, segs.findLastIndex((s) => s.chapter <= next)) : i)
}
function loadRange(i: number, last: number) {
  for (let k = i; k <= last; k++) {
    const p = posters[k]
    // the URL is taken here, not at render: by now the page knows whether AVIF decodes
    const src = segs[k] && posterFor(segs[k].media)
    if (p instanceof HTMLImageElement && !p.getAttribute('src') && src) p.src = src
  }
}

function enter(i: number, prev: number) {
  // coming back from the business sections (or the first frame): nothing to fade from, start clean
  if (prev < 0) clearLayers(i)
  if (prev >= 0 && posters[prev]) posters[prev]!.style.opacity = '0'
  loadPosters(i)
  // the frame under the scroll, whichever way the segment is entered
  if (posters[i]) posters[i]!.style.opacity = '1'
  // an intentional cut (documentation → port) is a straight cut too: no flash through the page colour, the previous
  // picture holds until the next one is ready (tick)
  cur = i
}
