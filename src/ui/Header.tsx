import { useEffect, useRef, useState } from 'react'
import { start } from '../config/content'
import { setPath } from '../engine/path'
import { frame, useApp, type Path } from '../engine/store'
import { onTick } from '../engine/ticker'
import { film } from '../film/controller'
import { onCache, progress } from '../film/warmcache'
import { Mark } from './Mark'
import { SiteNav } from './SiteNav'
import { bindScrolled } from './scrolled'
import './chrome.css'

const PATHS: Path[] = ['ocean', 'pond']

/**
 * /story top bar (redesign §3): mark + wordmark left; the Wild catch · Farmed shrimp text toggle (only here); the site nav right.
 * "Request export quote →" appears as a quiet text button from the plant chapters on, and as a bottom bar on
 * mobile only once the business sections are on screen. Dark-on-light over the globe and business sections.
 */
export function Header() {
  const root = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const path = useApp((s) => s.path)
  const cache = useRef<HTMLSpanElement>(null)
  // the warm cache's progress (#251): a hairline under the bar, transform only, gone once the path is cached
  useEffect(
    () =>
      onCache(() => {
        const p = progress()
        cache.current!.style.transform = `scaleX(${p})`
        cache.current!.classList.toggle('is-done', p >= 1)
      }),
    [],
  )
  useEffect(() => bindScrolled((on) => root.current!.classList.toggle('is-scrolled', on)), [])

  useEffect(() => {
    let light = false
    let cta = false
    let bar = false
    return onTick(() => {
      const id = film.chapters[frame.index]?.id
      const l = frame.past || id === 'world'
      if (l !== light) root.current!.classList.toggle('is-light', (light = l))
      // the plant onward: intake is the first shared chapter after the fork
      // (no chapters yet while the story chunk loads: findIndex is -1, which must not open the CTA and shift the nav)
      const intake = film.chapters.findIndex((c) => c.id === 'intake')
      const plant = frame.past || (intake >= 0 && intake <= frame.index)
      if (plant !== cta) root.current!.classList.toggle('has-cta', (cta = plant))
      if (frame.past !== bar) root.current!.classList.toggle('has-bar', (bar = frame.past))
    })
  }, [])

  return (
    <header className="topbar" ref={root}>
      <a className="brand" href="/" aria-label="Skylark Exim, home">
        <span className="brand__mark" data-brand-mark>
          <Mark />
        </span>
        <span className="brand__word">Skylark Exim</span>
      </a>
      <p className="path-toggle" role="group" aria-label="Story path">
        {PATHS.map((p, i) => (
          <span key={p}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            <a
              href={`#${p}`}
              aria-current={path === p ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault()
                // from anywhere on the page: land on that path's first chapter (#ocean → o1, #pond → p1)
                setPath(p, true)
              }}
            >
              {start[p].sub}
            </a>
          </span>
        ))}
      </p>
      <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
        {open ? 'Close' : 'Menu'}
      </button>
      <SiteNav
        open={open}
        current="story"
        onNavigate={(e) => {
          setOpen(false)
          // already on /story: the path links switch in-page, like the toggle (a same-hash link fires no hashchange)
          const hash = e.currentTarget.getAttribute('href')?.match(/^\/story#(ocean|pond)$/)?.[1] as Path | undefined
          if (!hash) return
          e.preventDefault()
          setPath(hash, true)
        }}
      />
      <a className="quote-cta" href="/quote">
        {start.cta} →
      </a>
      <span className="cache-bar" ref={cache} aria-hidden="true" />
    </header>
  )
}
