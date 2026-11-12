/**
 * #lcp: a page's app is requested only once its static first screen (`[data-first-screen]`: the homepage's hero copy,
 * /story's opening caption) has painted. Lighthouse counts every request that finished before the LCP, so the app's script
 * stays out of it; the app's bytes still land right behind the first screen's, which they would only have shared the
 * link with. No imports: this is the whole entry chunk.
 */
export function afterFirstScreen(boot: () => unknown) {
  let done = false
  const go = () => !done && ((done = true), boot())
  // nothing static to wait for: boot at once
  if (!document.querySelector('[data-first-screen]')) return void go()
  if (PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
    // the entry arrives once the frame is on screen (a paint callback alone can run before it is presented)
    new PerformanceObserver((l, o) => {
      if (l.getEntries().some((e) => (e as PerformanceEntry & { element?: Element }).element?.closest('[data-first-screen]'))) {
        o.disconnect()
        setTimeout(go)
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    // a hidden tab reports no LCP, a broken image never paints: the CSS failsafe hands the intro over at 3 s too
    setTimeout(go, 3000)
    return
  }
  // no LCP API (Safari): the fonts and the first screen's image in, and one frame on screen
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }))
  void Promise.all([document.fonts.ready, loaded]).then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(go))))
  setTimeout(go, 3000)
}
