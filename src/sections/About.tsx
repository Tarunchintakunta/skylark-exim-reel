import { ABOUT } from '../config/content'
import * as m from 'motion/react-m'
import { reveal, rise } from '../motion/tokens'

/** About (STORY §14): company, vision, mission, managing partners by name only (redesign §6). */
export function About() {
  return (
    <section id="about" className="section theme-light about" aria-labelledby="about-title">
      <m.header className="section__head" {...reveal}>
        <m.p className="eyebrow mono" variants={rise}>About</m.p>
        <m.h2 id="about-title" className="section__title" variants={rise}>{ABOUT.title}</m.h2>
      </m.header>
      <m.div className="about__grid" {...reveal}>
        <div className="about__company">
          {ABOUT.company.map((p, i) => (
            <m.p key={i} className={i === 0 ? 'about__lead' : undefined} variants={rise}>
              {p}
            </m.p>
          ))}
        </div>
        <div className="about__vm">
          <m.article variants={rise}>
            <h3 className="mono">Vision</h3>
            <p>{ABOUT.vision}</p>
          </m.article>
          <m.article variants={rise}>
            <h3 className="mono">Mission</h3>
            <p>{ABOUT.mission}</p>
          </m.article>
        </div>
      </m.div>
      <m.div className="partners" {...reveal}>
        <m.h3 className="eyebrow mono" variants={rise}>Managing partners</m.h3>
        <ul className="partners__list">
          {ABOUT.partners.map((p) => (
            <m.li key={p.name} className="partner" variants={rise}>
              {p.name}
            </m.li>
          ))}
        </ul>
      </m.div>
    </section>
  )
}
