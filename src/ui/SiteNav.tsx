import * as m from 'motion/react-m'
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { start } from '../config/content'
import { NAV, type Route } from '../config/nav'
import { SPRING } from '../motion/tokens'

/** the bar's own width in CSS; scaleX stretches it to the link's */
const BAR_W = 100

/**
 * The underline under the current route that slides to whichever link is hovered or focused and back (#238): one
 * element, x and scaleX on a spring, so it is transform only. It does what a shared `layoutId` would, without Motion's
 * layout features (domMax), which this site does not load. In the mobile menu the current link keeps a plain underline.
 */
function useBar(list: React.RefObject<HTMLUListElement | null>) {
  const [to, setTo] = useState<{ x: number; w: number } | null>(null)
  const current = () => list.current?.querySelector<HTMLElement>(':scope > li > .nav__link[aria-current="page"]') ?? null
  const place = (el: HTMLElement | null) => {
    const ul = list.current
    if (!ul || !el?.offsetWidth) return setTo(null)
    const a = el.getBoundingClientRect()
    setTo({ x: a.left - ul.getBoundingClientRect().left, w: a.width })
  }
  useEffect(() => {
    const home = () => place(current())
    home()
    void document.fonts.ready.then(home)
    addEventListener('resize', home)
    return () => removeEventListener('resize', home)
  }, [])
  const top = (e: { target: EventTarget }) => (e.target as Element).closest<HTMLElement>(':scope > li > .nav__link, .nav > ul > li > .nav__link')
  return {
    to,
    onPointerOver: (e: { target: EventTarget }) => top(e) && place(top(e)),
    onFocus: (e: { target: EventTarget }) => top(e) && place(top(e)),
    onPointerLeave: () => place(current()),
    onBlur: () => place(current()),
  }
}

/** The link list shared by every header: the current route is marked, "Our Story" opens its two paths. */
export function SiteNav({ open, current, onNavigate }: { open: boolean; current: Route; onNavigate: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const list = useRef<HTMLUListElement>(null)
  const { to, ...track } = useBar(list)
  return (
    <nav id="site-nav" className={`nav${open ? ' is-open' : ''}`} aria-label="Site">
      <ul ref={list} {...track}>
        {NAV.map((item, i) => (
          <li key={item.id} className={item.sub ? 'nav__group' : undefined} style={{ '--i': i } as CSSProperties}>
            <a className="nav__link" data-nav={item.id} href={item.href} aria-current={item.id === current ? 'page' : undefined} onClick={onNavigate}>
              {item.label}
            </a>
            {item.sub && (
              <ul className="nav__sub" aria-label={item.label}>
                {item.sub.map((s) => (
                  <li key={s.href}>
                    <a className="nav__link" href={s.href} onClick={onNavigate}>
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        <li className="nav__quote" style={{ '--i': NAV.length } as CSSProperties}>
          <a className="nav__link" href="/quote" aria-current={current === 'quote' ? 'page' : undefined} onClick={onNavigate}>
            {start.cta} →
          </a>
        </li>
        <m.li
          className="nav__bar"
          aria-hidden="true"
          initial={false}
          animate={to ? { x: to.x, scaleX: to.w / BAR_W, opacity: 1 } : { opacity: 0 }}
          transition={SPRING}
        />
      </ul>
    </nav>
  )
}
