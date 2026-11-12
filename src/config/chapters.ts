import { film, type CaptionCopy } from './content.ts'
import { MARKET_COUNT } from './markets.ts'

/**
 * Visual source of one segment. A chapter's scroll length is split evenly across its segments, unless a still or a video sets `span`.
 * - video: public/media/<id>_{m,960,1280,1920}{.av1,.hevc,}.mp4 + <id>_{m,960,1280,1920}.{avif,webp} first-frame posters
 *   + <id>_end_1280.{avif,webp} (scripts/encode-hf.sh)
 * - still: a clip's first frame (every clip tier), or a ph-* stand-in at m / 960 / 1280 / 1920 / 2560, until the scene's clip lands (no label is ever shown; open stand-ins are listed in PR bodies)
 * - gradient: deep-blue stand-in
 * - dom: documentation interlude over a pre-blurred still
 * - globe: the R3F globe
 */
export type Media =
  | { kind: 'video'; id: string; alt: string; /** share of the clip the scroll may show (0–1): holds a push-in before it crops the subject */ until?: number; /** share of the clip where scroll starts, when the head no longer matches the frame held before it */ from?: number; /** share of the chapter's scroll when this clip is not the last one */ span?: number; /** desktop reframe: the picture scaled by `scale` about `x` (0 left – 1 right), to keep a figure cut by the frame edge off screen */ zoom?: { scale: number; x: number } }
  | { kind: 'still'; poster: string; alt: string; /** share of the chapter's scroll, 0–1 (e.g. to end with its caption) */ span?: number }
  | { kind: 'gradient'; alt: string }
  | { kind: 'dom'; poster: string; alt: string }
  | { kind: 'globe'; alt: string }

export type Join = 'shared-frame' | 'crossfade' | 'cut'

export interface Caption extends CaptionCopy {
  at: [number, number]
  /** DOM extra shown with the caption */
  extra?: 'label-card' | 'doc-cards' | 'markets' | 'other-path'
}

export interface ChapterDef {
  id: string
  path: 'ocean' | 'pond' | 'shared'
  /** accessible chapter name */
  label: string
  /** desktop scroll length in vh (mobile uses 0.8×); about 65–75 per clip (#story-direct: 25–35 % shorter, the frames under the scroll load first, warmcache.ts), at least 75 per caption so each one stays readable */
  vh: number
  media: Media[]
  captions: Caption[]
  /** how this chapter hands off to the next one */
  joinNext: Join
  /** copy colour scheme; the globe opens into daylight */
  theme?: 'light'
  /** 'soft': a neutral black scrim (bottom, and the side the copy is on) instead of the deep-sea one, for daylight footage and bright interiors (the port and the plant) */
  /** 'cg': CG chapters, a light shade behind the caption block only, so the darker CG picture stays visible */
  scrim?: 'soft' | 'cg'
}

/**
 * Phone portrait clips (<id>_m, 810×1440) are a fixed crop of the 2560×1440 master: where the crop's centre sits, as a share
 * of the master's width (0.158–0.842). Picked from first/middle/last frames so the subject stays in frame for the whole
 * clip (contact sheet in the HD PR). Read by scripts/encode-hf.sh; a missing id is centred.
 */
