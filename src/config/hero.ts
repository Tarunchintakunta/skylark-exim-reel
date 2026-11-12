/** Phones held upright (env.mobile, portrait): the 810×1440 portrait crops (#hd). The same test in CSS media query form. */
export const PORTRAIT = '(orientation: portrait) and (max-width: 819px), (orientation: portrait) and (pointer: coarse)'
const OTHER = '(orientation: landscape), (min-width: 820px) and (pointer: fine)'

/**
 * The hero loop's first frame (#197, #hd): the LCP image. One list for the hero <picture> (home/HomeHero.tsx) and its
 * preloads (scripts/static-hero.ts), so the browser picks the same file for both. `url` versions a /media file.
 */
export const heroPoster = (url: (file: string) => string) =>
  (['avif', 'webp'] as const).flatMap((ext) => [
    { type: `image/${ext}`, media: PORTRAIT, srcSet: `${url(`hero-loop_m.${ext}`)} 810w` },
    { type: `image/${ext}`, media: OTHER, srcSet: [960, 1280, 1920, 2560].map((w) => `${url(`hero-loop_${w}.${ext}`)} ${w}w`).join(', ') },
  ])

/** The retired hero scroll sequence's frames per tier (#249): scripts/asset-audit.ts still audits the files. */
export const HERO_SEQ = { 1920: 60, m: 48 } as const
