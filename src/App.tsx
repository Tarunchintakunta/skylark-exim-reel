import { lazy, Suspense, useEffect } from 'react'
import { bindPathHash } from './engine/path'
import { store } from './engine/store'
import { Reel } from './reel/Reel'
import { Header } from './ui/Header'

const Sections = lazy(() => import('./reel/Sections'))

/** the intro (story.html #boot) opens once the reel's first frames are decoded; its CSS failsafe still opens it at 3 s */
function reveal() {
  if (store.getState().ready) return
  store.setState({ ready: true })
  const boot = document.getElementById('boot')
  if (boot) {
    boot.style.transition = 'opacity .35s ease'
    boot.style.opacity = '0'
    setTimeout(() => boot.remove(), 400)
  }
  document.getElementById('first-frame')?.remove()
  document.querySelector('.reel-static')?.remove()
  store.setState({ revealed: true })
}

/** /story: the reel, then the business sections. Every load opens on stage 1, frame 1 (story.html resets the scroll). */
export default function App() {
  useEffect(bindPathHash, [])
  useEffect(() => scrollTo(0, 0), [])
  return (
    <>
      <a className="skip-link mono" href="#main">Skip to content</a>
      <a className="skip-link mono" href="/quote">Skip to quote</a>
      <Header />
      <main id="main" tabIndex={-1}>
        <h1 className="sr-only">Our story: from sea and pond to port</h1>
        <Reel onReady={reveal} />
        <Suspense fallback={null}>
          <Sections />
        </Suspense>
      </main>
    </>
  )
}
