// Markets from skylarkexim.com "Our Market Places" (docs/CONTENT.md), minus Bangkok: a city in Thailand, not a
// market (client decision, #194). The one source for the list, the count, the region grid and the globe markers.
export const ORIGIN = { name: 'Visakhapatnam', lat: 17.69, lon: 83.22 }

/** Client's region groups; "South Asia" added for Sri Lanka, which fits none of them. Display order of the grid. */
export const REGIONS = ['East Asia', 'Southeast Asia', 'South Asia', 'Middle East', 'Europe', 'Africa'] as const
export type Region = (typeof REGIONS)[number]

/** Site order. lat/lon are display-only globe markers (CONTENT.md table). */
export const MARKET_COORDS: { name: string; lat: number; lon: number; region: Region }[] = [
  { name: 'China', lat: 35.0, lon: 104.0, region: 'East Asia' },
  { name: 'Europe', lat: 50.0, lon: 10.0, region: 'Europe' },
  { name: 'Vietnam', lat: 16.0, lon: 106.0, region: 'Southeast Asia' },
  { name: 'UAE (Sharjah)', lat: 25.35, lon: 55.39, region: 'Middle East' },
  { name: 'Turkey', lat: 39.0, lon: 35.0, region: 'Europe' },
  { name: 'Thailand', lat: 15.0, lon: 101.0, region: 'Southeast Asia' },
  { name: 'Taiwan', lat: 23.7, lon: 121.0, region: 'East Asia' },
  { name: 'Sri Lanka', lat: 7.9, lon: 80.7, region: 'South Asia' },
  { name: 'Malaysia', lat: 4.2, lon: 102.0, region: 'Southeast Asia' },
  { name: 'Kuwait', lat: 29.3, lon: 47.5, region: 'Middle East' },
  { name: 'Japan', lat: 36.2, lon: 138.3, region: 'East Asia' },
  { name: 'Egypt', lat: 26.8, lon: 30.8, region: 'Africa' },
  { name: 'Algeria', lat: 28.0, lon: 2.6, region: 'Africa' },
  { name: 'Russia', lat: 56.0, lon: 38.0, region: 'Europe' },
  { name: 'Hong Kong', lat: 22.3, lon: 114.2, region: 'East Asia' },
]

export const MARKET_COUNT = MARKET_COORDS.length

/** Region → indices into MARKET_COORDS, in REGIONS order. */
export const MARKETS_BY_REGION = REGIONS.map((region) => ({
  region,
  markets: MARKET_COORDS.flatMap((m, i) => (m.region === region ? [i] : [])),
}))

/** The client's list has one regional entry, "Europe", beside the countries. Anywhere the names are listed it reads "Europe (region)", so it is never mistaken for a country. */
export const marketLabel = (name: string) => (name === 'Europe' ? 'Europe (region)' : name)
