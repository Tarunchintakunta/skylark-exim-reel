import gsap from 'gsap'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { ENTRY_CARDS, type EntryCard } from '../config/storyEntry'
import { env } from '../engine/env'
import { lockScroll, scrollToY, unlockScroll } from '../engine/ticker'
import { W, clipUrl, mediaUrl } from '../film/segments'
import { prefetchStory } from './prefetch'
import { Orbit } from './Orbit'
import './story-entry.css'

type Id = EntryCard['id']
/** phones get the portrait crops (810×1440, or the cut's own M_CROP) */
const PHONE = '(max-width: 768px)'
const phone = () => matchMedia(PHONE).matches
/** grow / shrink: ~650 ms, a decelerating ease with no overshoot */
const GROW = { duration: 0.65, ease: 'expo.out' } as const
const TIERS = [960, 1280, 1920, 2560] as const
type Desk = (typeof TIERS)[number]

/**
 * The media box in device pixels: object-fit cover makes a 16:9 frame as wide as the box, or as wide as its height
 * needs, whichever is more. The tier asked for is the smallest that covers it, never past the clip's own `top`
 * (#268: nothing is shown above its native size where a larger file exists).
 */
const coverPx = (w: number, h: number) => Math.ceil(Math.max(w, (h * 16) / 9) * (devicePixelRatio || 1))
const tierFor = (px: number, top: Desk = 2560): Desk => TIERS.find((t) => t >= px && t <= top) ?? top

/**
 * The still's srcset over every tier up to its `top`. A card's own stills (`still`) stop at 1920; its 2560 entry is the
 * clip's own poster, which only a large screen ever picks.
 */
const stillSet = (id: string, clip: string, ext: 'avif' | 'webp', top: Desk = 2560) =>
  TIERS.filter((t) => t <= top)
    .map((t) => `${mediaUrl(`${t === 2560 ? clip : id}_${t}.${ext}`)} ${t}w`)
    .join(', ')

/**
 * The card's media box in CSS px, kept up to date as the grid or the window resizes. Frozen while the card grows or
 * shrinks: a render per animation frame would cost the transition its frame rate, and the file asked for would change
 * mid-flight. Measured again once it has settled.
 */
function useBox(ref: React.RefObject<HTMLElement | null>, frozen: boolean) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  const hold = useRef(frozen)
  hold.current = frozen
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => !hold.current && setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(ref.current!)
    return () => ro.disconnect()
  }, [ref])
  useLayoutEffect(() => {
    if (frozen) return
    const r = ref.current!.getBoundingClientRect()
    setBox((b) => (b.w === r.width && b.h === r.height ? b : { w: r.width, h: r.height }))
  }, [frozen, ref])
  return box
}
const FOCUSABLE = 'a[href], button:not([disabled])'

/**
 * Touch has no hover, so a loop plays while its card is in view, but only once the page has been still for 300 ms:
 * fetching and decoding a clip mid-fling cost the homepage scroll its frame rate on a 4× throttled phone (#268).
 */
const IDLE_MS = 300
let still = true
let quiet = 0
const idleSubs = new Set<() => void>()
const setStill = (v: boolean) => v !== still && ((still = v), idleSubs.forEach((f) => f()))
if (typeof addEventListener === 'function')
  addEventListener('scroll', () => (setStill(false), clearTimeout(quiet), (quiet = window.setTimeout(() => setStill(true), IDLE_MS))), { passive: true })
const useStill = () => useSyncExternalStore((f) => (idleSubs.add(f), () => idleSubs.delete(f)), () => still)

