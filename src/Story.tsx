import { useEffect, useLayoutEffect } from 'react'
import type { ChapterDef } from './config/chapters'
import { storyMounted } from './engine/boot'
import { Film } from './film/Film'
import { About } from './sections/About'
import { Close } from './sections/Close'
import { Contact } from './sections/Contact'
import { Products } from './sections/Products'
import { Trust } from './sections/Trust'
import { bindRise } from './sections/rise'

/** Everything below the hero (#207): its own chunk, fetched once the first screen has painted. */
export default function Story({ chapters }: { chapters: ChapterDef[] }) {
  useEffect(() => bindRise(document.getElementById('products')!), [])
  // Film's layout effect (setChapters) runs first, so the scroll layout is measured before this resolves
  useLayoutEffect(storyMounted, [])
  return (
    <>
      <Film chapters={chapters} />
      <Products />
      <Trust />
      <About />
      <Close />
      <Contact />
    </>
  )
}
