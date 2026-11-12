import * as m from 'motion/react-m'
import type { Variants } from 'motion/react'
import { STATES, productSrc, type Product } from '../config/products'
import { mediaUrl } from '../film/media'
import { DUR, EASE, LIFT, rise } from '../motion/tokens'

const MOBILE = '(max-width: 819px)'
/** card width: swipe row on phones, 3 columns to 1099 px, 4 or 5 above */
const SIZES = `${MOBILE} 76vw, (max-width: 1099px) 30vw, 22vw`
/** the grid's rise, plus a 4 px lift on hover (the soft shadow and the 1.03 image zoom are CSS, opacity and transform) */
const CARD: Variants = { ...rise, hover: { y: LIFT, transition: { duration: DUR.fast, ease: EASE } } }

/** One product: a 1:1 catalogue still, category label, name in the display serif, the scientific name where the site
 * gives one, the states it ships in, and an Enquire button. The first card loads eagerly. */
export function ProductCard({ product, label, index, onEnquire }: { product: Product; label: string; index: number; onEnquire: () => void }) {
  const first = index === 0
  return (
    <m.li className="pcard" variants={CARD} whileHover="hover">
      <span className="pcard__shadow" aria-hidden="true" />
      <picture className="pcard__media">
        <source type="image/avif" srcSet={productSrc(product.image, 'avif')} sizes={SIZES} />
        <img
          className="pcard__img"
          src={mediaUrl(`${product.image}_640.webp`)}
          srcSet={productSrc(product.image, 'webp')}
          sizes={SIZES}
          width={640}
          height={640}
          alt={`${product.name}, whole, on crushed ice`}
          loading={first ? 'eager' : 'lazy'}
          decoding="async"
        />
      </picture>
      <p className="pcard__meta">
        <span className="pcard__no">{String(index + 1).padStart(2, '0')}</span>
        {label}
      </p>
      <h3 className="pcard__name display">{product.name}</h3>
      {product.latin && <p className="pcard__latin">{product.latin}</p>}
      <ul className="pcard__tags" aria-label="Available as">
        {STATES.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <button type="button" className="pcard__cta" onClick={onEnquire} aria-label={`Enquire about ${product.name}`}>
        <u>Enquire</u> <span aria-hidden="true">→</span>
      </button>
    </m.li>
  )
}