/** The card's still: the clip's first frame, the portrait crop on phones. Lazy: nothing loads before the section is near. */
function Still({ card, cssPx, portrait }: { card: EntryCard; cssPx: number; portrait: boolean }) {
  const id = card.still ?? card.clip!
  // a phone's landscape card stops at 1920: the 2560 files are for large screens
  const top = Math.min(card.top ?? 2560, phone() ? 1920 : 2560) as Desk
  // the cover width in CSS px: the browser multiplies by the device pixel ratio when it picks from the srcset
  const sizes = `${Math.max(1, Math.round(cssPx))}px`
  return (
    <picture>
      {portrait && <source type="image/avif" srcSet={mediaUrl(`${id}_m.avif`)} />}
      {portrait && <source type="image/webp" srcSet={mediaUrl(`${id}_m.webp`)} />}
      <source type="image/avif" srcSet={stillSet(id, card.clip!, 'avif', top)} sizes={sizes} />
      <img
        className="se-media__still"
        src={mediaUrl(`${id}_960.webp`)}
        srcSet={stillSet(id, card.clip!, 'webp', top)}
        sizes={sizes}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </picture>
  )
}

/**
 * A muted loop, src set only once it should play (hover, or in view on touch). The still stays on top of it until the
 * first frame is decoded and presented (requestVideoFrameCallback), so a half-decoded frame never shows (#268).
 */
function Loop({ src, play, className }: { src: string | null; play: boolean; className: string }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = v.current!
    if (!src || !play) return void el.pause()
    if (el.getAttribute('src') !== src) {
      el.classList.remove('is-on')
      el.src = src
      const on = () => el.classList.add('is-on')
      // Firefox before 132 has no frame callback: a short wait after 'playing' instead
      if (typeof el.requestVideoFrameCallback === 'function') el.requestVideoFrameCallback(on)
      else (el as HTMLVideoElement).addEventListener('playing', () => setTimeout(on, 80), { once: true })
    }
    el.play().catch(() => {})
  }, [src, play])
  return <video ref={v} className={className} muted loop playsInline preload="none" aria-hidden="true" />
}

/**
 * `settled`: the open card has finished growing. Its clips wait for it: a playing video resized every frame (and a new
 * decoder starting) cost the grow its frame rate (30 fps and a 390 ms stall, measured), so the loops pause while the card
 * grows or shrinks, and the full-quality loop starts only once it is full screen.
 */
