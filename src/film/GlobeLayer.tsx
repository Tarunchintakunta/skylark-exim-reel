import { lazy, startTransition, Suspense, useEffect, useState } from 'react'
import type { ChapterDef } from '../config/chapters'
import { PORTRAIT } from '../config/hero'
import { useApp } from '../engine/store'
import { GLOBE_PH, earthBitmap, warmGlobePlaceholder } from '../three/globeState'
import { avifReady } from './segments'
import '../sections/markets.css'

const loadGlobe = () => import('../three/Globe')
const GlobeCanvas = lazy(loadGlobe)

const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300))
let fetched = false
/** Warm the globe in idle time, never during the first load: placeholder first (smallest), then the chunks and the texture. */
function prefetch() {
  if (fetched) return
  fetched = true
  idle(() => {
    void avifReady.then(warmGlobePlaceholder)
    void loadGlobe()
    void earthBitmap('film').catch(() => {})
  })
}

/**
 * Mounts the R3F globe (lazy three.js chunks) in idle time from two chapters before the world chapter, and unmounts it once the film
 * has scrolled past (redesign §2.8): no WebGL context or render loop alive behind the business sections.
 * One chapter earlier the chunks, texture and placeholder are fetched in idle time, so the globe is ready on arrival;
 * the placeholder covers the frames until the live globe draws (#D).
 */
export function GlobeLayer({ chapters }: { chapters: ChapterDef[] }) {
  const chapter = useApp((s) => s.chapter)
  const past = useApp((s) => s.past)
  const ready = useApp((s) => s.ready)
  const world = chapters.findIndex((c) => c.id === 'world')
  const at = chapters.findIndex((c) => c.id === chapter)
  const warm = ready && at >= world - 3
  const near = at >= world - 2
  const [ph, setPh] = useState(false)
  // the canvas (WebGL context, scene) mounts in idle time, as a transition, once the film is two chapters away
  const [mount, setMount] = useState(false)
  useEffect(() => {
    if (!warm) return
    prefetch()
    setPh(true)
  }, [warm])
  useEffect(() => {
    if (near && !mount) idle(() => startTransition(() => setMount(true)))
  }, [near, mount])
  if (past) return null
  return (
    <>
      {/* the globe's entry frame (close over the sea off Visakhapatnam), shown until the live globe has drawn */}
      {ph && (
        <picture>
          <source type="image/avif" media={PORTRAIT} srcSet={GLOBE_PH('avif').sq} />
          <source type="image/webp" media={PORTRAIT} srcSet={GLOBE_PH('webp').sq} />
          <source type="image/avif" srcSet={GLOBE_PH('avif').wide} sizes="100vw" />
          <img className="globe-ph" src={GLOBE_PH('webp').fallback} srcSet={GLOBE_PH('webp').wide} sizes="100vw" alt="" decoding="async" />
        </picture>
      )}
      {near && mount && (
        <Suspense fallback={null}>
          <GlobeCanvas worldIndex={world} />
        </Suspense>
      )}
    </>
  )
}
