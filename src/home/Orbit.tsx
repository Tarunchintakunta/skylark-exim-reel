import type { CSSProperties } from 'react'
import { MARKET_COORDS, ORIGIN } from '../config/markets'

/**
 * The world card's thin-line globe (#268): an orthographic sphere turned to face the markets, its graticule, and an arc
 * from Visakhapatnam to every market in config/markets.ts. Plain SVG, so the card costs no three.js and no image.
 */
const R = 100
const LON0 = 70
const LAT0 = 28
const rad = Math.PI / 180
const [s0, c0] = [Math.sin(LAT0 * rad), Math.cos(LAT0 * rad)]

/** [x, y, visible] on the sphere's face */
function project(lat: number, lon: number): [number, number, boolean] {
  const [p, l] = [lat * rad, (lon - LON0) * rad]
  const x = R * Math.cos(p) * Math.sin(l)
  const y = -R * (c0 * Math.sin(p) - s0 * Math.cos(p) * Math.cos(l))
  return [x, y, s0 * Math.sin(p) + c0 * Math.cos(p) * Math.cos(l) > 0]
}

/** one graticule line as a path, broken where it turns behind the sphere */
function line(pts: [number, number][]) {
  let d = ''
  let pen = false
  for (const [lat, lon] of pts) {
    const [x, y, v] = project(lat, lon)
    if (v) d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    pen = v
  }
  return d
}
const range = (a: number, b: number, step: number) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step)
const GRATICULE = [
  ...range(-180, 150, 30).map((lon) => line(range(-90, 90, 5).map((lat) => [lat, lon]))),
  ...range(-60, 60, 30).map((lat) => line(range(-180, 180, 5).map((lon) => [lat, lon]))),
]

const [ox, oy] = project(ORIGIN.lat, ORIGIN.lon)
const MARKERS = MARKET_COORDS.map((m) => {
  const [x, y] = project(m.lat, m.lon)
  // the arc bows away from the sphere's centre, more for the far markets
  const lift = 1 + Math.hypot(x - ox, y - oy) / (R * 2.2)
  const [cx, cy] = [((ox + x) / 2) * lift, ((oy + y) / 2) * lift]
  return { name: m.name, x, y, arc: `M${ox.toFixed(1)} ${oy.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}` }
})

export function Orbit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-130 -130 260 260" fill="none" aria-hidden="true">
      <circle r={R} className="orbit__rim" />
      <ellipse rx={R * 1.22} ry={R * 0.34} transform="rotate(-18)" className="orbit__ring" />
      <ellipse rx={R * 1.12} ry={R * 0.5} transform="rotate(24)" className="orbit__ring" />
      {GRATICULE.map((d, i) => d && <path key={i} d={d} className="orbit__grid" />)}
      {MARKERS.map((m, i) => (
        <path key={m.name} d={m.arc} pathLength={1} className="orbit__arc" style={{ '--i': i } as CSSProperties} />
      ))}
      {MARKERS.map((m) => (
        <circle key={m.name} cx={m.x} cy={m.y} r={1.6} className="orbit__dot" />
      ))}
      <circle cx={ox} cy={oy} r={3} className="orbit__origin" />
      <circle cx={ox} cy={oy} r={7} className="orbit__pulse" />
      <text x={ox} y={oy + 15} textAnchor="middle" className="orbit__label">
        {ORIGIN.name}
      </text>
    </svg>
  )
}
