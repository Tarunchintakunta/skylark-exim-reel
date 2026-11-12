import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadVitals } from './engine/vitals'
import { MotionRoot } from './motion/MotionRoot'
import App from './App'
import { startEngine } from './engine/ticker'

import { env } from './engine/env'

if (env.mobile) document.documentElement.classList.add('is-mobile')
if (env.reduced) document.documentElement.classList.add('is-reduced')

history.scrollRestoration = 'manual'
// the reel (spec): Lenis lerp 0.09, wheel 0.8; ?lerp= still overrides for A/B runs
startEngine({ lerp: Number(new URLSearchParams(location.search).get('lerp')) || 0.09, wheel: 0.8 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      <App />
    </MotionRoot>
  </StrictMode>,
)

loadVitals()
