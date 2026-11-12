import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadVitals } from './engine/vitals'
import { MotionRoot } from './motion/MotionRoot'
import { newsPost } from './content/news'
import { NewsPage } from './pages/NewsPage'
import { usePageMeta } from './pages/meta'
import { PageFooter } from './ui/PageFooter'
import { PageHeader } from './ui/PageHeader'

document.documentElement.dataset.ready = '1'

function newsPath() {
  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/'
  const article = path.match(/^\/news\/([^/]+)$/)
  return article ? { slug: decodeURIComponent(article[1]) } : {}
}

function NewsApp() {
  const { slug } = newsPath()
  const post = slug ? newsPost(slug) : undefined
  const title = slug
    ? post ? `${post.title} | Skylark Exim` : 'Update not found | Skylark Exim'
    : 'News & updates | Skylark Exim'
  const description = post?.summary ?? 'News and updates from Skylark Exim, the seafood exporter in Visakhapatnam.'
  usePageMeta(title, description, slug ? `/news/${slug}` : '/news')
  return (
    <div className="doc">
      <PageHeader current="news" />
      <NewsPage slug={slug} />
      <PageFooter />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      <NewsApp />
    </MotionRoot>
  </StrictMode>,
)

loadVitals()
