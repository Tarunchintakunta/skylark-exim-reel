import { useEffect } from 'react'

const ORIGIN = 'https://skylarkexim.com'

export function usePageMeta(title: string, description: string, path: string) {
  useEffect(() => {
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${ORIGIN}${path}`)
  }, [title, description, path])
}
