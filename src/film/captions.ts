import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import type { ChapterDef } from '../config/chapters'
import { env } from '../engine/env'
import { segmentBounds } from './segments'

gsap.registerPlugin(SplitText)

interface Cap {
  el: HTMLElement
  split?: SplitText
  /** chapter index, and the [from, to] of the one clip the caption's range sits inside (null: it spans several) */
  chapter: number
  clip: [number, number] | null
}

/** captions[chapterIndex][captionIndex] */
let caps: Cap[][] = []
let active: Cap | null = null

export function bindCaptions(sections: HTMLElement[], chapters: ChapterDef[]) {
  for (const c of caps.flat()) {
    c.split?.revert()
  }
  caps = sections.map((s, chapter) => {
    const bounds = segmentBounds(chapters[chapter])
    return [...s.querySelectorAll<HTMLElement>('.caption')].map((el, k) => {
      const [a, b] = chapters[chapter].captions[k].at
      return { el, chapter, clip: bounds.find(([from, to]) => a >= from && b <= to) ?? null }
    })
  })
  active = leaving = null
  swap?.kill()
  if (env.reduced) return
  document.fonts.ready.then(() => {
    for (const c of caps.flat()) {
      const h = c.el.querySelector<HTMLElement>('.caption__title')
      // reduceWhiteSpace would turn the no-break space in "−18 °C" into a plain one (a /\s+/ replace), letting the
      // temperature break across lines; titles have no runs of whitespace to collapse (#146)
      if (h) c.split = SplitText.create(h, { type: 'lines,words', mask: 'lines', linesClass: 'line', wordsClass: 'word', autoSplit: true, reduceWhiteSpace: false })
    }
  })
}

/**
 * One caption on screen at a time. A change is a sequence, never a cross-fade:
 * the outgoing lines leave through their masks (0.25 s), and only then the incoming lines come up.
 * Any other caption still mid-animation (fast scrolling) is cut instantly, and so is an outgoing caption whose clip
 * has already left the stage (a fast scroll past its range's end): a caption is never over another clip.
 */
let swap: gsap.core.Timeline | null = null
/** the caption the running swap is taking out */
let leaving: Cap | null = null
const offClip = (c: Cap, index: number, p: number) => c.chapter !== index || (c.clip !== null && (p < c.clip[0] || p >= c.clip[1]))

export function updateCaptions(ch: ChapterDef, index: number, p: number, force = false) {
  // the clip under a leaving caption is gone: finish the swap now (the caption hides, the next one starts rising)
  if (leaving && offClip(leaving, index, p)) {
    leaving = null
    swap?.progress(1)
  }
  const k = ch.captions.findIndex((c) => p >= c.at[0] && p < c.at[1])
  const next = k >= 0 ? (caps[index]?.[k] ?? null) : null
  // the opening call lands before SplitText exists; once the fonts split, replay that same caption
  if (next === active) {
    if (force && next) show(next)
    return
  }
  const out = active
  active = next
  swap?.kill()
  for (const c of caps.flat()) if (c !== out && c !== next) cut(c)
  if (next) cut(next)
  leaving = null
  swap = gsap.timeline({ onComplete: () => void (leaving = null) })
  if (out && offClip(out, index, p)) cut(out)
  else if (out) {
    leaving = out
    swap.add(hide(out))
  }
  if (next) swap.add(() => show(next))
}

function targets(c: Cap) {
  return [c.el, ...(c.split?.lines ?? []), ...(c.split?.words ?? []), ...c.el.querySelectorAll('[data-fade],[data-card]')]
}

/** Hard reset: invisible, no running tweens. */
function cut(c: Cap) {
  gsap.killTweensOf(targets(c))
  gsap.set(c.el, { visibility: 'hidden', autoAlpha: 0, y: 0 })
}

function show(c: Cap) {
  const { el } = c
  gsap.killTweensOf(targets(c))
  gsap.set(el, { visibility: 'visible', autoAlpha: 1, y: 0 })
  if (env.reduced) return
  const fades = el.querySelectorAll('[data-fade]')
  // word by word: each word rises through its line's mask, a beat after the one before it
  if (c.split) {
    gsap.set(c.split.lines, { yPercent: 0 })
    gsap.fromTo(c.split.words, { yPercent: 110 }, { yPercent: 0, duration: 0.65, stagger: 0.045, ease: 'power3.out' })
  }
  if (fades.length) gsap.fromTo(fades, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, delay: 0.15, stagger: 0.06, ease: 'power3.out' })
  const cards = el.querySelectorAll('[data-card]')
  if (cards.length) gsap.fromTo(cards, { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.7, stagger: 0.06, delay: 0.15, ease: 'power3.out' })
}

/** Lines go up and out through their masks; the rest fades. Returns the tween so the swap waits for it. */
function hide(c: Cap) {
  gsap.killTweensOf(targets(c))
  const d = env.reduced ? 0.01 : 0.25
  const tl = gsap.timeline({ onComplete: () => gsap.set(c.el, { visibility: 'hidden', autoAlpha: 0 }) })
  if (c.split && !env.reduced) {
    tl.to(c.split.lines, { yPercent: -100, duration: d, ease: 'power2.out' }, 0)
    tl.to(c.el.querySelectorAll('[data-fade],[data-card]'), { autoAlpha: 0, duration: d, ease: 'power2.out' }, 0)
  } else tl.to(c.el, { autoAlpha: 0, duration: d, ease: 'power2.out' }, 0)
  return tl
}
