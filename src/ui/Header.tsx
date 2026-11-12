import { useEffect, useRef, useState } from 'react'
import { start } from '../config/content'
import { setPath } from '../engine/path'
import { store, useApp, type Path } from '../engine/store'
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
  useEffect(() => bindScrolled((on) => root.current!.classList.toggle('is-scrolled', on)), [])

  // light over the business sections; the quote CTA from the plant stage on (the reel sets store.chapter)
  useEffect(() => {
    const apply = () => {
      const { past, chapter } = store.getState()
      const el = root.current!
      el.classList.toggle('is-light', past)
      el.classList.toggle('has-cta', past || chapter === 'plant' || chapter === 'port')
      el.classList.toggle('has-bar', past)
    }
    apply()
    return store.subscribe(apply)
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
    </header>
  )
}
