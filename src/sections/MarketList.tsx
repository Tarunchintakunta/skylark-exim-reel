import { MARKET_COORDS, MARKETS_BY_REGION, marketLabel } from '../config/markets'
import { globeUi } from '../three/globeState'
import './markets.css'

/** World caption: every market as real text, grouped by region; hover/focus highlights that route on the globe (PRD F8), a click turns the globe to it. */
export function MarketList() {
  const set = (i: number) => () => void (globeUi.highlight = i)
  return (
    <div className="markets" aria-label="Markets" role="group">
      {MARKETS_BY_REGION.map(({ region, markets }) => (
        <div className="markets__group" key={region} data-fade>
          <h3 className="markets__region mono">{region}</h3>
          <ul className="markets__list">
            {markets.map((i) => (
              <li key={i}>
                <button type="button" className="markets__item" onMouseEnter={set(i)} onMouseLeave={set(-1)} onFocus={set(i)} onBlur={set(-1)} onClick={() => void (globeUi.focus = globeUi.highlight = i)}>
                  {marketLabel(MARKET_COORDS[i].name)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
