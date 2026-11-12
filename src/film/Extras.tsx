import { DOC_CARDS, LABEL_FIELDS, start } from '../config/content'
import { setPath } from '../engine/path'
import { useApp } from '../engine/store'

/** Packing caption: the carton label's field names as a quiet hairline list. Field names only, never values (STORY §7). */
export function LabelCard() {
  return (
    <dl className="caption__fields" data-fade aria-label="Carton label fields">
      {LABEL_FIELDS.map((f) => (
        <div key={f}>
          <dt>{f}</dt>
          <dd aria-hidden="true" />
        </div>
      ))}
    </dl>
  )
}

/** Documentation interlude: what the paperwork covers, as text (no paper-card boxes). */
export function DocCards() {
  return (
    <ul className="caption__fields" aria-label="Export paperwork">
      {DOC_CARDS.map((c) => (
        <li key={c} data-fade>
          {c}
        </li>
      ))}
    </ul>
  )
}

/** End of a path's own chapters (#219): one quiet link over to the other story, before the shared ending. */
export function OtherPath() {
  const other = useApp((s) => (s.path === 'ocean' ? 'pond' : 'ocean'))
  return (
    <p className="caption__other" data-fade>
      <a
        href={`#${other}`}
        data-other-path={other}
        onClick={(e) => {
          e.preventDefault()
          setPath(other, true)
        }}
      >
        {start.other}: {start[other].sub} →
      </a>
    </p>
  )
}
