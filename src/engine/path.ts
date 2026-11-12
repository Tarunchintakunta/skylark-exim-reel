import { store, type Path } from './store'
import { scrollToY } from './ticker'

/** Switch path: the reel swaps to the other path's frames; `jump` lands on its first frame (y = 0). */
export function setPath(path: Path, jump = false) {
  if (store.getState().path !== path) {
    store.setState({ path })
    history.replaceState(null, '', `#${path}`)
  }
  if (jump) requestAnimationFrame(() => requestAnimationFrame(() => scrollToY(0, true)))
}

const hashTarget = (): Path | null => (location.hash === '#ocean' ? 'ocean' : location.hash === '#pond' ? 'pond' : null)

/** #ocean / #pond: switch to that path on every hash change */
export function bindPathHash() {
  const land = () => {
    const p = hashTarget()
    if (p) setPath(p, true)
  }
  window.addEventListener('hashchange', land)
  return () => window.removeEventListener('hashchange', land)
}
