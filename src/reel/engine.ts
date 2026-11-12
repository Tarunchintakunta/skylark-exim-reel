import { REEL } from './manifest'
import type { Timeline } from './chain'

/** desktop: 1920x1080 frames; phones held upright: the 810x1440 crops */
export const phone = () => matchMedia('(max-width: 819px), (pointer: coarse)').matches && innerHeight > innerWidth
export const frameUrl = (clip: string, i: number, kind: 'd' | 'm') =>
  `/media/reel/${clip}/${kind}/${String(i).padStart(3, '0')}.avif?v=${REEL[clip]?.v ?? ''}`

/** decoded frames kept either side of the one on screen (spec: 30+ ahead and behind) */
const AHEAD = 36
const BEHIND = 32
/** decodes in flight across the workers */
const IN_FLIGHT = 6
/** frame fetches in flight for the next-clip prefetch */
const PREFETCH = 4

/**
 * The reel's stage: one canvas, every frame of the path in play order (chain.ts timeline). `seek(f)` with a fractional
 * frame index; the canvas shows that frame once decoded, else the nearest decoded one, so a fast scroll never blanks.
 * Decoding runs in two workers; frames outside the window are closed (GPU memory). The whole next clip is fetched
 * into the HTTP cache before the scroll reaches it.
 */
export class ReelEngine {
  private ctx: CanvasRenderingContext2D
  private kind: 'd' | 'm'
  private bmps = new Map<number, ImageBitmap>()
  private pending = new Map<number, number>()
  private workers: Worker[]
  private next = 0
  private cur = 0
  private drawn = -1
  private dir = 1
  private fetched = new Set<string>()
  private prefetchQ: string[] = []
  private prefetching = 0
  private onFirst: (() => void) | null
  constructor(private canvas: HTMLCanvasElement, private tl: Timeline, onFirst?: () => void) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.kind = phone() ? 'm' : 'd'
    this.onFirst = onFirst ?? null
    this.workers = [0, 1].map(() => {
      const w = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<{ id: number; bmp: ImageBitmap | null }>) => this.landed(e.data.id, e.data.bmp)
      return w
    })
    this.resize()
    this.pump()
    // tests (navigator.webdriver) read the frame wanted and the frame drawn
    if (navigator.webdriver) (globalThis as { __reel?: ReelEngine }).__reel = this
  }

  /** frame the scroll asks for, and the frame on the canvas (tests) */
  get state() {
    return { cur: this.cur, drawn: this.drawn, frames: this.frames, decoded: this.bmps.size }
  }

  get frames() {
    return this.tl.frames.length
  }

  url(f: number) {
    const fr = this.tl.frames[f]
    return frameUrl(fr.clip, fr.i, this.kind)
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const w = Math.round(innerWidth * dpr)
    const h = Math.round(innerHeight * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.drawn = -1
      this.paint()
    }
  }

  /** show frame `f` (0..frames-1, fractional rounds) */
  seek(f: number) {
    const i = Math.max(0, Math.min(this.frames - 1, Math.round(f)))
    if (i !== this.cur) this.dir = i > this.cur ? 1 : -1
    this.cur = i
    this.paint()
    this.pump()
  }

  private nearest() {
    if (this.bmps.has(this.cur)) return this.cur
    for (let d = 1; d < 120; d++) {
      // prefer the side the scroll came from: it was on screen a moment ago
      const a = this.cur - d * this.dir
      const b = this.cur + d * this.dir
      if (this.bmps.has(a)) return a
      if (this.bmps.has(b)) return b
    }
    return -1
  }

  private paint() {
    const i = this.nearest()
    if (i < 0 || i === this.drawn) return
    const bmp = this.bmps.get(i)!
    const { width: W, height: H } = this.canvas
    const s = Math.max(W / bmp.width, H / bmp.height)
    const w = bmp.width * s
    const h = bmp.height * s
    this.ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h)
    this.drawn = i
    if (this.onFirst) {
      const f = this.onFirst
      this.onFirst = null
      f()
    }
  }

  /** decode order: the frame on screen, then outward, the scroll's direction first */
  private wanted() {
    const out: number[] = []
    const lo = Math.max(0, this.cur - (this.dir > 0 ? BEHIND : AHEAD))
    const hi = Math.min(this.frames - 1, this.cur + (this.dir > 0 ? AHEAD : BEHIND))
    out.push(this.cur)
    for (let d = 1; this.cur + d <= hi || this.cur - d >= lo; d++) {
      const fwd = this.cur + d * this.dir
      const back = this.cur - d * this.dir
      if (fwd >= lo && fwd <= hi) out.push(fwd)
      if (back >= lo && back <= hi && d <= BEHIND) out.push(back)
    }
    return { out, lo, hi }
  }

  private pump() {
    const { out, lo, hi } = this.wanted()
    // close what fell out of the window, cancel decodes no longer wanted
    for (const [i, b] of this.bmps) if ((i < lo || i > hi) && i !== this.drawn) (b.close(), this.bmps.delete(i))
    const stale = [...this.pending.keys()].filter((i) => i < lo || i > hi)
    if (stale.length) {
      for (const i of stale) this.workers[this.pending.get(i)!].postMessage({ cancel: [i] })
    }
    for (const i of out) {
      if (this.pending.size >= IN_FLIGHT) break
      if (this.bmps.has(i) || this.pending.has(i)) continue
      const w = this.next++ % this.workers.length
      this.pending.set(i, w)
      this.workers[w].postMessage({ id: i, url: this.url(i) })
    }
    this.prefetchClips()
  }

  private landed(i: number, bmp: ImageBitmap | null) {
    this.pending.delete(i)
    if (bmp) {
      const { lo, hi } = this.wanted()
      if (i < lo || i > hi) bmp.close()
      else {
        this.bmps.get(i)?.close()
        this.bmps.set(i, bmp)
        if (Math.abs(i - this.cur) < Math.abs(this.drawn - this.cur) || this.drawn < 0) this.paint()
      }
    }
    this.pump()
  }

  /** the clip on screen and the next one in the scroll's direction, fetched whole into the HTTP cache */
  private prefetchClips() {
    const cs = this.tl.clipStarts
    let k = cs.findIndex((c, j) => this.cur >= c.at && (j === cs.length - 1 || this.cur < cs[j + 1].at))
    if (k < 0) k = 0
    for (const j of [k, k + this.dir]) {
      const c = cs[j]
      if (!c || this.fetched.has(c.clip)) continue
      this.fetched.add(c.clip)
      for (let f = c.at; f < c.at + c.n; f++) this.prefetchQ.push(this.url(f))
    }
    while (this.prefetching < PREFETCH && this.prefetchQ.length) {
      const u = this.prefetchQ.shift()!
      this.prefetching++
      fetch(u, { priority: 'low' } as RequestInit)
        .then((r) => r.blob())
        .catch(() => null)
        .finally(() => {
          this.prefetching--
          this.prefetchClips()
        })
    }
  }

  /** frames 0..n decoded (the intro waits for the first few) */
  ready(n: number) {
    for (let i = 0; i < Math.min(n, this.frames); i++) if (!this.bmps.has(i)) return false
    return true
  }

  destroy() {
    this.workers.forEach((w) => w.terminate())
    this.bmps.forEach((b) => b.close())
    this.bmps.clear()
  }
}
