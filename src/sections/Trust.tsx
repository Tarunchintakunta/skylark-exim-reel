import { TRUST } from '../config/content'
import * as m from 'motion/react-m'
import { reveal, rise, riseAlone } from '../motion/tokens'

/** Why choose us (STORY §13): the facts set large, then six editorial statements (no boxes), the compliance line exactly as the site states it, a facts row. No badges. */
export function Trust() {
  return (
    <section id="why" className="section theme-light" aria-labelledby="why-title">
      <m.header className="section__head" {...reveal}>
        <m.p className="eyebrow mono" variants={rise}>Why us</m.p>
        <m.h2 id="why-title" className="section__title" variants={rise}>{TRUST.title}</m.h2>
      </m.header>
      <m.ul className="facts" aria-label="Facts" {...reveal}>
        {TRUST.facts.map((f) => (
          <m.li key={f.label} className="fact" variants={rise}>
            <span className="fact__value display">{f.value}</span>
            <span className="fact__label mono">{f.label}</span>
          </m.li>
        ))}
      </m.ul>
      <m.ol className="statements" {...reveal}>
        {TRUST.tiles.map((t, i) => (
          <m.li key={t.title} className="statement" variants={rise}>
            <span className="statement__no mono">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="statement__title">{t.title}</h3>
            <p className="statement__line">{t.line}</p>
          </m.li>
        ))}
      </m.ol>
      <m.p className="compliance" {...riseAlone}>
        <span className="mono">Certificates</span>
        {TRUST.compliance}
      </m.p>
    </section>
  )
}
