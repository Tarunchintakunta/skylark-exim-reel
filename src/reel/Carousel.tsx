import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, productSrc } from '../config/products'
import { mediaUrl } from '../film/media'
import { useApp } from '../engine/store'

/**
 * Products: a tilted 3D card carousel with a 01 / 0N counter. The path picks the range (wild catch: marine fish,
 * farmed: shrimps). Arrows, arrow keys and a horizontal swipe move it; every card enquires straight into the quote form.
 */
export function Carousel() {
  const path = useApp((s) => s.path)
  const cat = CATEGORIES[path === 'pond' ? 'shrimps' : 'marine']
  const list = cat.products
  const [at, setAt] = useState(0)
  const touch = useRef<number | null>(null)
  useEffect(() => setAt(0), [path])
  const go = (d: number) => setAt((a) => Math.max(0, Math.min(list.length - 1, a + d)))
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <section
      id="products"
      className="carousel"
      aria-roledescription="carousel"
      aria-labelledby="carousel-title"
      onKeyDown={(e) => (e.key === 'ArrowRight' ? go(1) : e.key === 'ArrowLeft' ? go(-1) : null)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return
        const dx = e.changedTouches[0].clientX - touch.current
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
        touch.current = null
      }}
    >
      <div className="carousel__head">
        <h2 id="carousel-title" className="carousel__title">
          What we <em>export.</em>
        </h2>
        <p className="carousel__count" aria-live="polite">
          <b>{pad(at + 1)}</b> / {pad(list.length)} · {cat.label}
        </p>
        <div className="carousel__nav">
          <button aria-label="Previous product" onClick={() => go(-1)} disabled={at === 0}>
            ←
          </button>
          <button aria-label="Next product" onClick={() => go(1)} disabled={at === list.length - 1}>
            →
          </button>
        </div>
      </div>
      <div className="carousel__stage">
        {list.map((p, i) => {
          const d = i - at
          const far = Math.abs(d) > 3
          const style = {
            transform: `translateX(${d * 62}%) translateZ(${-Math.abs(d) * 140}px) rotateY(${d * -18}deg) rotateZ(${d === 0 ? -2 : d * 1.5}deg)`,
            opacity: far ? 0 : 1 - Math.abs(d) * 0.18,
            zIndex: 100 - Math.abs(d),
          }
          return (
            <article
              key={p.name}
              className="carousel__card"
              style={style}
              aria-hidden={d !== 0}
              aria-roledescription="slide"
              aria-label={`${pad(i + 1)} of ${pad(list.length)}`}
              onClick={() => d !== 0 && setAt(i)}
            >
              <picture>
                <source type="image/avif" srcSet={productSrc(p.image, 'avif')} sizes="360px" />
                <img src={mediaUrl(`${p.image}_640.webp`)} srcSet={productSrc(p.image, 'webp')} sizes="360px" width={640} height={480} alt={p.name} loading="lazy" decoding="async" />
              </picture>
              <div>
                <h3>{p.name}</h3>
                <p>{p.latin ?? 'Raw fresh, chilled or frozen'}</p>
                {d === 0 && (
                  <p>
                    <a className="pcard__cta" href={`/quote#${new URLSearchParams({ category: path === 'pond' ? 'shrimps' : 'marine', species: p.name })}`}>
                      Request a quote →
                    </a>
                  </p>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
