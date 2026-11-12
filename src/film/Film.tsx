import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { ChapterDef } from '../config/chapters'
import { ChapterCopy } from './ChapterCopy'
import { setChapters, unbindChapters } from './controller'
import './film.css'

/** Chapters are spacer sections; the visuals live on one fixed stage. */
export function Film({ chapters }: { chapters: ChapterDef[] }) {
  const refs = useRef<HTMLElement[]>([])
  useLayoutEffect(() => {
    setChapters(chapters, refs.current.slice(0, chapters.length))
    return unbindChapters
  }, [chapters])
  return (
    <div className="film" id="story">
      {chapters.map((ch, i) => (
        <section
          key={ch.id}
          id={ch.id}
          className="chapter"
          data-chapter={ch.id}
          aria-label={ch.label}
          style={{ '--vh': ch.vh } as CSSProperties}
          ref={(el) => {
            if (el) refs.current[i] = el
          }}
        >
          <ChapterCopy chapter={ch} />
        </section>
      ))}
    </div>
  )
}
