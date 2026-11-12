import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { PageTransition } from './PageTransition'
import { DUR, EASE } from './tokens'

const features = () => import('./features').then((m) => m.default)

/** Every page renders inside this: `m.` components only (strict), reduced motion follows the OS setting, pages crossfade. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DUR.base, ease: EASE }}>
        <PageTransition>{children}</PageTransition>
      </MotionConfig>
    </LazyMotion>
  )
}
