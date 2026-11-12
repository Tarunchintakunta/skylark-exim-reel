import { useEffect } from 'react'
import { resizeScroll } from '../engine/ticker'
import { About } from '../sections/About'
import { Close } from '../sections/Close'
import { Contact } from '../sections/Contact'
import { Trust } from '../sections/Trust'
import { Carousel } from './Carousel'

/** below the reel: products (tilted carousel), trust, about, the close and contact, as on v3 */
export default function Sections() {
  useEffect(resizeScroll, [])
  return (
    <div className="reel-after">
      <Carousel />
      <Trust />
      <About />
      <Close />
      <Contact />
    </div>
  )
}
