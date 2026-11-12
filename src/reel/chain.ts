import type { Path } from '../engine/store.ts'
import { REEL } from './manifest.ts'

/**
 * The reel (/story): one continuous camera journey per path. Each clip starts on the exact last frame of the clip
 * before it (PROGRESS.md), so the frames of a path play as one sequence: a join is just the next frame.
 * Copy: docs/CONTENT.md lines, as in config/content.ts.
 */
export interface Stage {
  id: string
  /** rail and picker label */
  label: string
  /** headline: bold sans, then the italic serif accent */
  title: [string, string]
  /** story lines, faded in one after another like subtitles across the stage */
  lines: string[]
  clips: string[]
}

const SEA: Stage = {
  id: 'sea',
  label: 'At sea',
  title: ['It starts', 'at sea.'],
  lines: [
    'Based in Visakhapatnam, Andhra Pradesh.',
    'Raw material is sourced directly from fishing vessels.',
    'Transported under chilled conditions to the processing plant.',
  ],
  clips: ['cg-depart-1', 'r-o2', 'r-o3', 'r-o4'],
}

const POND: Stage = {
  id: 'pond',
  label: 'At the pond',
  title: ['It starts', 'at the pond.'],
  lines: [
    'Strategic partnerships with aquaculture farmers.',
    'Water quality is checked on the bank, pond by pond.',
    'Harvested onto crushed ice and trucked to the plant, chilled.',
  ],
  clips: ['cg-ponds', 'r-p2', 'cg-sample', 'r-p4', 'cg-harvest', 'r-p6'],
}

const SHARED: Stage[] = [
  {
    id: 'plant',
    label: 'The plant',
    title: ['Then it’s', 'processed.'],
    lines: [
      'Our processing unit at Anandapuram, Visakhapatnam.',
      'Washed, graded to export standards, frozen and packed.',
      'Stored at −18 °C to −20 °C until dispatch.',
    ],
    clips: ['cg-arrive', 'r-s2', 'r-s3', 'r-s4'],
  },
  {
    id: 'port',
    label: 'The port',
    title: ['Your container,', 'ready.'],
    lines: [
      'Shipped in reefer containers to keep the cold chain to the destination.',
      'Documents, certificates and tracking handled by our own staff.',
      'From Visakhapatnam to the world’s table.',
    ],
    clips: ['r-s5', 'cg-port', 'r-s7', 'cg-ship', 'r-s9', 'cg-sail'],
  },
]

export const stagesFor = (path: Path): Stage[] => [path === 'pond' ? POND : SEA, ...SHARED]

export interface Timeline {
  stages: Stage[]
  /** frame urls in play order, joins de-duplicated */
  frames: { clip: string; i: number }[]
  /** first frame index of each stage */
  starts: number[]
  /** first frame index of each clip, in play order */
  clipStarts: { clip: string; at: number; n: number }[]
}

/**
 * Frames of a path in play order. A clip's frame 0 is the previous clip's last frame (they are identical by
 * construction), so it is skipped: the join is one frame step like any other.
 */
export function timeline(path: Path): Timeline {
  const stages = stagesFor(path)
  const frames: Timeline['frames'] = []
  const starts: number[] = []
  const clipStarts: Timeline['clipStarts'] = []
  let first = true
  for (const s of stages) {
    starts.push(frames.length)
    for (const clip of s.clips) {
      const n = REEL[clip]?.frames ?? 0
      const skip = first ? 0 : 1
      clipStarts.push({ clip, at: frames.length, n: n - skip })
      for (let i = skip; i < n; i++) frames.push({ clip, i })
      if (n) first = false
    }
  }
  return { stages, frames, starts, clipStarts }
}
