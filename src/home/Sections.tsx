import { useEffect, useLayoutEffect } from 'react'
import { store } from '../engine/store'
import { Close } from '../sections/Close'
import { Contact } from '../sections/Contact'
import { Products } from '../sections/Products'
import { Trust } from '../sections/Trust'
import { Company } from './Company'
import { Intro } from './Intro'
import { Markets } from './Markets'
import { Plant } from './Plant'
import { StoryEntry } from './StoryEntry'
import './home.css'

/** /#products and the other section anchors (from the nav on other pages) land once the loader has handed over. */
function landOnHash() {
  const go = () => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
  if (!location.hash) return
  if (store.getState().ready) return go()
  return store.subscribe((s, prev) => s.ready && !prev.ready && go())
}

/** The homepage below the hero (#233), in order: the story entry (#268), intro and the two stories, products, markets, the plant and quality, about and news, the close. */
export default function Sections({ onMount }: { onMount: () => void }) {
  useLayoutEffect(onMount, [onMount])
  useEffect(landOnHash, [])
  return (
    <>
      <StoryEntry />
      <Intro />
      <Products />
      <Markets />
      <Plant />
      <Trust />
      <Company />
      <Close />
      <Contact />
    </>
  )
}