export const CROP_X: Record<string, number> = {
  'hero-loop': 0.5, opening: 0.5,
  'cg-depart-1': 0.55, 'cg-depart-2': 0.6, 'cg-depart-3': 0.55, 'cg-catch': 0.5,
  'hf-depart': 0.68, 'hf-catch': 0.55, 'hf-ice': 0.45, 'cg-ice': 0.5, 'hf-return': 0.55, 'cg-return': 0.5,
  'hf-ponds': 0.5, 'cg-ponds': 0.5, 'hf-sample': 0.42, 'cg-sample': 0.35, 'hf-harvest': 0.45, 'cg-harvest': 0.4, 'hf-sort': 0.5,
  'hf-arrive': 0.42, 'hf-reverse': 0.62, 'cg-arrive': 0.6, 'hf-unload-fish': 0.53, 'hf-unload-crew': 0.45, 'hf-unload-shrimp': 0.45, 'hf-intake': 0.3, 'hf-fish-intake': 0.45,
  'hf-wash': 0.45, 'hf-peel': 0.72, 'hf-fish-wash': 0.6, 'hf-fish-cut': 0.4,
  'hf-lab': 0.4, 'hf-iqf': 0.4, 'hf-pack': 0.45, 'hf-store': 0.6, 'hf-fish-freeze': 0.725,
  'hf-ship': 0.5, 'cg-ship': 0.5, 'hf-sail': 0.57, 'cg-sail': 0.5,
  'cg-port': 0.42, 'hf-port-1': 0.42, 'hf-port-2': 0.35, 'hf-port-3': 0.3, 'hf-port-4': 0.45, 'hf-port-5': 0.5,
}

/** Chapters whose copy sits in a right-hand column instead of bottom-left, for editorial rhythm (redesign §6). */
export const COPY_RIGHT = new Set(['p1', 'process', 'port'])

/**
 * Clips a desktop plays as a frame sequence on the stage canvas instead of a <video> (src/film/sequence.ts, the Terminal
 * Industries pattern): the CG shots, so a scroll never waits for a video seek and a fast camera move never macroblocks.
 * Each set is evenly spaced master frames as 1920 WebP stills, q 55-70 KB a frame (scripts/clip-frames.sh). The live
 * plant clips play as 1920/2560 video from the regraded masters (PR #324, 12 Nov: their fine texture is 250-320 KB a WebP
 * frame at 1920; static cameras compress ~10x better as video). Phones keep the video.
 */
export const SEQ_CLIPS = ['cg-depart-1', 'cg-depart-2', 'cg-depart-3', 'cg-catch', 'cg-ice', 'cg-return', 'cg-ponds', 'cg-sample', 'cg-harvest',
  'cg-arrive', 'cg-port', 'cg-ship', 'cg-sail']

const caps = (id: string, ranges: [number, number][]): Caption[] => film[id].map((c, i) => ({ ...c, at: ranges[i] }))

const OCEAN_ONLY: ChapterDef[] = [
  {
    id: 'o1', path: 'ocean', label: 'Setting out', vh: 280, joinNext: 'crossfade', scrim: 'cg',
    // CG hero test (STYLE.md): three chained shots, each one's first frame the last frame of the one before (scripts/cg-grade.sh)
    media: [
      { kind: 'video', id: 'cg-depart-1', alt: 'Before dawn, a white and blue fishing boat lies at a stone quay, its mast lamp and wheelhouse windows glowing amber; the camera glides in.' },
      { kind: 'video', id: 'cg-depart-2', alt: 'The fishing boat motors away from the quay into calm dark water as a thin amber line of first light appears on the horizon.' },
      { kind: 'video', id: 'cg-depart-3', alt: 'The camera follows the fishing boat out toward the open sea and the brightening amber horizon.' },
    ],
    captions: caps('o1', [[0, 0.98]]),
  },
  {
    id: 'o2', path: 'ocean', label: 'The catch', vh: 100, joinNext: 'crossfade', scrim: 'cg',
    media: [{ kind: 'video', id: 'cg-catch', alt: 'The camera comes down behind the trawler at sunrise as its stern gantry winches the full trawl net, packed with silver fish, up out of the sea and onto the stern ramp, two crew in orange oilskins standing clear.' }],
    captions: caps('o2', [[0.02, 0.98]]),
  },
  {
    id: 'o3', path: 'ocean', label: 'On ice', vh: 75, joinNext: 'crossfade', scrim: 'cg',
    media: [{ kind: 'video', id: 'cg-ice', alt: 'On the wet aft deck of the trawler at sunrise, two crew in orange oilskins lay silver fish into rows of steel crates and shovel crushed ice over them.' }],
    captions: caps('o3', [[0.02, 0.98]]),
  },
  {
    id: 'o4', path: 'ocean', label: 'Back to Vizag', vh: 110, joinNext: 'crossfade', scrim: 'cg',
    media: [{ kind: 'video', id: 'cg-return', alt: 'The camera rises off the deck and pulls back above the trawler as it steams home with its crates of iced fish toward a hazy headland, a harbour breakwater and port cranes.' }],
    captions: caps('o4', [[0.02, 0.98]]),
  },
]

