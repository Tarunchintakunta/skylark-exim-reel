import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useState, type ReactNode } from 'react'
import { env } from '../engine/env'
import { DUR, EASE } from './tokens'

/** the site's pages (a link to any of them from another one crossfades) */
const PAGE = /^\/(story|quote|news)?(\.html)?$|^\/news\/[^/]+$/
/** cross-document view transitions (Chrome 126+, Safari 18.2+): the `@view-transition` rule in global.css does the crossfade */
const native = 'PageRevealEvent' in window

/**
 * Page transitions between /, /story, /quote and /news (#238). Where the browser has cross-document view transitions,
 * CSS crossfades the old page into the new one (0.35 s) with no script. Elsewhere this fades the page out with
 * AnimatePresence, then navigates: the old page stays painted until the new one is ready, so nothing flashes, and the
 * new page opens at the top. Never on the way in: the hero copy is the LCP element and paints at full opacity.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const [to, setTo] = useState<string | null>(null)
  useEffect(() => {
    if (native || env.reduced) return
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
      if (!a || a.target || a.hasAttribute('download')) return
      const url = new URL(a.href)
      if (url.origin !== location.origin || url.pathname === location.pathname || !PAGE.test(url.pathname)) return
      e.preventDefault()
      setTo(url.href)
    }
    // back/forward cache: a page restored after leaving comes back faded in
    const shown = (e: PageTransitionEvent) => e.persisted && setTo(null)
    document.addEventListener('click', click)
    addEventListener('pageshow', shown)
    return () => {
      document.removeEventListener('click', click)
      removeEventListener('pageshow', shown)
    }
  }, [])
  return (
    <AnimatePresence onExitComplete={() => to && location.assign(to)}>
      {!to && (
        <m.div key="page" exit={{ opacity: 0 }} transition={{ duration: DUR.fast, ease: EASE }}>
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}
