import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react'
import { film } from '../config/content'
import { MarketList } from '../sections/MarketList'
import { store } from '../engine/store'
import { calm } from '../three/calm'
import { GLOBE_POSTER, PHONE } from '../three/globeState'
import { texUrl } from '../film/media'
import { duringIntro } from '../ui/Loader'
import * as m from 'motion/react-m'
import { reveal, rise } from '../motion/tokens'

/** the globe box's width (home.css .home-globe) */
const POSTER_SIZES = '(max-width: 819px) min(420px, 100vw), min(720px, 45vw)'
const loadGlobe = () => import('../three/Globe')
const GlobeCanvas = lazy(loadGlobe)
let warmed: Promise<unknown> | null = null
/** the globe's chunk and its decoded texture, once (#274) */
const warmGlobe = () => (warmed ??= loadGlobe().then((g) => g.preloadGlobe('home')).catch(() => void (warmed = null)))

/**
 * Phones (#280): the globe waits for the intro to open, by when the hero's LCP is long in, so the phone's first screen
 * stays light; desktops load it during the intro.
 */
function afterReveal(fn: () => void) {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(() => fn(), { timeout: 400 }) : setTimeout(fn, 100))
  if (store.getState().revealed) return go()
  const off = store.subscribe((s) => {
    if (!s.revealed) return
    off()
    go()
  })
}
const startGlobe = PHONE ? afterReveal : duringIntro

/**
 * Markets: the region list and the live globe. Everything the globe needs loads during the intro (#274; on phones
 * right after it, #280): its chunk and
 * its texture, decoded off the main thread, then the canvas mounts offscreen and uploads the texture and compiles its
 * shaders in idle slices (three/Globe.tsx); its first frame is drawn before the section is on screen. The poster (the
 * globe's exact first view) is only a silent fallback for a device that hasn't finished by then.
 */
export function Markets() {
  const [mounted, setMounted] = useState(false)
  const poster = useRef<HTMLImageElement>(null)
  useEffect(() => {
    let gone = false
    startGlobe(() => {
      // the fallback first (43 KB): on a slow connection the globe's chunk and texture would otherwise starve it
      if (poster.current) poster.current.loading = 'eager'
      void warmGlobe().then(calm).then(() => !gone && startTransition(() => setMounted(true)))
    })
    return () => void (gone = true)
  }, [])
  const world = film.world[0]
  return (
    <section id="markets" className="section theme-light home-markets" aria-labelledby="markets-title">
      <m.div className="home-markets__copy" {...reveal}>
        <m.p className="eyebrow mono" variants={rise}>Markets</m.p>
        <m.h2 id="markets-title" className="section__title" variants={rise}>{world.title}</m.h2>
        <MarketList />
      </m.div>
      <div className="home-globe" data-globe>
        {/* the live globe's first view: a fallback, shown only if the globe hasn't drawn by the time it's on screen (#274) */}
        <picture>
          <source type="image/avif" srcSet={GLOBE_POSTER('avif')} sizes={POSTER_SIZES} />
          <img ref={poster} className="globe-ph" srcSet={GLOBE_POSTER('webp')} sizes={POSTER_SIZES} src={texUrl('globe-home_1280.webp')} alt="" width={2560} height={2560} loading="lazy" decoding="async" />
        </picture>
        {mounted && (
          <Suspense fallback={null}>
            <GlobeCanvas worldIndex={-1} />
          </Suspense>
        )}
      </div>
    </section>
  )
}
