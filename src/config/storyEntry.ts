import type { Tier } from '../film/manifest'
import { MARKET_COORDS, MARKET_COUNT, MARKETS_BY_REGION, ORIGIN, marketLabel } from './markets'

/**
 * Story Entry (#268): the three bento cards after the homepage hero and the facts their expanded state floats in.
 * Every widget line comes from docs/CONTENT.md (`src` is its line there); no figure appears that the file does not state.
 */
export interface Widget {
  label: string
  value: string
  /** docs/CONTENT.md line */
  src: number
}

export interface EntryCard {
  id: 'wild' | 'farmed' | 'world'
  tag: string
  title: string
  cta: string
  /** expanded state */
  heading: string
  sub: string
  start: { label: string; href: string }
  /** the clip whose first frame is the card's still and whose loop plays on hover (public/media/<id>_*) */
  clip?: string
  /** the stills' own id when they are cut apart from the clip's posters (default: the clip's) */
  still?: string
  /** the clip's largest tier when it is a crop with less than 2560 native pixels: nothing larger is ever asked for */
  top?: Exclude<Tier, 'm'>
  alt: string
  widgets: Widget[]
}

const MARKET_LIST = MARKET_COORDS.map((m) => marketLabel(m.name))

export const ENTRY_CARDS: EntryCard[] = [
  {
    id: 'wild',
    tag: 'Story · Wild catch',
    title: 'Wild catch: from the sea to your table',
    cta: 'Enter the story',
    heading: 'Wild catch',
    sub: 'Marine fish from the fishing vessels, through our plant at Anandapuram, to the port.',
    start: { label: 'Enter the story', href: '/story#ocean' },
    // the CG film's own catch shot (chapter 02), so the card matches the story it opens
    clip: 'cg-catch',
    top: 1920,
    alt: 'At dawn on the open sea, a wooden trawler hauls its net of silver fish up the stern ramp.',
    widgets: [
      { label: 'Range', value: 'Marine fish', src: 53 },
      { label: 'Species', value: 'Indian Mackerel · Tuna · Seer Fish · Squid', src: 53 },
      { label: 'More species', value: 'Swordfish · Cuttlefish · Ribbon Fish · Leatherjacket', src: 53 },
      { label: 'States', value: 'Raw fresh · Chilled · Frozen', src: 67 },
      { label: 'Cold chain', value: 'Reefer containers to the destination', src: 47 },
      { label: 'Processed at', value: 'Anandapuram, Visakhapatnam', src: 35 },
    ],
  },
  {
    id: 'farmed',
    tag: 'Story · Farmed',
    title: 'Farmed shrimp',
    cta: 'Enter the story',
    heading: 'Farmed shrimp',
    sub: 'From partner farms, through our plant at Anandapuram, to the port.',
    start: { label: 'Enter the story', href: '/story#pond' },
    // the CG film's own pond-bank shot (chapter 02); its 1920 poster is 201 KB, under the card's 250 KB, so no card stills
    clip: 'cg-sample',
    alt: 'A grey water-testing meter case on a muddy pond bank, its probe cable in the water, an aerator churning behind and a refrigerated truck among the palms.',
    widgets: [
      { label: 'Species', value: 'Vannamei · Black Tiger', src: 55 },
      { label: 'Partners', value: 'Strategic partnerships with aquaculture farmers', src: 29 },
      { label: 'Forms', value: 'Head-on · Headless · Peeled · Value-added', src: 41 },
      { label: 'Freezing', value: 'IQF or block frozen', src: 44 },
      { label: 'Cold storage', value: '−18 °C to −20 °C until dispatch', src: 46 },
      { label: 'States', value: 'Raw fresh · Chilled · Frozen', src: 67 },
    ],
  },
  {
    id: 'world',
    tag: 'Markets',
    title: 'From Visakhapatnam to the world',
    cta: 'Get a quote',
    heading: `Trusted in ${MARKET_COUNT} markets`,
    sub: `Based in ${ORIGIN.name}. Shipping in reefer containers keeps the cold chain to the destination.`,
    start: { label: 'Get a quote', href: '/quote' },
    alt: `Thin orbit lines from ${ORIGIN.name} to ${MARKET_COUNT} markets.`,
    // one widget per region (client's groups, CONTENT.md line 74)
    widgets: MARKETS_BY_REGION.map(({ region, markets }) => ({
      label: region,
      value: markets.map((i) => MARKET_LIST[i]).join(' · '),
      src: 74,
    })),
  },
]
