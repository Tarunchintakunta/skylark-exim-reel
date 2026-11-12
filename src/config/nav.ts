import { NEWS } from '../content/news'
import { start } from './content'

/** Site routes; each page marks its own nav item as current. */
export type Route = 'home' | 'story' | 'quote' | 'news'

export interface NavItem {
  id: string
  label: string
  href: string
  /** "Our Story": the two paths, as a dropdown (desktop) or an indented pair (mobile menu) */
  sub?: { label: string; href: string }[]
}

/**
 * The one navbar on every page. Section items are homepage anchors (no /products or /about page: the homepage holds that content).
 * News shows only once src/content/news.json has a post: until then /news is an empty state (NEWS.md).
 */
export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', href: '/' },
  {
    id: 'story',
    label: 'Our Story',
    href: '/story',
    sub: [
      { label: start.ocean.sub, href: '/story#ocean' },
      { label: start.pond.sub, href: '/story#pond' },
    ],
  },
  { id: 'products', label: 'Products', href: '/#products' },
  { id: 'markets', label: 'Markets', href: '/#markets' },
  { id: 'about', label: 'About', href: '/#about' },
  ...(NEWS.length ? [{ id: 'news', label: 'News', href: '/news' }] : []),
  { id: 'order', label: 'Order', href: '/order' },
  { id: 'contact', label: 'Contact', href: '/#contact' },
]
