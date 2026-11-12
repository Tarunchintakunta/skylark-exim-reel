import { MEDIA_V, TEXTURE_V } from './manifest'

/** every file under /media carries its content hash (#251, #hd): /media/* is cached immutably, so a new file needs a new URL */
export const mediaUrl = (file: string) => `/media/${file}${MEDIA_V[file] ? `?v=${MEDIA_V[file]}` : ''}`
/** the same for /textures (the globe's maps and placeholders), cached immutably too (vercel.json) */
export const texUrl = (file: string) => `/textures/${file}${TEXTURE_V[file] ? `?v=${TEXTURE_V[file]}` : ''}`
