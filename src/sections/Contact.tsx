import { Mark } from '../ui/Mark'
import { CONTACT } from '../config/content'
import * as m from 'motion/react-m'
import { reveal, rise } from '../motion/tokens'

/** Final call to action (redesign §6, #132): deep-sea band with the email set large, phones, both addresses, the profile PDF. */
export function Contact() {
  return (
    <m.section id="contact" className="contact-band" {...reveal} aria-labelledby="contact-title">
      <m.p className="eyebrow mono" variants={rise}>Contact</m.p>
      <m.h2 id="contact-title" className="contact-band__title" variants={rise}>
        Let’s talk <em>seafood</em>.
      </m.h2>
      <m.a className="contact-band__email" href={`mailto:${CONTACT.email}`} variants={rise}>
        {CONTACT.email}
      </m.a>
      <div className="contact-band__grid">
        <m.div variants={rise}>
          <h3 className="mono">Phone</h3>
          <ul>
            {CONTACT.phones.map((p) => (
              <li key={p.tel}>
                <a href={`tel:${p.tel}`}>{p.label}</a>
              </li>
            ))}
          </ul>
        </m.div>
        <m.div variants={rise}>
          <h3 className="mono">Office</h3>
          <p>{CONTACT.office}</p>
        </m.div>
        <m.div variants={rise}>
          <h3 className="mono">Processing unit</h3>
          <p>{CONTACT.unit}</p>
        </m.div>
        <m.div className="contact-band__actions" variants={rise}>
          <a className="contact-band__cta" href="/quote">
            Request export quote →
          </a>
          <a className="contact-band__pdf" href="/order">
            Place an order →
          </a>
          <a className="contact-band__pdf" href="/docs/skylark-exim-company-profile.pdf" download>
            Company profile (PDF)
          </a>
        </m.div>
      </div>
      <footer className="contact-band__foot mono">
        <Mark size={56} lazy />
        <span>© {new Date().getFullYear()} Skylark Exim</span>
        <span>Visakhapatnam, Andhra Pradesh</span>
      </footer>
    </m.section>
  )
}
