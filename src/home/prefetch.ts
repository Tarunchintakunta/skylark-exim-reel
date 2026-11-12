import { firstClip } from '../config/chapters'
import { decodeAll } from '../engine/boot'
import { env } from '../engine/env'
import { store, type Path } from '../engine/store'
import { CLIPS } from '../film/manifest'
import { avifReady, clipUrl, codecReady, isSeq, posterUrl } from '../film/segments'
import { earthBitmap } from '../three/globeState'
import type { Gate } from '../ui/Loader'
import { heroReady } from './HomeHero'

const hinted = new Set<string>()
function hint(rel: 'modulepreload' | 'prefetch', href: string, as?: string) {
  if (hinted.has(href)) return
  hinted.add(href)
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  if (as) link.as = as
  document.head.append(link)
}

let scripts: Promise<void> | null = null
/** /story's scripts: its entry and preloads (named in its HTML), then the lazy story chunk and its CSS (named in the entry). */
const storyScripts = () =>
  (scripts ??= fetch('/story')
    .then((r) => r.text())
    .then(async (html) => {
      const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]
      if (!entry) return
      for (const [, href] of html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)) hint('modulepreload', href)
      const boot = await fetch(entry).then((r) => r.text())
      hint('modulepreload', entry)
      // the entry is a bootstrap (#lcp, engine/first-screen.ts): the app chunk it imports names the lazy story chunk
      const app = boot.match(/assets\/story-app-[\w-]+\.js/)?.[0]
      if (app) hint('modulepreload', `/${app}`)
      const js = boot + (app ? await fetch(`/${app}`).then((r) => r.text()) : '')
      for (const [file] of js.matchAll(/assets\/Story-[\w-]+\.(?:js|css)/g)) {
        if (file.endsWith('.css')) hint('prefetch', `/${file}`, 'style')
        else hint('modulepreload', `/${file}`)
      }
    })
    .catch(() => void (scripts = null)))

/** The /story chunk and that path's first chapter (o1 / p1): its poster and clip, at the tier /story will ask for. */
export function prefetchStory(path: Path) {
  void storyScripts()
  const clip = firstClip(path)
  if (!clip) return
  // a frame-set clip draws its own frame 0 on the canvas: no poster, no video
  if (isSeq(clip.id)) return
  hint('prefetch', posterUrl(clip.id), 'image')
  hint('prefetch', clipUrl(clip.id), 'video')
}

/** Hover or keyboard focus on any story link (nav, hero fork, story cards) warms /story; nothing loads before that. */
export function bindStoryPrefetch() {
  const on = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="/story"]')
    if (a) prefetchStory(a.hash === '#pond' ? 'pond' : 'ocean')
  }
  document.addEventListener('pointerover', on, { passive: true })
  document.addEventListener('focusin', on)
  return () => {
    document.removeEventListener('pointerover', on)
    document.removeEventListener('focusin', on)
  }
}

/**
 * The homepage's gate (#preload): the intro counts real work from 0 % to 100 % and opens when the city video can play
 * through and the hero poster has decoded. The other page images and the globe texture continue in the background.
 * Nothing here waits on /story.
 */
export function homeGate(mounted: Promise<void>): Gate {
  let done = 0
  let total = 0
  const subs = new Set<() => void>()
  const tick = () => (done++, subs.forEach((f) => f()))
  let ready: Promise<void> | null = null
  return {
    progress: () => (total ? Math.min(1, done / total) : 0),
    onCache: (f) => (subs.add(f), () => void subs.delete(f)),
    ready: () =>
      (ready ??= mounted.then(async () => {
        const poster = document.querySelector<HTMLImageElement>('.home-hero picture img')
        const rest = [...document.querySelectorAll<HTMLImageElement>('main img')].filter((img) => img !== poster)
        total = 2
        subs.forEach((f) => f())
        const posterJob = poster ? decodeAll([poster], tick) : Promise.resolve().then(tick)
        await Promise.all([heroReady.then(tick), posterJob])
        void decodeAll(rest, () => {})
        void earthBitmap('home').catch(() => null)
      })),
  }
}

/** clips of the active path warmed from the homepage after the intro. Not the other path, and not the port frames. */
const STORY_LOOKAHEAD = 4

/**
 * The story, warmed from the homepage (#preload): once the intro has opened and the browser is idle, the first clips
 * of the active path are fetched at low priority, at the tier and codec /story will ask for. /media is immutable, so
 * /story's warm cache then reads them from the HTTP cache. The other path and the port frame sequence wait until the
 * visitor actually opens them. Save-Data and 2g/3g skip it.
 */
/** every story file warmStory fetches is in the HTTP cache: the homepage is warm. Tests (navigator.webdriver) and ?debug only. */
const markWarm = () => {
  if (navigator.webdriver || new URLSearchParams(location.search).has('debug')) (globalThis as { __homeWarm?: boolean }).__homeWarm = true
}

export function warmStory() {
  if (env.saveData || env.slow) return (markWarm(), () => {})
  const ctl = new AbortController()
  const go = async () => {
    await Promise.all([codecReady, avifReady])
    const urls = CLIPS[store.getState().path]
      .filter((c) => !isSeq(c.id))
      .slice(0, STORY_LOOKAHEAD)
      .map((c) => clipUrl(c.id))
    const one = (u: string) => fetch(u, { signal: ctl.signal, priority: 'low' } as RequestInit).then((r) => r.blob()).catch(() => null)
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (urls.length && !ctl.signal.aborted) await one(urls.shift()!)
    }))
    if (!ctl.signal.aborted) markWarm()
  }
  const start = () => ('requestIdleCallback' in window ? requestIdleCallback(() => void go(), { timeout: 3000 }) : setTimeout(go, 500))
  if (store.getState().revealed) start()
  const off = store.subscribe((s, was) => s.revealed && !was.revealed && start())
  return () => (off(), ctl.abort())
}
