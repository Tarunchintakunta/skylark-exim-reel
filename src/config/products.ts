import { mediaUrl } from '../film/media'
import { MARINE_FISH, SHRIMPS, STATES } from './content'

// docs/CONTENT.md "Products". No sizes, counts, MOQ or prices anywhere.
export type Category = 'marine' | 'shrimps'

export interface Product {
  name: string
  /** scientific name, only where CONTENT.md gives one ("Species offered") */
  latin?: string
  /** still id: `/media/<image>_{480,640,960}.{avif,webp}`, 1:1 (see PRODUCT_W) */
  image: string
}

/**
 * Product still widths. The largest is 960: the 4k originals are not in the repo or on the build machine (#hd), so there
 * is no 1280 / 1600 re-export; phones (76vw × 3 dpr ≈ 890 px) get the 960 too.
 */
export const PRODUCT_W = [480, 640, 960] as const
export const productSrc = (image: string, ext: 'avif' | 'webp', widths: readonly number[] = PRODUCT_W) =>
  widths.map((w) => `${mediaUrl(`${image}_${w}.${ext}`)} ${w}w`).join(', ')

const slug = (name: string) => 'prod-' + name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')

const LATIN: Record<string, string> = { Vannamei: 'Litopenaeus vannamei', 'Black Tiger Shrimp': 'Penaeus monodon' }

export const CATEGORIES: Record<Category, { label: string; products: Product[] }> = {
  marine: { label: 'Marine fish', products: MARINE_FISH.map((name) => ({ name, image: slug(name) })) },
  shrimps: { label: 'Shrimps', products: SHRIMPS.map((name) => ({ name, latin: LATIN[name], image: slug(name) })) },
}

export const SPECIES_OFFERED = 'Litopenaeus vannamei (Vannamei) & Penaeus monodon (Black Tiger)'

/** Full names only (confirm-list #11 fallback: no HOSO/HLSO/PUD abbreviations). */
export const SHRIMP_FORMS: { name: string; options: string }[] = [
  { name: 'Head-on Shell-on', options: 'Vannamei / Black Tiger' },
  { name: 'Headless Shell-on', options: 'Vannamei / Black Tiger' },
  { name: 'Peeled Undeveined', options: 'Vannamei' },
  { name: 'Peeled & Deveined', options: 'Tail on / Tail off' },
  { name: 'Pin Deveined', options: 'Tail on / Tail off' },
  { name: 'Easy Peel', options: 'Vannamei / Black Tiger' },
]

export { STATES }
