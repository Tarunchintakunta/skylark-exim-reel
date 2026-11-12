import { env } from '../engine/env'
import type { FromWorker, ToWorker } from './decode.worker'

/**
 * Canvas image-sequence engine (#264, the Terminal Industries pattern): one <canvas> per stage, drawImage of the frame
 * nearest the scroll position, cross-fading between sequences.
 *
 * - frames are fetched and decoded in a Web Worker (decode.worker.ts), which keeps each frame's compressed bytes and
 *   decodes on demand, so the main thread only draws and no frame is ever fetched twice
 * - decoded bitmaps are capped (LRU around the frame on screen); dropping one costs a decode, never a request
 * - frames arrive coarse first (every 32nd, then 16th, 8th, 4th, 2nd, all), so any position shows a frame early at low
 *   frame density and sharpens as the gaps fill in
 * - drawing runs on the page's one rAF (engine/ticker.ts, which already drives Lenis and GSAP ScrollTrigger); the canvas
 *   size is read on mount and on resize only, never in the scroll handler
 *
 * The scroll position comes in as (sequence, 0..1); this module reads neither the scroll nor the layout.
 */

/** decoded bitmaps held at once per sequence: 24 × 1920×1080 RGBA ≈ 190 MB of bitmaps on desktop, 10 on a phone */
const LRU = env.mobile ? 10 : 24
/** frame fetches in flight at once across every set (Terminal's concurrency: 6 desktop, 3 phone) */
export const PARALLEL = env.mobile ? 3 : 6
/** of those, the share a set that is not on screen may take: the set on screen always has RESERVE slots free */
const RESERVE = 2
/** decodes in flight at once per set, apart from the fetches: a decode never waits behind the network */
const DECODES = env.mobile ? 2 : 4
/** fetches in flight, all sets */
let net = 0
/** Save-Data, 2G and 3G: every second frame only, half the bytes for half the frame density */
const DENSITY = env.saveData || env.slow ? 2 : 1
/** frames either side of the one on screen that count as "something is loaded here" */
const NEAR = 2
/** decoded ahead of the frame on screen, in the scroll's direction (up the page too); the rest of the LRU lies behind */
const AHEAD = 24
/** a decoded neighbour further off than this is never drawn in the frame's place: the last good frame holds (#324) */
const MAX_OFF = 3
/** the canvas is sized at the device pixel ratio (PR #324: never a CSS-px canvas stretched by the compositor) */
export const dpr = () => devicePixelRatio || 1
/** the frame sets' native size (scripts/clip-frames.sh: 1920x1080) */
const NATIVE_W = 1920
const NATIVE_H = 1080

export interface SequenceSpec {
  /** unique per frame set: the worker keeps one byte store per id */
  id: string
  /** number of frames, indexed 0..frames-1 */
  frames: number
  /** URL of one frame, already versioned (media.ts mediaUrl) */
  url: (i: number) => string
  /** decoded bitmaps held at once (default LRU); the /story stage's 2560 sets hold fewer (#hd2) */
  lru?: number
}

/**
 * Coarse-first order: every 32nd frame, then every 16th, …, then the rest. Each frame appears once. `density` thins the
 * set out: Save-Data and 2G/3G load every second frame and let `nearest` show the neighbour (#264).
 */
export function loadOrder(frames: number, density = DENSITY): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (const stride of [32, 16, 8, 4, 2, 1])
    for (let i = 0; i < frames; i += stride)
      if (!seen.has(i) && (i % density === 0 || i === frames - 1)) {
        seen.add(i)
        out.push(i)
      }
  return out
}

let worker: Worker | null = null
const sequences = new Map<string, Sequence>()

// what each sequence holds, for tests (navigator.webdriver) and ?debug only
if (typeof navigator !== 'undefined' && (navigator.webdriver || new URLSearchParams(location.search).has('debug')))
  Object.defineProperty(globalThis, '__sequences', {
    get: () =>
      [...sequences.values()].map((s) => ({ id: s.spec.id, frames: s.spec.frames, progress: +s.progress.toFixed(3), complete: s.complete, bytes: s.loaded })),
  })

