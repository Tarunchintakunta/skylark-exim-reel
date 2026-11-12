import * as m from 'motion/react-m'
import { HOME } from '../config/content'
import { reveal, rise } from '../motion/tokens'

/** Intro band; the two story paths follow as the Story Entry cards (home/StoryEntry.tsx, #268). */
export function Intro() {
  return (
    <section id="intro" className="section theme-light home-intro" aria-labelledby="intro-title">
      <m.header className="section__head" {...reveal}>
        <m.p className="eyebrow mono" variants={rise}>{HOME.intro.eyebrow}</m.p>
        <m.h2 id="intro-title" className="section__title" variants={rise}>{HOME.intro.title}</m.h2>
        <m.p className="home-intro__body" variants={rise}>{HOME.intro.body}</m.p>
      </m.header>
    </section>
  )
}
