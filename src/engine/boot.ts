/** Resolves when the page's own content has mounted: the lazy story chunk on /story, the sections on the homepage. */
export let storyMounted = () => {}
export const storyReady = new Promise<void>((r) => (storyMounted = r))

/**
 * Every image switched to eager and decoded (the gated intros, #preload); `each` runs as each one lands. A broken image
 * counts as landed: it never holds an intro.
 */
export const decodeAll = (imgs: HTMLImageElement[], each: () => void) =>
  Promise.all(imgs.map((i) => ((i.loading = 'eager'), i.decode().catch(() => {}).then(each)))).then(() => {})
