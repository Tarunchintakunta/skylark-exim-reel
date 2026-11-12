/**
 * The homepage globe's warm-up (#274) yields to the page: its mount, texture upload and shader compile run only while
 * nobody is scrolling, so they never land in a hero frame, until Markets is near; then they run regardless, so the
 * globe is live before it is in view.
 */
const QUIET_MS = 300
/** Markets this many viewports below the fold counts as near */
const NEAR_VIEWPORTS = 4
let lastInput = -Infinity
if (typeof window !== 'undefined') for (const t of ['scroll', 'wheel', 'touchmove']) addEventListener(t, () => (lastInput = performance.now()), { passive: true })

const near = () => {
  const box = document.querySelector('[data-globe]')
  return !box || box.getBoundingClientRect().top < innerHeight * NEAR_VIEWPORTS
}

/** resolves once the page has been still for QUIET_MS, or Markets is near */
export function calm(): Promise<void> {
  return new Promise((done) => {
    const check = () => (performance.now() - lastInput > QUIET_MS || near() ? done() : void setTimeout(check, 100))
    check()
  })
}
