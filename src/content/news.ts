import raw from './news.json'

export interface NewsPost {
  slug: string
  date: string
  title: string
  summary: string
  image: string
  /** widths the image is also exported at, as `<image name>_<w>.webp` next to it (NEWS.md): a DPR-aware srcset */
  widths?: number[]
  body?: string
  source: string
}

function isPost(value: unknown): value is NewsPost {
  if (!value || typeof value !== 'object') return false
  const post = value as Record<string, unknown>
  return (
    typeof post.slug === 'string' &&
    typeof post.date === 'string' &&
    typeof post.title === 'string' &&
    typeof post.summary === 'string' &&
    typeof post.image === 'string' &&
    typeof post.source === 'string' &&
    (post.body === undefined || typeof post.body === 'string') &&
    (post.widths === undefined || (Array.isArray(post.widths) && post.widths.every((w) => Number.isInteger(w))))
  )
}

/** `srcset` for a post's image from its `widths` (undefined without them) */
export const newsSrcSet = (post: NewsPost) => post.widths?.map((w) => `${post.image.replace(/\.webp$/, '')}_${w}.webp ${w}w`).join(', ')

/** Posts from src/content/news.json, newest first. Invalid rows are dropped. */
export const NEWS: NewsPost[] = (raw as unknown[]).filter(isPost).sort((a, b) => b.date.localeCompare(a.date))

export function newsPost(slug: string) {
  return NEWS.find((post) => post.slug === slug)
}

export function formatNewsDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