function decoder() {
  if (worker) return worker
  worker = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<FromWorker>) => sequences.get(e.data.seq)?.take(e.data)
  return worker
}

const send = (m: ToWorker) => decoder().postMessage(m)

/** One frame set: which frames are cached, which are decoded, and the nearest decoded frame to any position. */
export class Sequence {
  readonly spec: SequenceSpec
  /** frames whose bytes the worker holds */
  private cached = new Set<number>()
  private bytes = 0
  /** decoded frames, in least-recently-drawn order (Map keeps insertion order: the LRU) */
  private bitmaps = new Map<number, ImageBitmap>()
  private fetching = new Set<number>()
  private decoding = new Set<number>()
  private queue: number[]
  private stopped = false
  /** keep fetching on every frame that arrives, not only when drawn (prefetch) */
  private auto = false
  private at = 0
  /** the way the scroll last moved through this set: 1 down, -1 up */
  private dir = 1
  /** fetch the frames nearest the scroll first, not coarse first (the set on screen and the next, after the first screen) */
  fine = false

  /** how many frames this device loads at all (the density thins the set on a slow link) */
  private readonly wanted: number
  private readonly lru: number

  constructor(spec: SequenceSpec) {
    this.spec = spec
    this.queue = loadOrder(spec.frames)
    this.wanted = this.queue.length
    this.lru = spec.lru ?? LRU
    sequences.set(spec.id, this)
  }

  /** frames cached ÷ frames this device loads: what a loading bar shows */
  get progress() {
    return this.wanted ? this.cached.size / this.wanted : 0
  }
  /** bytes fetched so far */
  get loaded() {
    return this.bytes
  }
  /** every frame's bytes are here: the scroll needs the network no more */
  get complete() {
    return this.cached.size >= this.wanted
  }

  /** frame index for a position inside the sequence (0..1) */
  index(at: number) {
    return Math.min(this.spec.frames - 1, Math.max(0, Math.round(at * (this.spec.frames - 1))))
  }

  /** frame `i` if it is decoded, else null (the crossfade's second frame: never a neighbour standing in for it) */
  exact(i: number) {
    const b = this.bitmaps.get(i)
    if (b) this.touch(i, b)
    return b ?? null
  }

  /**
   * The decoded frame nearest `i`, and how far off it is. Early in the load that is a coarse neighbour; once the gaps
   * are filled it is the frame itself. null until the first frame has decoded.
   */
  nearest(i: number): { bitmap: ImageBitmap; at: number } | null {
    const hit = this.bitmaps.get(i)
    if (hit) {
      this.touch(i, hit)
      return { bitmap: hit, at: i }
    }
    for (let d = 1; d < this.spec.frames; d++)
      for (const j of [i - d, i + d]) {
        const b = this.bitmaps.get(j)
        if (b) {
          this.touch(j, b)
          return { bitmap: b, at: j }
        }
      }
    return null
  }

  /** is a frame within NEAR of `i` already cached? */
  private hasNear(i: number) {
    for (let d = 0; d <= NEAR; d++) if (this.cached.has(i - d) || this.cached.has(i + d)) return true
    return false
  }

  private touch(i: number, b: ImageBitmap) {
    this.bitmaps.delete(i)
    this.bitmaps.set(i, b)
  }

