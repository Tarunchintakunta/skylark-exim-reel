import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadVitals } from './engine/vitals'
import { MotionRoot } from './motion/MotionRoot'
import { QuotePage } from './pages/QuotePage'
import { usePageMeta } from './pages/meta'
import { PageFooter } from './ui/PageFooter'
import { PageHeader } from './ui/PageHeader'

document.documentElement.dataset.ready = '1'

function QuoteApp() {
  usePageMeta(
    'Request an export quote | Skylark Exim',
    'Request an export quote from Skylark Exim in Sheela Nagar, Visakhapatnam. Tell us the species, the form, and whether you need it raw fresh, chilled or frozen.',
    '/quote',
  )
  return (
    <div className="doc">
      <PageHeader current="quote" />
      <QuotePage />
      <PageFooter />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      <QuoteApp />
    </MotionRoot>
  </StrictMode>,
)

loadVitals()