const POND_ONLY: ChapterDef[] = [
  {
    id: 'p1', path: 'pond', label: 'The ponds', vh: 85, joinNext: 'crossfade', scrim: 'cg',
    media: [{ kind: 'video', id: 'cg-ponds', alt: 'Aerial view at sunrise over a grid of coastal shrimp ponds lined with coconut palms, paddle-wheel aerators throwing white water, a white refrigerated truck parked on a bund road.' }],
    captions: caps('p1', [[0, 0.98]]),
  },
  {
    id: 'p2', path: 'pond', label: 'Traceable', vh: 75, joinNext: 'crossfade', scrim: 'cg',
    media: [{ kind: 'video', id: 'cg-sample', alt: 'Low over a muddy pond bank on a hazy morning, the camera glides toward a grey water-testing meter case whose probe cable runs into the pond; an aerator churns the water and a white refrigerated truck waits on the bund road among coconut palms.' }],
    captions: caps('p2', [[0.02, 0.98]]),
  },
  {
    id: 'p3', path: 'pond', label: 'Harvest', vh: 130, joinNext: 'crossfade',
    media: [
      { kind: 'video', id: 'cg-harvest', alt: 'On a pond bund on a hazy morning, the camera glides past a row of crates of fresh shrimp on crushed ice; a green drag net hangs over a crate, draining water into the mud, an aerator sprays behind and a refrigerated truck waits among coconut palms.' },
      { kind: 'video', id: 'hf-sort', alt: 'On the pond bank, workers tip live shrimp onto crushed ice in steel and white crates beside the refrigerated truck.' },
    ],
    captions: caps('p3', [[0.02, 0.98]]),
  },
]

