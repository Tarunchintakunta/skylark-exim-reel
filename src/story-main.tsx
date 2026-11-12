import { afterFirstScreen } from './engine/first-screen'
// the page's base CSS stays in the entry, so the build inlines it into story.html (scripts/static-hero.ts)
import './styles/global.css'

afterFirstScreen(() => import('./story-app'))
