/** Calls `set(true)` once the page is 40 px down, `set(false)` above (#238): the top bar shrinks and blurs (CSS). */
export function bindScrolled(set: (scrolled: boolean) => void) {
  const on = () => set(scrollY > 40)
  on()
  addEventListener('scroll', on, { passive: true })
  return () => removeEventListener('scroll', on)
}
