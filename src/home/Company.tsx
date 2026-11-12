import { ABOUT, HOME } from '../config/content'
import { NEWS, formatNewsDate } from '../content/news'
import * as m from 'motion/react-m'
import { reveal, rise } from '../motion/tokens'

/** About in short (the lead paragraph and the partners), and the latest news item once src/content/news.json has one (nav.ts). */
export function Company() {
  const latest = NEWS[0]
  return (
    <m.section id="about" className={`section theme-light home-company${latest ? '' : ' home-company--solo'}`} {...reveal} aria-labelledby="about-title">
      <div className="home-company__about">
        <m.p className="eyebrow mono" variants={rise}>About</m.p>
        <m.h2 id="about-title" className="section__title" variants={rise}>{ABOUT.title}</m.h2>
        <m.p className="about__lead" variants={rise}>{ABOUT.company[0]}</m.p>
        <m.p className="home-company__partners" variants={rise}>
          <span className="mono">Managing partners</span> {ABOUT.partners.map((p) => p.name).join(' · ')}
        </m.p>
      </div>
      {latest && (
        <m.aside className="home-news" aria-labelledby="news-title" variants={rise}>
          <p className="eyebrow mono">News</p>
          <h2 id="news-title" className="home-news__title display">{HOME.news.title}</h2>
          <a className="home-news__item" href={`/news/${latest.slug}`}>
            <time className="mono" dateTime={latest.date}>{formatNewsDate(latest.date)}</time>
            <span className="home-news__item-title">{latest.title}</span>
            <span className="home-news__summary">{latest.summary}</span>
          </a>
          <a className="home-news__all" href="/news">
            {HOME.news.all} <span aria-hidden="true">→</span>
          </a>
        </m.aside>
      )}
    </m.section>
  )
}
