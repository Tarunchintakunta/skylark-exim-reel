import { useEffect, useState } from 'react'
import { start } from '../config/content'
import type { Route } from '../config/nav'
import { Mark } from './Mark'
import { SiteNav } from './SiteNav'
import { bindScrolled } from './scrolled'

/**
 * Header for the pages without the film (home, /quote, /news): the site nav and the quote button, no path toggle.
 * On sand (`is-light`) on the document pages; over the hero on the homepage, where Home.tsx turns it light below the hero.
 */
export function PageHeader({ current, light = true }: { current: Exclude<Route, 'story'>; light?: boolean }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => bindScrolled(setScrolled), [])
  const close = () => setOpen(false)

  return (
    <header className={`topbar is-page${light ? ' is-light' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      <a className="brand" href="/" aria-label="Skylark Exim, home">
        <span className="brand__mark">
          <Mark />
        </span>
        <span className="brand__word">Skylark Exim</span>
      </a>
      <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((value) => !value)}>
        {open ? 'Close' : 'Menu'}
      </button>
      <SiteNav open={open} current={current} onNavigate={close} />
      <a className="quote-cta" href="/quote" aria-current={current === 'quote' ? 'page' : undefined}>
        {start.cta} →
      </a>
    </header>
  )
}
