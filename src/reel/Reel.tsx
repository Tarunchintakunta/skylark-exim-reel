import { useEffect, useMemo, useRef, useState } from 'react'
import { env } from '../engine/env'
import { frame, store, useApp } from '../engine/store'
import { onTick, resizeScroll, scrollToY } from '../engine/ticker'
import { timeline } from './chain'
import { ReelEngine, phone } from './engine'
import './reel.css'

/** scroll length a frame takes (px): desktop wheel ~ 8 frames a notch, phones a little shorter */
const PX = () => (phone() ? 9 : 12)
/** frames the intro waits for (decoded) before it opens */
const FIRST = 8

/**
 * /story's reel: the path's frames on one fixed canvas, scrubbed by the scroll (Lenis, engine/ticker.ts). The caption
 * panel, rail and picker are fixed; only their contents change. Scrolling up plays the same frames backwards.
 */
export function Reel({ onReady }: { onReady: () => void }) {
  const path = useApp((s) => s.path)
  const tl = useMemo(() => timeline(path), [path])
  const root = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const cap = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState(0)
  const [line, setLine] = useState(0)
  const [open, setOpen] = useState(false)
  const n = tl.frames.length
  const span = () => n * PX()

  useEffect(() => {
    const eng = new ReelEngine(canvas.current!, tl, () => document.documentElement.classList.add('reel-first'))
    let readyDone = false
    let last = -1
    let st = -1
    let ln = -1
    let past = false
    const off = onTick(() => {
      const top = root.current!.offsetTop
      const y = Math.max(0, frame.scroll - top)
      const p = Math.min(1, y / span())
      const f = p * (n - 1)
      if (f !== last) {
        last = f
        eng.seek(f)
        fill.current!.style.transform = `scaleY(${p})`
        let s = 0
        while (s + 1 < tl.starts.length && f >= tl.starts[s + 1]) s++
        if (s !== st) setStage((st = s))
        const a = tl.starts[s]
        const b = s + 1 < tl.starts.length ? tl.starts[s + 1] : n
        const l = Math.min(2, Math.floor(((f - a) / Math.max(1, b - a)) * 3))
        if (l !== ln) setLine((ln = l))
      }
      const isPast = y > span() + innerHeight * 0.4
      if (isPast !== past) {
        past = isPast
        root.current!.classList.toggle('is-past', past)
        store.setState({ past })
      }
      if (!readyDone && eng.ready(FIRST)) {
        readyDone = true
        onReady()
      }
    }, -10)
    const resize = () => (eng.resize(), resizeScroll())
    addEventListener('resize', resize)
    resizeScroll()
    return () => (off(), removeEventListener('resize', resize), eng.destroy())
  }, [tl])

  // headline swap: the title and eyebrow fade out and back in with the new stage, the panel itself stays put
  useEffect(() => {
    if (env.reduced) return
    cap.current!.classList.add('is-swap')
    const t = setTimeout(() => cap.current?.classList.remove('is-swap'), 180)
    return () => clearTimeout(t)
  }, [stage])

  const go = (k: number) => {
    setOpen(false)
    const y = root.current!.offsetTop + (tl.starts[k] / Math.max(1, n - 1)) * span()
    scrollToY(y + 1)
  }
  const s = tl.stages[stage]

  return (
    <section id="story" className="reel" ref={root} aria-label="Our story">
      <canvas className="reel__stage" ref={canvas} aria-hidden="true" />
      <div className="reel__track" style={{ height: `calc(${span()}px + 100vh)` }}>
        {tl.stages.map((st, k) => (
          <span key={st.id} id={`stage-${st.id}`} className="reel__mark" style={{ top: `${(tl.starts[k] / Math.max(1, n - 1)) * span()}px` }} />
        ))}
      </div>
      <div className="reel-ui">
        <div className="reel-cap" ref={cap} aria-live="polite">
          <p className="reel-cap__eyebrow">
            <b>{String(stage + 1).padStart(2, '0')}</b>
            <span>{s.label}</span>
          </p>
          <h2 className="reel-cap__title">
            {s.title[0]} <em>{s.title[1]}</em>
          </h2>
          <div className="reel-cap__lines">
            {s.lines.map((t, i) => (
              <p key={`${s.id}-${i}`} className={`reel-cap__line${i === line ? ' is-on' : ''}`} aria-hidden={i !== line}>
                {t}
              </p>
            ))}
          </div>
        </div>
        <nav className="reel-rail" aria-label="Story stages">
          <span className="reel-rail__fill" ref={fill} />
          {tl.stages.map((st, k) => (
            <button
              key={st.id}
              className="reel-rail__tick"
              style={{ top: `${(tl.starts[k] / Math.max(1, n - 1)) * 100}%` }}
              aria-current={k === stage ? 'step' : undefined}
              onClick={() => go(k)}
            >
              <span>{st.label}</span>
            </button>
          ))}
        </nav>
        <div className="reel-pick">
          <div className="reel-pick__panel" id="reel-pick" hidden={!open}>
            <ol>
              {tl.stages.map((st, k) => (
                <li key={st.id}>
                  <button aria-current={k === stage ? 'step' : undefined} onClick={() => go(k)}>
                    <b>{String(k + 1).padStart(2, '0')}</b>
                    <span>
                      {st.title[0]} <em>{st.title[1]}</em>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <button className="reel-pick__btn" aria-expanded={open} aria-controls="reel-pick" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Choose a stage'}
          </button>
        </div>
      </div>
    </section>
  )
}