function Card({ card, open, settled, onOpen, onClose }: { card: EntryCard; open: boolean; settled: boolean; onOpen: (el: HTMLElement) => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const box = useBox(root, open && !settled)
  const px = coverPx(box.w, box.h)
  // the portrait crop (_m, 9:16) only for a box about that shape: a phone card near square is wider than 9:16, and
  // the landscape tiers cover it with more pixels across (hd.spec.ts)
  const portrait = phone() && box.h > 0 && box.w / box.h < 0.8
  const [hover, setHover] = useState(false)
  const [inView, setInView] = useState(false)
  const pageStill = useStill()
  const path = card.id === 'wild' ? 'ocean' : card.id === 'farmed' ? 'pond' : null
  const loops = !!card.clip && !env.reduced

  // touch has no hover: the loop plays while the card is half on screen
  useEffect(() => {
    if (!loops || env.fine) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.5 })
    io.observe(root.current!)
    return () => io.disconnect()
  }, [loops])

  const warm = () => {
    setHover(true)
    if (path) prefetchStory(path)
  }

  const move = (e: PointerEvent) => {
    // a real mouse move only: Chrome sends a still pointer over/enter events when a wheel scroll carries a card under
    // it, and scrolling past the section must not start a loop or warm /story
    if (e.pointerType === 'mouse' && (e.movementX || e.movementY) && !hover) warm()
    parallax(e)
  }
  // parallax: the widgets drift against the cursor, each by its own depth (transform only)
  const parallax = (e: PointerEvent) => {
    if (!open || env.reduced || e.pointerType !== 'mouse' || phone()) return
    const [dx, dy] = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]
    panel.current!.querySelectorAll<HTMLElement>('.se-widget').forEach((w, i) => {
      const depth = 10 + (i % 3) * 8
      gsap.to(w, { x: -dx * depth, y: -dy * depth, duration: 0.8, ease: 'power3.out', overwrite: 'auto' })
    })
  }

  // focus stays inside while open; Esc closes
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return onClose()
    if (e.key !== 'Tab') return
    const f = [...panel.current!.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const [first, last] = [f[0], f[f.length - 1]]
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus())
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus())
  }
  // a click on the open card's empty space (not a widget, the copy or a button) closes it, as a click outside would
  const backdrop = (e: MouseEvent) => e.target === e.currentTarget && !phone() && onClose()

  // phones: drag the sheet down from its top to close it
  useEffect(() => {
    const el = panel.current!
    if (!open || !env.coarse) return
    let y0 = -1
    let dy = 0
    const start = (e: TouchEvent) => void (y0 = el.scrollTop <= 0 ? e.touches[0].clientY : -1)
    const move = (e: TouchEvent) => {
      if (y0 < 0) return
      dy = Math.max(0, e.touches[0].clientY - y0)
      if (dy > 0) e.preventDefault()
      gsap.set(root.current, { y: dy * 0.7 })
    }
    const end = () => {
      if (y0 < 0) return
      if (dy > 110) onClose()
      else gsap.to(root.current, { y: 0, duration: 0.35, ease: 'power3.out' })
      y0 = -1
      dy = 0
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    return () => (el.removeEventListener('touchstart', start), el.removeEventListener('touchmove', move), el.removeEventListener('touchend', end))
  }, [open, onClose])

  const titleId = `se-${card.id}-title`
  return (
    <div
      ref={root}
      className={`se-card se-card--${card.id}${open ? ' is-open' : ''}${card.clip ? '' : ' se-card--dark'}`}
      data-card={card.id}
      onPointerLeave={() => setHover(false)}
      onFocus={() => path && prefetchStory(path)}
      onPointerMove={move}
    >
      <div className="se-media" aria-hidden="true">
        {card.clip ? (
          <>
            <Still card={card} cssPx={px / (devicePixelRatio || 1)} portrait={portrait} />
            {/* one loop, one decoder: its tier follows the box (frozen mid-transition), so once the card has settled
                full screen it switches to the tier that covers the screen, the still showing until that file's first frame */}
            <Loop className="se-media__loop" src={loops && px ? clipUrl(card.clip, portrait ? 'm' : tierFor(px, Math.min(card.top ?? 2560, phone() ? 1920 : typeof W === 'number' ? W : 2560) as Desk)) : null} play={open ? settled : hover || (inView && pageStill)} />
          </>
        ) : (
          <Orbit className="se-orbit" />
        )}
        <span className="se-media__scrim" />
        <span className="se-media__veil" />
      </div>

      <button className="se-hit" type="button" aria-expanded={open} aria-controls={`se-${card.id}-panel`} onClick={(e) => (path && prefetchStory(path), onOpen(e.currentTarget))}>
        <span className="se-tag mono">{card.tag}</span>
        <span className="se-title display">{card.title}</span>
        {card.clip && (
          <span className="se-cta">
            {card.cta} <span aria-hidden="true">→</span>
          </span>
        )}
        {!card.clip && <span className="se-markets mono">{card.widgets.map((w) => w.value).join(' · ')}</span>}
      </button>
      {!card.clip && (
        <a className="se-cta se-cta--link" href={card.start.href}>
          {card.cta} <span aria-hidden="true">→</span>
        </a>
      )}

      <div
        ref={panel}
        id={`se-${card.id}-panel`}
        className="se-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        hidden={!open}
        onKeyDown={keys}
        onClick={backdrop}
        data-lenis-prevent
      >
        <ul className="se-widgets" onClick={backdrop}>
          {card.widgets.map((w) => (
            <li key={w.label} className="se-widget">
              <span className="se-widget__label mono">{w.label}</span>
              <span className="se-widget__value">{w.value}</span>
            </li>
          ))}
        </ul>
        <div className="se-center">
          <p className="se-tag mono">{card.tag}</p>
          <h3 id={titleId} className="se-heading display">{card.heading}</h3>
          <p className="se-sub">{card.sub}</p>
          <div className="se-actions">
            <a className="se-btn se-btn--primary" href={card.start.href}>
              {card.start.label} <span aria-hidden="true">→</span>
            </a>
            <button className="se-btn" type="button" onClick={onClose}>Back</button>
          </div>
        </div>
        <button className="se-close" type="button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/**
 * Story Entry (#268): three bento cards after the hero. A card grows from its cell to the full viewport (GSAP, ~650 ms),
 * then its facts float in; Back, Esc, the close button or a click on its empty space shrink it back to the cell, and
 * the page is where it was. Reduced motion: a crossfade, no growth and no float.
 */
export function StoryEntry() {
  const [open, setOpen] = useState<Id | null>(null)
  const [settled, setSettled] = useState(false)
  const from = useRef<{ trigger: HTMLElement | null; y: number }>({ trigger: null, y: 0 })
  const cards = useRef<HTMLUListElement>(null)

  const card = (id: Id) => cards.current!.querySelector<HTMLElement>(`[data-card="${id}"]`)!

  const openCard = (id: Id, trigger: HTMLElement | null) => {
    from.current = { trigger, y: scrollY }
    if (env.coarse) document.documentElement.classList.add('is-locked')
    else lockScroll()
    setOpen(id)
  }

  const closeCard = () => {
    if (!open) return
    setSettled(false)
    const el = card(open)
    const cell = el.parentElement!.getBoundingClientRect()
    const done = () => {
      // back in the cell before the inline sizes go, so no frame shows the card full screen without them
      flushSync(() => setOpen(null))
      gsap.set([el, ...el.querySelectorAll('.se-widget, .se-center, .se-close')], { clearProps: 'all' })
      if (env.coarse) document.documentElement.classList.remove('is-locked')
      else unlockScroll()
      scrollToY(from.current.y, true)
      from.current.trigger?.focus({ preventScroll: true })
    }
    const tl = gsap.timeline({ onComplete: done })
    tl.to(el.querySelectorAll('.se-widget, .se-center, .se-close'), { autoAlpha: 0, duration: 0.18, ease: 'power1.out' })
    if (env.reduced) tl.to(el, { autoAlpha: 0, duration: 0.3 })
    else tl.to(el, { top: cell.top, left: cell.left, width: cell.width, height: cell.height, y: 0, borderRadius: getComputedStyle(el.parentElement!).borderRadius, ...GROW }, '<0.05')
  }

  // grow from the cell, then float the facts in, 60 ms apart
  useLayoutEffect(() => {
    if (!open) return
    setSettled(false)
    const el = card(open)
    const cell = el.parentElement!.getBoundingClientRect()
    const radius = getComputedStyle(el.parentElement!).borderRadius
    const items = el.querySelectorAll('.se-widget')
    const tl = gsap.timeline({ onComplete: () => setSettled(true) })
    if (env.reduced) {
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 })
    } else {
      tl.fromTo(el, { top: cell.top, left: cell.left, width: cell.width, height: cell.height, borderRadius: radius }, { top: 0, left: 0, width: innerWidth, height: innerHeight, borderRadius: 0, ...GROW })
      // phones: the sheet's copy and facts fade in where they sit, no travel
      const rise = phone() ? 0 : 1
      tl.fromTo(el.querySelector('.se-center'), { autoAlpha: 0, y: 16 * rise }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out' }, 0.32)
      tl.fromTo(items, { autoAlpha: 0, y: 28 * rise }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.06 }, 0.4)
      // opacity only: the close button takes focus at once
      tl.fromTo(el.querySelector('.se-close'), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.45)
    }
    el.querySelector<HTMLElement>('.se-close')!.focus({ preventScroll: true })
    return () => void tl.kill()
  }, [open])

  return (
    <section id="story-entry" className={`se${open ? ' is-open' : ''}`} aria-labelledby="se-title">
      <h2 id="se-title" className="sr-only">Choose a story</h2>
      <p className="se-lead">Choose a path — click any card to preview, or click Enter the story to go straight in</p>
      <ul className="se-grid" ref={cards}>
        {ENTRY_CARDS.map((c) => (
          <li key={c.id} className={`se-cell se-cell--${c.id}`}>
            <Card card={c} open={open === c.id} settled={settled && open === c.id} onOpen={(t) => openCard(c.id, t)} onClose={closeCard} />
          </li>
        ))}
      </ul>
    </section>
  )
}
