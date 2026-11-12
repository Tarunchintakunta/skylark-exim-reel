import { Mark } from './Mark'

/** Short close for /quote and /news. The homepage keeps the full contact band. */
export function PageFooter() {
  return (
    <footer className="doc-foot">
      <Mark size={56} lazy />
      <span>© {new Date().getFullYear()} Skylark Exim</span>
      <span>Visakhapatnam, Andhra Pradesh</span>
      <a href="/#contact">Contact</a>
    </footer>
  )
}
