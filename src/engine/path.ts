import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { film } from '../film/controller'
import { store, type Path } from './store'
import { scrollToY } from './ticker'

/** Switch path. The chapter list below the fork swaps; `jump` lands on the new path's first chapter. */
export function setPath(path: Path, jump = false) {
  if (store.getState().path !== path) {
    store.setState({ path })
    history.replaceState(null, '', `#${path}`)
    // the page height changed: rebuild section triggers once, off the critical path
    const idle = 'requestIdleCallback' in window ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 100)
    idle(() => ScrollTrigger.refresh())
  }
  // wait for React to commit the new chapter list and the controller to re-measure
  if (jump) requestAnimationFrame(() => requestAnimationFrame(() => scrollToY(firstChapterY(), true)))
}

/** o1 / p1 open /story at y = 0: no chapter sits above a path's first */
const firstChapterY = () => Math.max(0, Math.ceil(film.top(0)))

const hashTarget = (): Path | null => (location.hash === '#ocean' ? 'ocean' : location.hash === '#pond' ? 'pond' : null)

/**
 * A deep link (#ocean / #pond) on load: `pending` until the jump lands; `y` is where it landed, so the jump doesn't count as the visitor's first scroll (no neighbour prefetch on arrival).
 */
export const landing = { pending: hashTarget() !== null, y: -1 }

/** #ocean / #pond deep links land on that path's first chapter: once the loader is done, and on every hash change. */
export function bindPathHash() {
  const land = () => {
    const p = hashTarget()
    if (!p) return (landing.pending = false)
    setPath(p, true)
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      // where the page actually is, not where it was sent: on #pond the measured chapter top can still be stale, and
      // a landing.y the page never reached counted as the visitor's first scroll (whole next sets fetched on arrival)
      landing.y = Math.round(window.scrollY)
      landing.pending = false
    })))
  }
  const unsub = store.subscribe((s, prev) => s.ready && !prev.ready && land())
  if (store.getState().ready) land()
  window.addEventListener('hashchange', land)
  return () => (unsub(), window.removeEventListener('hashchange', land))
}
