import { useEffect, useRef, type RefObject } from 'react'
import { exportsLine, start } from '../config/content'
import { env } from '../engine/env'
import { frame, useApp } from '../engine/store'
import { onTick } from '../engine/ticker'
import { HERO_POSTER, W, clipFile, mediaUrl } from '../film/segments'
import '../ui/hero.css'

/** the hero loop has no 2560 file: 1920 covers it there */
const heroSrc = mediaUrl(clipFile('hero-loop', W === 2560 ? 1920 : W))

let heroIn = () => {}
/** the city video can play through (at once with reduced motion: there is no video); the homepage's intro waits for it */
export const heroReady = new Promise<void>((r) => (heroIn = r))
if (env.reduced) heroIn()

/** the hero's first frame, the LCP image: the same <picture> and preloads the static hero uses (config/hero.ts) */
const Poster = () => (
  <picture>
    {HERO_POSTER.map((p) => (
      <source key={p.type + p.media} type={p.type} media={p.media} srcSet={p.srcSet} sizes="100vw" />
    ))}
    <img className="hero__poster" src={mediaUrl('hero-loop_1280.webp')} alt="" fetchPriority="high" decoding="async" />
  </picture>
)
const PATHS = ['ocean', 'pond'] as const

/**
 * Homepage hero: one screen of the Visakhapatnam city view, playing on its own as a muted loop under the copy, which is
 * all on screen from the first frame. It plays while any of it is on screen and pauses once it has scrolled fully away;
 * reduced motion gets the still first frame.
 */
export function HomeHero({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const revealed = useApp((s) => s.revealed)
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const lead = start.title.replace(/ world\.$/, '')

  useEffect(() => {
    if (!revealed) return
    root.current!.style.visibility = 'visible'
    root.current!.style.opacity = '1'
  }, [revealed])

  useEffect(() => {
    const v = video.current
    if (!v) return
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? void v.play().catch(() => {}) : v.pause()))
    io.observe(sectionRef.current!)
    return () => io.disconnect()
  }, [sectionRef])

  // two beats inside the same 100svh frame: the headline holds, the details drift as the next section rises
  useEffect(() => {
    const el = root.current
    if (!el || env.reduced) return
    return onTick(() => {
      const h = sectionRef.current?.offsetHeight || innerHeight
      const beat = Math.min(1, Math.max(0, frame.scroll / (h * 0.72)))
      el.style.setProperty('--hero-beat', beat.toFixed(4))
    })
  }, [sectionRef])

  return (
    <section ref={sectionRef} className="home-hero">
      <div className="hero" ref={root}>
        <div className="hero__media">
          <Poster />
          {!env.reduced && (
            <video
              ref={video}
              className="hero__poster"
              src={heroSrc}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              aria-hidden="true"
              tabIndex={-1}
              onCanPlayThrough={heroIn}
              onError={heroIn}
            />
          )}
        </div>
        <div className="hero__copy">
          <p className="hero__eyebrow mono">{start.eyebrow}</p>
          <h1 className="hero__title">
            {lead} <em>world</em>.
          </h1>
          <div className="hero__rest">
            <p className="hero__body">{start.body}</p>
            <div className="hero__exports">
              <h2 className="hero__exports-title mono">{exportsLine.title}</h2>
              <ul>
                {exportsLine.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <a className="hero__contact" href="/quote">
              Contact us
            </a>
            <div className="hero__fork" role="group" aria-label={start.choose}>
              <span className="hero__fork-label mono">{start.choose}</span>
              {PATHS.map((p) => (
                <a key={p} className="hero__fork-btn" href={`/story#${p}`} data-path={p}>
                  {start[p].sub}
                </a>
              ))}
            </div>
          </div>
        </div>
        <p className="hero__cue">
          Scroll to explore <span aria-hidden="true">↓</span>
        </p>
      </div>
    </section>
  )
}
