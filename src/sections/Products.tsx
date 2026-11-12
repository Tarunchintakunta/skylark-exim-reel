import * as m from 'motion/react-m'
import { useEffect, useState } from 'react'
import { CATEGORIES, SHRIMP_FORMS, SPECIES_OFFERED, STATES, type Category } from '../config/products'
import { store, useApp } from '../engine/store'
import { reveal, rise, riseAlone } from '../motion/tokens'
import { ProductCard } from './ProductCard'
import './sections.css'
import './products.css'

const TABS: Category[] = ['marine', 'shrimps']
const LATIN = /(Litopenaeus vannamei|Penaeus monodon)/

/** Products (STORY §12): category follows the chosen path; every product card enquires straight into the RFQ. */
export function Products() {
  const path = useApp((s) => s.path)
  const [tab, setTab] = useState<Category>(path === 'pond' ? 'shrimps' : 'marine')

  useEffect(() => setTab(path === 'pond' ? 'shrimps' : 'marine'), [path])
  useEffect(() => store.setState({ prefill: { category: tab } }), [tab])

  const enquire = (category: Category, species: string) => {
    location.assign(`/quote#${new URLSearchParams({ category, species })}`)
  }
  const cat = CATEGORIES[tab]

  return (
    <section id="products" className="section theme-light pr" aria-labelledby="products-title">
      <m.header className="pr-head" {...reveal}>
        <div className="pr-head__copy">
          <m.p className="eyebrow mono" variants={rise}>Products</m.p>
          <m.h2 id="products-title" className="pr-title" variants={rise}>
            Our <em>Products</em>
          </m.h2>
          <m.ul className="pr-states display" aria-label="Product states" variants={rise}>
            {STATES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </m.ul>
        </div>
      </m.header>

      <div className="pr-switch" role="group" aria-label="Product category">
        {TABS.map((t) => (
          <button key={t} type="button" className="pr-switch__btn" aria-pressed={tab === t} aria-controls="pr-panel" onClick={() => setTab(t)}>
            {CATEGORIES[t].label}
            <span className="pr-switch__count" aria-hidden="true">{String(CATEGORIES[t].products.length).padStart(2, '0')}</span>
          </button>
        ))}
      </div>

      <div id="pr-panel" className="pr-panel">
        {/* keyed by tab: the other category's cards come in afresh */}
        <m.ul key={tab} className={`pr-grid pr-grid--${cat.products.length}`} aria-label={cat.label} {...reveal}>
          {cat.products.map((p, i) => (
            <ProductCard key={p.name} product={p} label={cat.label} index={i} onEnquire={() => enquire(tab, p.name)} />
          ))}
        </m.ul>

        {tab === 'shrimps' && (
          <div className="pr-forms">
            <m.div className="pr-forms__lede" {...riseAlone}>
              <h3 className="pr-forms__title display">Shrimp forms</h3>
              <p className="pr-forms__species">
                <span className="pr-label">Species offered</span>
                {SPECIES_OFFERED.split(LATIN).map((t, i) => (i % 2 ? <i key={i}>{t}</i> : t))}
              </p>
            </m.div>
            <m.dl className="pr-forms__index" {...reveal}>
              {SHRIMP_FORMS.map((f, i) => (
                <m.div key={f.name} className="pr-forms__row" variants={rise}>
                  <dt>
                    <span className="pr-forms__no">{String(i + 1).padStart(2, '0')}</span>
                    {f.name}
                  </dt>
                  <dd>{f.options}</dd>
                </m.div>
              ))}
            </m.dl>
          </div>
        )}
      </div>
    </section>
  )
}
