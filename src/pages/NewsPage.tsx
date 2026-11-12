import * as m from 'motion/react-m'
import { formatNewsDate, NEWS, newsPost, newsSrcSet } from '../content/news'
import { reveal, rise, riseAlone } from '../motion/tokens'

function Empty() {
  return (
    <m.div className="news-empty" {...riseAlone}>
      <p>Updates coming soon</p>
      <a className="btn btn--solid" href="/quote">Request export quote</a>
    </m.div>
  )
}

function Index() {
  return (
    <main id="main" className="doc-main" tabIndex={-1}>
      <header className="section__head">
        <p className="eyebrow">News</p>
        <h1 id="news-title" className="section__title">News & updates</h1>
      </header>
      {NEWS.length === 0 ? (
        <Empty />
      ) : (
        <m.ul className="news-grid" {...reveal}>
          {NEWS.map((post) => (
            <m.li key={post.slug} variants={rise}>
              <a className="news-card" href={`/news/${post.slug}`}>
                <img src={post.image} srcSet={newsSrcSet(post)} sizes="(max-width: 819px) calc(100vw - 40px), 30vw" alt="" width={640} height={427} />
                <time dateTime={post.date}>{formatNewsDate(post.date)}</time>
                <h2>{post.title}</h2>
                <p>{post.summary}</p>
              </a>
            </m.li>
          ))}
        </m.ul>
      )}
    </main>
  )
}

function Article({ slug }: { slug: string }) {
  const post = newsPost(slug)
  if (!post) {
    return (
      <main id="main" className="doc-main" tabIndex={-1}>
        <header className="section__head">
          <p className="eyebrow">News</p>
          <h1 className="section__title">Update not found</h1>
        </header>
        <div className="news-empty">
          <p>This update is not published.</p>
          <a className="close__updates" href="/news">News & updates</a>
        </div>
      </main>
    )
  }
  return (
    <main id="main" className="doc-main" tabIndex={-1}>
      <article className="news-article">
        <p className="eyebrow">News</p>
        <time dateTime={post.date}>{formatNewsDate(post.date)}</time>
        <h1 className="section__title">{post.title}</h1>
        <img src={post.image} srcSet={newsSrcSet(post)} sizes="(max-width: 819px) calc(100vw - 40px), 42rem" alt="" width={960} height={640} />
        <p className="news-article__body">{post.body ?? post.summary}</p>
        <p>
          <a className="close__updates" href={post.source}>Source on skylarkexim.com</a>
        </p>
        <a className="close__updates" href="/news">All updates</a>
      </article>
    </main>
  )
}

export function NewsPage({ slug }: { slug?: string }) {
  return (
    <>
      <a className="skip-link mono" href="#main">Skip to content</a>
      {slug ? <Article slug={slug} /> : <Index />}
    </>
  )
}
