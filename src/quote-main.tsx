import { afterFirstScreen } from './engine/first-screen'
// the page's base CSS stays in the entry, so the build inlines it into quote.html (scripts/static-hero.ts)
import './styles/global.css'
import './ui/chrome.css'
import './sections/sections.css'
import './ui/pages.css'

afterFirstScreen(() => import('./quote-app'))
