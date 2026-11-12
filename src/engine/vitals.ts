/**
 * Vercel Speed Insights and Web Analytics (#235), loaded once the page has painted and gone idle so neither touches
 * LCP. Only on a deployed host: the /_vercel/* scripts don't exist on a local preview and would log 404s.
 */
export function loadVitals() {
  if (!import.meta.env.PROD || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return
  const go = () =>
    void Promise.all([import('@vercel/analytics'), import('@vercel/speed-insights')]).then(([a, s]) => {
      a.inject({ framework: 'vite' })
      s.injectSpeedInsights({ framework: 'vite' })
    })
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500))
  if (document.readyState === 'complete') idle()
  else addEventListener('load', idle, { once: true })
}
