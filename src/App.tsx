import { lazy, Suspense, useEffect } from 'react'
import { chaptersFor, firstClip } from './config/chapters'
import { storyReady } from './engine/boot'
import { bindPathHash } from './engine/path'
import { store, useApp } from './engine/store'
import { scrollToY } from './engine/ticker'
import { ScrubStage } from './film/ScrubStage'
import { warm } from './film/scrub'
import { onCache, openingProgress, openingReady, startWarmCache } from './film/warmcache'
import { Loader, type Gate } from './ui/Loader'
import { Header } from './ui/Header'

const Story = lazy(() => import('./Story'))

// the chosen path's first clip (#ocean / #pond, else wild catch): started at mount, with nothing waiting on it (#264)
const clip = firstClip(store.getState().path)
const first = clip ? [clip.id] : []
/** the intro holds until the active path's first clip is in memory; the rest of the path keeps warming (#preload) */
const gate: Gate = { ready: openingReady, progress: openingProgress, onCache }

export default function App() {
  const path = useApp((s) => s.path)
  const ready = useApp((s) => s.ready)
  const chapters = chaptersFor(path)
  useEffect(() => {
    if (!ready) return
    const id = location.hash.slice(1)
    if (!id || id === 'ocean' || id === 'pond') return
    let raf = 0
    let frames = 0
    const tick = () => {
      frames += 1
      if (document.getElementById('boot') && frames < 180) {
        raf = requestAnimationFrame(tick)
        return
      }
      const el = document.getElementById(id)
      if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY, true)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready])
  // #ocean / #pond: the path anchors (#210); other section anchors (/#products from /quote) are handled above
  useEffect(bindPathHash, [])
  // the first clip starts at mount, alongside the warm cache's load of the whole path
  useEffect(() => void warm(first), [])
  useEffect(startWarmCache, [])
  return (
    <>
      <a className="skip-link mono" href="#main">Skip to content</a>
      <a className="skip-link mono" href="/quote">Skip to quote</a>
      <ScrubStage chapters={chapters} />
      <Header />
      <main id="main" tabIndex={-1}>
        <h1 className="sr-only">Our story: from sea and pond to port</h1>
        <Suspense fallback={null}>
          <Story chapters={chapters} />
        </Suspense>
      </main>
      <Loader mounted={storyReady} gate={gate} />
    </>
  )
}