  /**
   * Keep the load moving towards the frame on screen: decode the frames around it that are cached but not decoded,
   * and fetch the rest of the set coarse first. Called once per drawn frame; it only ever starts work.
   */
  pump(i: number, decode = true) {
    if (this.stopped) return
    // the way the scroll is going: decoded first on that side
    if (i !== this.at) this.dir = i < this.at ? -1 : 1
    const dir = this.dir
    this.at = i
    // decode first: a cached frame near the scroll position is one message away from being drawable. AHEAD frames of
    // the decoded window lie ahead of the scroll, the rest behind it (a prefetch only fetches: no bitmaps off screen)
    if (decode) {
      const ahead = Math.min(AHEAD, Math.ceil((this.lru * 2) / 3))
      const behind = this.lru - 1 - ahead
      for (let d = 0; d <= ahead && this.decoding.size < DECODES; d++)
        for (const j of d === 0 ? [i] : d <= behind ? [i + dir * d, i - dir * d] : [i + dir * d])
          if (j >= 0 && j < this.spec.frames && this.cached.has(j) && !this.bitmaps.has(j) && !this.decoding.has(j) && this.decoding.size < DECODES) {
            this.decoding.add(j)
            send({ k: 'decode', seq: this.spec.id, i: j, url: this.spec.url(j), hi: true })
          }
    }
    // fetches share one cap across every set; a set off screen leaves RESERVE slots for the one on screen
    const cap = decode ? PARALLEL : PARALLEL - RESERVE
    while (net < cap && this.queue.length) {
      // coarse first, straight off the queue, unless nothing near the frame on screen is cached yet: then the queued
      // frame nearest it goes first, so a jump into the middle of a set shows something there rather than filling gaps
      // at the start. Once its coarse level is in, the set on screen takes the queued frame nearest the scroll (ahead
      // of it first): the frames under the scroll never wait behind gaps far off.
      let at = 0
      const coarse = this.cached.size >= Math.ceil(this.wanted / 8)
      if (this.cached.size > 0 && (!this.hasNear(i) || this.fine || (decode && coarse))) {
        const cost = (j: number) => ((j - i) * dir >= 0 ? Math.abs(j - i) : Math.abs(j - i) * 2)
        for (let k = 1; k < this.queue.length; k++) if (cost(this.queue[k]) < cost(this.queue[at])) at = k
      }
      const j = this.queue.splice(at, 1)[0]
      if (this.cached.has(j) || this.fetching.has(j)) continue
      this.fetching.add(j)
      net++
      // the frame on screen and its neighbours are decoded straight away; the rest are only cached
      const near = decode && Math.abs(j - i) <= 1
      if (near) this.decoding.add(j)
      send({ k: near ? 'decode' : 'fetch', seq: this.spec.id, i: j, url: this.spec.url(j), hi: decode })
    }
  }

  /**
   * Fetch and decode one frame and nothing else (a neighbour's entry frame, so the cut or crossfade onto it draws at
   * once). pump() would keep starting fetches across the whole set on every call.
   */
  pumpOne(i: number) {
    if (this.stopped || i < 0 || i >= this.spec.frames || this.bitmaps.has(i) || this.decoding.has(i) || this.fetching.has(i)) return
    if (this.cached.has(i)) {
      this.decoding.add(i)
      send({ k: 'decode', seq: this.spec.id, i, url: this.spec.url(i), hi: true })
      return
    }
    if (net >= PARALLEL) return
    const q = this.queue.indexOf(i)
    if (q >= 0) this.queue.splice(q, 1)
    this.fetching.add(i)
    this.decoding.add(i)
    net++
    send({ k: 'decode', seq: this.spec.id, i, url: this.spec.url(i), hi: true })
  }

  /** a message from the worker */
  take(m: FromWorker) {
    const freed = this.fetching.delete(m.i)
    if (freed) net--
    this.decoding.delete(m.i)
    // a freed slot also restarts the other sets waiting on the shared cap (a prefetch that found it full started
    // nothing, and its own completions are the only other thing that pumps it); a paused set stays paused
    if (freed) queueMicrotask(() => {
      for (const s of sequences.values()) if (s !== this && net < PARALLEL - RESERVE) s.wake()
    })
    if (m.k === 'failed') return
    if (this.auto && !this.stopped) queueMicrotask(() => this.pump(this.at, false))
    if (!this.cached.has(m.i)) {
      this.cached.add(m.i)
      if (m.k === 'fetched') this.bytes += m.bytes
    }
    if (m.k === 'decoded') {
      if (this.stopped) return m.bitmap.close()
      this.bitmaps.set(m.i, m.bitmap)
      this.evict(this.at)
    }
  }

