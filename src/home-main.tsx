import { afterFirstScreen } from './engine/first-screen'
// the page's base CSS stays in the entry, so the build inlines it into index.html (scripts/static-hero.ts)
import './styles/global.css'

afterFirstScreen(() => import('./home-app'))
