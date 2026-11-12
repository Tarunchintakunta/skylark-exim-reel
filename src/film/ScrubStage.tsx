import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ChapterDef } from '../config/chapters'
import { frame } from '../engine/store'
import { onTick } from '../engine/ticker'
import { film } from './controller'
import { GlobeLayer } from './GlobeLayer'
import { POOL, bindStage } from './scrub'
import { toSegments } from './segments'
import './stage.css'

/** The one fixed stage: posters under POOL video decoders (the current clip and the next ones) and the frame-sequence canvas, a veil for cuts and the bottom scrim. */
export function ScrubStage({ chapters }: { chapters: ChapterDef[] }) {
  const segs = useMemo(() => toSegments(chapters), [chapters])
  const ref = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => bindStage(ref.current!, segs), [segs])

  useEffect(() => {
    let lastY = -1
    let stillSince = 0
    return onTick(() => {
      const el = cueRef.current
      if (!el) return
      const y = frame.scroll
      const now = performance.now()
      if (lastY < 0 || Math.abs(y - lastY) > 0.5) {
        lastY = y
        stillSince = now
      }
      const id = frame.index >= 0 ? film.chapters[frame.index]?.id : undefined
      let cue = 'off'
      if (!frame.past && id) {
        if (y < 80) cue = 'explore'
        else if (id === 'world') cue = 'world'
        else if (now - stillSince > 1000) cue = 'continue'
      }
      if (el.dataset.cue !== cue) el.dataset.cue = cue
    })
  }, [])

  return (
    // not aria-hidden as a whole: the globe inside is a focusable, labelled control; the rest is decorative
    <div className="stage" ref={ref}>
      {segs.map((s, i) => {
        const m = s.media
        if (m.kind === 'gradient') return <div key={i} data-seg={i} className="stage__layer stage__gradient" />
        if (m.kind === 'globe')
          return (
            <div key={i} data-seg={i} className="stage__layer stage__light">
              <GlobeLayer chapters={chapters} />
            </div>
          )
        return (
          <img
            // keyed by picture, not index: after a path switch a reused <img> kept the other path's poster (scrub.ts only
            // sets an empty src), so farmed "Paperwork" showed the port and farmed 01 opened on the boat (#311, #314)
            key={`${i}:${m.kind === 'video' ? m.id : m.poster}`}
            data-seg={i}
            className={m.kind === 'dom' ? 'stage__layer stage__dom' : 'stage__layer'}
            // the source is set by scrub.ts once AVIF support is known: every poster under the intro (#preload), else lazily
            src={undefined}
            alt=""
            decoding="async"
            // the first frame is what the intro opens onto
            fetchPriority={i === 0 ? 'high' : 'low'}
          />
        )
      })}
      {/* desktop frame sequences (#hd2, scrub.ts) */}
      <canvas className="stage__seq" aria-hidden="true" />
      {Array.from({ length: POOL }, (_, k) => (
        <video key={k} className="stage__video" muted playsInline preload="auto" disablePictureInPicture tabIndex={-1} aria-hidden="true" />
      ))}
      <div className="stage__veil" />
      <div className="stage__scrim" />
      <p className="stage__cue" data-cue="off" ref={cueRef} aria-hidden="true">
        <span className="stage__cue-pill">
          <span data-for="explore">
            Scroll down to explore <span aria-hidden="true">↓</span>
          </span>
          <span data-for="continue">
            Scroll to continue <span aria-hidden="true">↓</span>
          </span>
          <span data-for="world">
            Drag to rotate globe · Click a market · Scroll for products <span aria-hidden="true">↓</span>
          </span>
        </span>
      </p>
    </div>
  )
}
