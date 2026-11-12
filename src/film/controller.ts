import type { ChapterDef } from '../config/chapters'
import { env } from '../engine/env'
import { frame, store } from '../engine/store'
import { onTick } from '../engine/ticker'
import { bindCaptions, updateCaptions } from './captions'

/**
 * Film controller: maps the scroll position onto (chapter index, local progress).
 * Layout is read only in measure() (mount, resize, path switch, reveal), never in the tick.
 */
let stopReveal: (() => void) | null = null
let storyObserver: ResizeObserver | null = null
let chapters: ChapterDef[] = []
let els: HTMLElement[] = []
let tops: number[] = []
let lens: number[] = []
let vh = innerHeight
/** scroll position where the film has fully left the screen */
let filmEnd = Infinity

export const film = {
  get chapters() { return chapters },
  top: (i: number) => tops[i] ?? 0,
  get end() { return filmEnd },
}

/** Drop the reveal subscription and the #story observer. Chapter data stays until the next setChapters. */
export function unbindChapters() {
  stopReveal?.()
  stopReveal = null
  storyObserver?.disconnect()
  storyObserver = null
}

/** Opening caption and frame 0, only while the page is still on the first chapter. */
function showOpening(list: ChapterDef[]) {
  measure()
  if (window.scrollY > 1 || frame.index > 0 || !list[0]) return
  updateCaptions(list[0], 0, 0, true)
}

export function setChapters(list: ChapterDef[], elements: HTMLElement[]) {
  chapters = list
  els = elements
  measure()
  bindCaptions(els, list)
  frame.index = -1
  // frame 0, before the first scroll tick: the opening caption is on screen as the page lands
  if (list[0]) updateCaptions(list[0], 0, 0)
  if (!env.reduced) {
    // bindCaptions queues the line split on fonts.ready first; this runs after it and replays the entrance
    document.fonts.ready.then(() => {
      if (frame.scroll > 1 || frame.index > 0 || !list[0]) return
      measure()
      updateCaptions(list[0], 0, 0, true)
    })
  }
  unbindChapters()
  const story = document.getElementById('story')
  if (story) {
    storyObserver = new ResizeObserver(() => measure())
    storyObserver.observe(story)
  }
  // tops are taken before the loader sets ready and again before it reveals; both change the page height
  stopReveal = store.subscribe((st, was) => {
    if ((st.ready && !was.ready) || (st.revealed && !was.revealed)) showOpening(list)
  })
  if (store.getState().ready || store.getState().revealed) showOpening(list)
}

export function measure() {
  if (!els.length) return
  vh = innerHeight
  const y = window.scrollY
  tops = els.map((el) => el.getBoundingClientRect().top + y)
  const heights = els.map((el) => el.offsetHeight)
  // the last chapter (globe) finishes one viewport early so the next section can slide over it
  lens = heights.map((h, i) => (i === heights.length - 1 ? Math.max(1, h - vh) : h))
  filmEnd = tops[tops.length - 1] + heights[heights.length - 1]
}

let rt = 0
addEventListener('resize', () => {
  clearTimeout(rt)
  rt = window.setTimeout(measure, env.coarse ? 300 : 120)
})

onTick(() => {
  const n = tops.length
  if (!n) return
  const y = frame.scroll
  let i = Math.max(frame.index, 0)
  while (i < n - 1 && y >= tops[i + 1]) i++
  while (i > 0 && y < tops[i]) i--
  frame.local = Math.min(1, Math.max(0, (y - tops[i]) / lens[i]))
  const past = y >= filmEnd
  if (past !== frame.past) store.setState({ past })
  frame.past = past
  if (i !== frame.index) {
    frame.index = i
    store.setState({ chapter: chapters[i].id })
  }
  updateCaptions(chapters[i], i, frame.local)
}, -10)
