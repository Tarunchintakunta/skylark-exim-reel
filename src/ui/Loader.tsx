import gsap from 'gsap'
import { useEffect } from 'react'
import { env } from '../engine/env'
import { store } from '../engine/store'
import { lockScroll, resizeScroll, unlockScroll } from '../engine/ticker'

/** the intro shows for at least INTRO_MS, then wipes away in WIPE_S */
const INTRO_MS = 700
const WIPE_S = 0.3
/** the intro opens at the latest this long after it took over, the rest still loading behind it */
// ponytail: fixed cap, size it to the link (Network Information downlink) if slow connections complain
const GATE_MS = 45_000

/** A page's gate (#preload): the intro shows its percentage and opens once what the page needs is in memory */
export interface Gate {
  ready: () => Promise<void>
  progress: () => number
  onCache: (f: () => void) => () => void
}

/**
 * What must be ready when the intro opens (#274): `fn` runs in an idle slice once the hero's LCP has painted and the page
 * has been ready (`data-ready`) for 500 ms, in parallel with the hero frames; so its bytes stay out of the first
 * screens' weight budget (tests/weight.spec.ts) and never compete with the LCP.
 */
export function duringIntro(fn: () => void) {
  const html = document.documentElement
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(() => fn(), { timeout: 400 }) : setTimeout(fn, 100))
  const lcp = new Promise<void>((done) => {
    // a page that never reports an LCP (a hidden tab) goes on after 2 s
    setTimeout(done, 2000)
    new PerformanceObserver((l, o) => l.getEntries().length && (o.disconnect(), done())).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  const later = () => void lcp.then(() => setTimeout(idle, 500))
  if (html.dataset.ready === '1') return later()
  const mo = new MutationObserver(() => html.dataset.ready === '1' && (mo.disconnect(), later()))
  mo.observe(html, { attributes: true, attributeFilter: ['data-ready'] })
}

/**
 * Intro (STORY §0, #218, #270). Its markup and CSS are static in the page's HTML, so it paints before any JS; the intro
 * itself (the "Skylark Exim" wordmark, a hairline) is CSS. This component counts and ends it: the mark lifts and a hole
 * opens onto the page.
 *
 * Every page passes a `gate` (#preload, Terminal's pattern): the intro locks the scroll, runs its hairline and
 * percentage from 0 % to 100 % as the page's media lands in memory, and opens at 100 % (or GATE_MS). No wheel or touch
 * opens it early. The static hero copy stays above the overlay until it opens: Chrome ignores occluded text for LCP
 * (#207). Reduced motion gets no intro, and the CSS failsafe in the HTML fades it if this script never runs.
 */
export function Loader({ mounted, gate }: { mounted: Promise<void>; gate: Gate }) {
  useEffect(() => {
    const html = document.documentElement
    const root = document.getElementById('boot')
    /** the page's content has mounted */
    const ready = () => {
      if (store.getState().ready) return
      // /story's static opening caption (#lcp) gives way to the film's own, which `ready` shows in the same place
      document.querySelectorAll('.caption--static').forEach((e) => e.remove())
      store.setState({ ready: true })
      html.dataset.ready = '1'
      // the page just grew by its lazy content: Lenis would clamp the first wheel to the old height
      resizeScroll()
    }
    const whenMounted = mounted.then(ready)
    let locked = false
    const handOff = () => {
      root?.remove()
      if (locked) unlockScroll()
      // the static copy only gives way once the page it hands over to is mounted
      void whenMounted.then(() => {
        document.getElementById('hero-static')?.remove()
        // /story's static first frame (#309): the stage has drawn the same frame by now; two frames on, so no gap
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('first-frame')?.remove()))
        store.setState({ revealed: true })
      })
    }
    if (!root || env.reduced) {
      handOff()
      return
    }
    // from here on this script owns the timing: drop the CSS failsafe fade, keep the thinning overlay running
    root.style.animationName = 'loader-thin'
    root.classList.add('is-gated')
    lockScroll()
    locked = true
    let tl: gsap.core.Timeline | null = null
    let cancelled = false
    const open = () => {
      if (cancelled || tl) return
      // the wordmark lifts away while a circular hole opens from the centre onto the page
      tl = gsap.timeline({ onComplete: handOff })
      tl.to(root.querySelector('.loader__name'), { autoAlpha: 0, y: -6, duration: 0.2, ease: 'power2.in' }, 0)
      tl.to(root.querySelectorAll('.loader__line, .loader__pct'), { autoAlpha: 0, duration: 0.2 }, 0)
      tl.to(root, { '--r': `${Math.hypot(innerWidth, innerHeight) / 2 + 2}px`, duration: WIPE_S, ease: 'power3.inOut' }, 0)
    }
    const pct = root.querySelector('.loader__pct')
    const show = () => {
      const p = Math.min(1, gate.progress())
      root.style.setProperty('--p', String(p))
      if (pct) pct.textContent = `${Math.floor(p * 100)}%`
    }
    show()
    const stopBar = gate.onCache(show)
    const cap = window.setTimeout(open, GATE_MS)
    const minimum = new Promise((r) => setTimeout(r, Math.max(0, INTRO_MS - performance.now())))
    void Promise.all([gate.ready(), minimum, mounted]).then(() => (show(), open()))
    return () => {
      cancelled = true
      stopBar()
      clearTimeout(cap)
      tl?.kill()
    }
  }, [])
  return null
}
