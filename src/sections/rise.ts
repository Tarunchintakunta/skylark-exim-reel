import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { env } from '../engine/env'

gsap.registerPlugin(ScrollTrigger)

/**
 * Story → business (redesign §6): the first business section rises over the globe as a sand panel whose inset
 * corners open to full bleed as it reaches the top. clip-path only, scrubbed to scroll; no motion with reduced motion.
 */
export function bindRise(el: HTMLElement) {
  if (env.reduced) return () => {}
  el.classList.add('is-rise')
  const tween = gsap.fromTo(
    el,
    { '--rise-top': '0px', '--rise-side': '4vw', '--rise-r': '32px' },
    {
      '--rise-side': '0vw',
      '--rise-r': '0px',
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 15%', scrub: true },
    },
  )
  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
    el.classList.remove('is-rise')
  }
}
