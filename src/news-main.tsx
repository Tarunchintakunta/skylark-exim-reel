import { afterFirstScreen } from './engine/first-screen'
// the page's base CSS stays in the entry, so the build inlines it into news.html (scripts/static-hero.ts)
import './styles/global.css'
import './ui/chrome.css'
import './sections/sections.css'
import './ui/pages.css'

afterFirstScreen(() => import('./news-app'))