/** The farmed path's plant: the shrimp footage and the full work flow (CONTENT.md, written for shrimp). */
const PLANT_POND: ChapterDef[] = [
  {
    id: 'intake', path: 'pond', label: 'Intake', vh: 260, joinNext: 'crossfade', scrim: 'soft',
    media: [
      { kind: 'video', id: 'cg-arrive', alt: 'On a hazy morning a white refrigerated truck drives slowly across the wet concrete yard toward the loading bays of the seafood plant, coconut palms along the yard, the camera following low behind it.' },
      { kind: 'video', id: 'hf-unload-shrimp', alt: 'At the dock, two workers in white coats, hairnets and gloves lift a steel crate of seafood on ice out of the open truck, stacked with steel crates, onto a steel trolley.' },
      { kind: 'video', id: 'hf-intake', alt: 'Inside the receiving bay, a masked worker in a white coat carries a steel crate of shrimp on ice toward the steel trolleys beside the truck, while a second worker walks back to the dock door.' },
    ],
    captions: caps('intake', [[0.02, 0.98]]),
  },
  {
    id: 'process', path: 'pond', label: 'Process', vh: 170, joinNext: 'crossfade', scrim: 'soft',
    media: [
      { kind: 'video', id: 'hf-wash', alt: 'A bright processing hall mid-shift: shrimp ride a conveyor while workers in caps, masks and gloves grade them at the stainless tables beside it.' },
      { kind: 'video', id: 'hf-peel', alt: 'Workers peel and devein shrimp by hand at a stainless table.' },
    ],
    // washing and grading over the wash clip, "Made to order" over the peeling: hf-peel is the peeling alone (it used to
    // glide on into the quality lab, so "Made to order" sat over the lab); the lab clip opens the next chapter with its
    // own caption
    captions: caps('process', [[0.02, 0.25], [0.25, 0.5], [0.5, 0.98]]),
  },
  {
    id: 'coldchain', path: 'pond', label: 'Lab · freeze · pack', vh: 260, joinNext: 'crossfade', scrim: 'cg',
    // one shot per caption: lab, IQF, packing, cold store (each a quarter of the scroll). Ranges sit on the clip
    // boundaries, so no shot is ever on screen without its caption (#313); captions.ts cuts an outgoing caption the moment
    // its clip leaves, so it never stays over the next shot
    media: [
      { kind: 'video', id: 'hf-lab', alt: 'In the quality lab, a technician in a white coat inspects a raw shrimp with tweezers at the window bench.' },
      { kind: 'video', id: 'hf-iqf', alt: 'Individually spaced shrimp ride a stainless mesh belt into the IQF freezing tunnel through light cold vapour.' },
      { kind: 'video', id: 'hf-pack', alt: 'A packer in a white coverall places a bag of frozen shrimp into a plain brown carton and closes it.' },
      { kind: 'video', id: 'hf-store', alt: 'In the cold store, workers in insulated jackets, hoods and masks walk down an aisle between racks of frosted cartons on wooden pallets; one pulls a pallet jack with a wrapped pallet of cartons.' },
    ],
    captions: caps('coldchain', [[0.02, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]).map((c, i) => (i === 2 ? { ...c, extra: 'label-card' as const } : i === 3 ? { ...c, extra: 'other-path' as const } : c)),
  },
]

/** The wild-catch path's plant (#219): whole fish and tuna loins through the same plant, never a shrimp on screen or in the copy. */
const PLANT_OCEAN: ChapterDef[] = [
  {
    id: 'intake', path: 'ocean', label: 'Intake', vh: 340, joinNext: 'crossfade', scrim: 'soft',
    media: [
      { kind: 'video', id: 'cg-arrive', alt: 'On a hazy morning a white refrigerated truck drives slowly across the wet concrete yard toward the loading bays of the seafood plant, coconut palms along the yard, the camera following low behind it.' },
      { kind: 'video', id: 'hf-unload-fish', alt: 'A refrigerated truck stands backed into the dock seal with its rear doors open: three open steel crates of whole fish and tuna on crushed ice, with empty steel trolleys waiting on either side.' },
      { kind: 'video', id: 'hf-unload-crew', alt: 'Two workers in white coats, hairnets and gloves lift a steel crate of whole fish on ice out of the open truck together and set it on a steel trolley at the dock.' },
      { kind: 'video', id: 'hf-fish-intake', alt: 'At the receiving bay, steel trays of whole tuna, seer fish and Indian mackerel on ice; one worker opens a tuna\'s gill cover to check the gills while another inspects a second tuna.' },
    ],
    captions: caps('intake.ocean', [[0.02, 0.98]]),
  },
  {
    id: 'process', path: 'ocean', label: 'Washing and portioning', vh: 130, joinNext: 'crossfade', scrim: 'soft',
    media: [
      { kind: 'video', id: 'hf-fish-wash', alt: 'Whole seer fish and Indian mackerel are rinsed under chilled water on a stainless table and sorted by size into steel crates.' },
      { kind: 'video', id: 'hf-fish-cut', alt: 'A worker portions a deep-red tuna loin on a white board; finished loins lie on crushed ice beside it.' },
    ],
    captions: caps('process.ocean', [[0.02, 0.5], [0.5, 0.98]]),
  },
  {
    // the cold store gets 75 vh of scroll (675 px at 900 high, its span 0.5 of 150); the freezer push-in crops the front
    // worker's face in its last third, so its scroll stops at 0.6 of the clip
    id: 'coldchain', path: 'ocean', label: 'Freeze and store', vh: 150, joinNext: 'crossfade', scrim: 'cg',
    media: [
      { kind: 'video', id: 'hf-fish-freeze', until: 0.6, span: 0.5, alt: 'A worker in a white coat wheels a steel rack of whole fish and tuna loins into the blast freezer as cold vapour rolls out of the open door.' },
      { kind: 'video', id: 'hf-store', alt: 'In the cold store, workers in insulated jackets, hoods and masks walk down an aisle between racks of frosted cartons on wooden pallets; one pulls a pallet jack with a wrapped pallet of cartons.' },
    ],
    // one caption per shot, on the clip boundary (#313; captions.ts cuts the outgoing one as its clip leaves)
    captions: caps('coldchain.ocean', [[0.02, 0.5], [0.5, 1]]).map((c, i) => (i === 1 ? { ...c, extra: 'other-path' as const } : c)),
  },
]

/** The shared ending, identical on both paths: documents, the port, the ship out to sea, the markets. */
const ENDING: ChapterDef[] = [
  {
    id: 'docs', path: 'shared', label: 'Documentation', vh: 75, joinNext: 'cut',
    media: [{ kind: 'dom', poster: 'ph-docs', alt: 'An export office desk in daylight: shipment folders, a binder of certificates and a laptop with a tracking map. Three cards: export documents, compliance, shipment tracking.' }],
    // up for the whole chapter (#313); the chapter change cuts it, so "Paperwork, done properly" is never over the port
    captions: caps('docs', [[0.02, 0.98]]).map((c) => ({ ...c, extra: 'doc-cards' as const })),
  },
  {
    id: 'port', path: 'shared', label: 'The port', vh: 200, joinNext: 'crossfade', scrim: 'soft',
    media: [
      { kind: 'video', id: 'cg-port', alt: 'On the quay in the morning haze, a plain white 40-foot refrigerated container waits on an Indian truck under the ship-to-shore cranes beside the moored container ship; the camera eases slowly in.' },
    ],
    captions: caps('port', [[0.02, 0.98]]),
  },
  {
    id: 'sea', path: 'shared', label: 'At sea', vh: 200, joinNext: 'crossfade',
    media: [
      { kind: 'video', id: 'cg-ship', alt: 'From the water off the port, the loaded container ship steams away toward the open sea, growing smaller against the hazy cranes on the shore.' },
      { kind: 'video', id: 'cg-sail', alt: 'High above the open sea, the loaded container ship sails on alone under a hazy sky, its long white wake trailing back toward the horizon.' },
    ],
    captions: caps('sea', [[0.02, 0.98]]),
  },
  {
    id: 'world', path: 'shared', label: 'The world', vh: 180, joinNext: 'cut', theme: 'light',
    media: [{ kind: 'globe', alt: `A bright daytime globe with gold routes from Visakhapatnam to ${MARKET_COUNT} markets.` }],
    captions: caps('world', [[0.08, 1.01]]).map((c) => ({ ...c, body: undefined, extra: 'markets' as const })),
  },
]

const sharedFor = (path: 'ocean' | 'pond') => [...(path === 'pond' ? PLANT_POND : PLANT_OCEAN), ...ENDING]

/**
 * Two separate stories (#219): each origin, then its own plant, then the shared ending. No chapter of one path renders on
 * the other. The city view is the homepage's hero only: /story opens straight on o1 / p1 at y = 0, so nothing sits above
 * the story to scroll back up to.
 */
export const OCEAN: ChapterDef[] = [...OCEAN_ONLY, ...sharedFor('ocean')]
export const POND: ChapterDef[] = [...POND_ONLY, ...sharedFor('pond')]
export const chaptersFor = (path: 'ocean' | 'pond') => (path === 'pond' ? POND : OCEAN)

/** A path's first clip (o1 / p1): what /story's loader waits for, and what the homepage prefetches. */
export function firstClip(path: 'ocean' | 'pond') {
  const m = chaptersFor(path).flatMap((ch) => ch.media).find((m) => m.kind === 'video')
  return m?.kind === 'video' ? m : null
}