  /** Hold the bitmap cap by closing the decoded frame furthest from the one just drawn. Its bytes stay in the worker. */
  private evict(near: number) {
    // a frame behind the scroll counts double: the window keeps more of what is coming than of what has gone by
    const far = (i: number) => ((i - near) * this.dir >= 0 ? Math.abs(i - near) : Math.abs(i - near) * 2)
    while (this.bitmaps.size > this.lru) {
      let worst = -1
      let dist = -1
      for (const i of this.bitmaps.keys())
        if (far(i) > dist) {
          dist = far(i)
          worst = i
        }
      this.bitmaps.get(worst)!.close()
      this.bitmaps.delete(worst)
    }
  }

  /**
   * Fetch the whole set ahead of time, frame 0 first and then coarse first, PARALLEL at a time, each finished frame
   * starting the next (#hd2: the /story stage starts this when a sequence clip's chapter is near).
   */
  prefetch() {
    if (this.auto) return
    this.auto = true
    this.pump(this.at, false)
  }

  /** a prefetching set with frames still to fetch takes a free slot (take(), when another set's fetch finishes) */
  wake() {
    if (this.auto && !this.stopped && this.queue.length) this.pump(this.at, false)
  }

  /** Stop starting new fetches (in-flight ones finish); prefetch() resumes. The warm cache parks far sets with it. */
  pause() {
    this.auto = false
  }

  /** Close every decoded bitmap (the bytes stay in the worker): a set off screen holds no bitmap memory (#hd2). */
  release() {
    for (const b of this.bitmaps.values()) b.close()
    this.bitmaps.clear()
  }

  destroy() {
    this.stopped = true
    for (const b of this.bitmaps.values()) b.close()
    this.bitmaps.clear()
    this.queue = []
    net -= this.fetching.size
    this.fetching.clear()
    sequences.delete(this.spec.id)
    send({ k: 'free', seq: this.spec.id })
  }
}

export interface StagePos {
  /** the sequence on screen, and where inside it (0..1) */
  seq: Sequence
  at: number
  /** the sequence being crossed into, the frame it is entered on, and how far the fade has gone (0..1) */
  next?: Sequence
  nextAt?: number
  fade?: number
  /** ignore a decoded neighbour further than this many frames from the one asked for */
  slack?: number
  /** the last frame this position may show, crossfade included (a trimmed clip's end) */
  last?: number
}

/**
 * Draws one stage. Call `draw` from the page's rAF with this frame's position, `resize` on mount and on resize.
 * `draw` returns the frame index it drew, or -1 while nothing has decoded yet; a frame with nothing new to show leaves
 * the canvas exactly as it was, so the stage is never blank once it has painted.
 */
