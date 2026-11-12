import { COPY_RIGHT, type ChapterDef } from '../config/chapters'
import { MarketList } from '../sections/MarketList'
import { DocCards, LabelCard, OtherPath } from './Extras'
import './film.css'

/** Captions are real HTML inside each chapter section (indexable, read in order); captions.ts shows one at a time. */
export function ChapterCopy({ chapter }: { chapter: ChapterDef }) {
  const place = COPY_RIGHT.has(chapter.id) ? ' caption--right' : ''
  return (
    <>
      {chapter.media.map((m, i) => (
        <p className="sr-only" key={`alt${i}`}>{m.alt}</p>
      ))}
      {chapter.captions.map((c, i) => {
        const Title = i === 0 ? 'h2' : 'h3'
        return (
          // keyed by content, not index: after a path switch a chapter id (intake, process, coldchain) carries the
          // other path's copy, and SplitText.revert() in bindCaptions would write the old title back into a reused node (#210)
          <article className={`caption${place}${chapter.theme === 'light' ? ' caption--light' : ''}${c.extra === 'markets' ? ' caption--markets' : ''}`} key={`${i}:${c.title}`}>
            {c.eyebrow && <Eyebrow text={c.eyebrow} />}
            <Title className="caption__title display">{c.title}</Title>
            {c.body && <p className="caption__body" data-fade>{c.body}</p>}
            {c.note && <p className="caption__note mono" data-fade>{c.note}</p>}
            {c.extra === 'label-card' && <LabelCard />}
            {c.extra === 'doc-cards' && <DocCards />}
            {c.extra === 'markets' && <MarketList />}
            {c.extra === 'other-path' && <OtherPath />}
            {c.chips && (
              <p className="caption__list" data-fade>
                <span className="sr-only">Species: </span>
                {c.chips.join(' · ')}
              </p>
            )}
          </article>
        )
      })}
    </>
  )
}

/** "The Ocean · 01" → a small uppercase mono chapter label, number first: "01 · THE OCEAN" (the case is CSS, the text stays as written) */
function Eyebrow({ text }: { text: string }) {
  const m = text.match(/^(.*?)\s*·\s*(\d{2})$/)
  return (
    <p className="caption__eyebrow mono" data-fade>
      {m ? (
        <>
          <span className="caption__num">{m[2]}</span>
          <span aria-hidden="true">·</span>
          {m[1]}
        </>
      ) : (
        text
      )}
    </p>
  )
}