export function createStage(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false })!
  let w = 0
  let h = 0
  let shown = -1
  let last = ''
  let owner: Sequence | null = null
  /** share of the next frame blended over the one shown (0: a whole frame) */
  let mix = 0
  /** the canvas holds a picture (any set's): from then on a far neighbour never replaces it */
  let painted = false
  /** the last draw held an older frame (or a neighbour): the next exact frame blends in over two draws */
  let settle = 0

  const resize = () => {
    // device px, but never more than a frame covers at its native size: past that the canvas would scale the frame up
    // (a resample that only softens it); the browser stretches a capped canvas once, on the GPU, when it composites
    const cw = canvas.clientWidth * dpr()
    const ch = canvas.clientHeight * dpr()
    const k = Math.min(1, 1 / Math.max(cw / NATIVE_W, ch / NATIVE_H))
    const next = [Math.round(cw * k), Math.round(ch * k)]
    if (next[0] === w && next[1] === h) return
    ;[w, h] = next
    canvas.width = w
    canvas.height = h
    // a resize resets the context: smoothing back to high, so a frame scaled up to a 2× canvas stays crisp
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    last = ''
    painted = false
  }

  /** cover: scale to fill the canvas, crop the long axis */
  const paint = (b: ImageBitmap, alpha: number) => {
    const s = Math.max(w / b.width, h / b.height)
    ctx.globalAlpha = alpha
    ctx.drawImage(b, (w - b.width * s) / 2, (h - b.height * s) / 2, b.width * s, b.height * s)
    ctx.globalAlpha = 1
  }

  const draw = (pos: StagePos) => {
    if (!w || !h) return shown
    const frames = pos.seq.spec.frames
    const end = Math.min(frames - 1, pos.last ?? frames - 1)
    // the scroll position between two whole frames: frame `base`, with `frac` of the next one blended over it
    const exact = Math.min(end, Math.max(0, pos.at * (frames - 1)))
    const base = Math.floor(exact)
    const frac = base < end ? exact - base : 0
    const i = Math.round(exact)
    pos.seq.pump(i)
    const fade = pos.next && pos.fade ? Math.min(1, pos.fade) : 0
    const close = (hit: { bitmap: ImageBitmap; at: number } | null, j: number) =>
      hit && (pos.slack === undefined || Math.abs(hit.at - j) <= pos.slack) ? hit : null
    // this set's fallback never shows a frame past a trimmed end (hf-ship: the placard), slack or not
    const inTrim = (hit: { bitmap: ImageBitmap; at: number } | null) => (hit && hit.at <= end ? hit : null)
    // the frame shown is `base` when it is decoded (the next one blends over it), else the decoded frame nearest the
    // position: never an undecoded frame, never a blank canvas. Once the canvas holds a picture, a neighbour more than
    // MAX_OFF frames away is not drawn: the picture holds until a frame near the scroll has decoded (PR #324 item 5)
    let now = inTrim(close(pos.seq.nearest(pos.seq.exact(base) ? base : i), i))
    const held = !!now && painted && Math.abs(now.at - i) > MAX_OFF
    if (held) now = null
    // 1/16 steps: a sixteenth of a frame's change is below what the eye sees, and the stamp stays cheap to compare
    const q = Math.round(frac * 16) / 16
    const over = now && now.at === base && q > 0 ? pos.seq.exact(base + 1) : null
    let into: { bitmap: ImageBitmap; at: number } | null = null
    if (pos.next) {
      const j = pos.nextAt ?? pos.next.index(0)
      pos.next.pump(j)
      const hit = fade > 0 ? pos.next.nearest(j) : null
      into = hit && Math.abs(hit.at - j) <= MAX_OFF ? hit : null
    }
    // nothing of this set decoded near the scroll yet: the last picture holds (-1 for another set's, so the stage keeps it)
    if (!now && !into) {
      if (held || !painted) settle = 2
      return owner === pos.seq ? shown : -1
    }
    owner = pos.seq
    const m = over ? q : 0
    // a frame that arrives after a hold blends over the held picture (the canvas keeps it) in two steps, not a pop
    const a = settle === 2 ? 0.5 : 1
    const stamp = `${pos.seq.spec.id}:${now?.at ?? -1}:${m}:${into?.at ?? -1}:${fade.toFixed(3)}:${settle}`
    if (stamp === last) return shown
    last = stamp
    if (now) paint(now.bitmap, painted ? a : 1)
    if (over) paint(over, m * (painted ? a : 1))
    if (into) paint(into.bitmap, now || painted ? fade : 1)
    painted = true
    settle = settle > 0 ? settle - 1 : 0
    mix = m
    shown = (fade >= 0.5 ? into?.at : now?.at) ?? now?.at ?? into!.at
    return shown
  }

  return {
    resize,
    draw,
    get frame() {
      return shown
    },
    /** share of the next frame blended over `frame` (0..1) */
    get mix() {
      return mix
    },
  }
}
