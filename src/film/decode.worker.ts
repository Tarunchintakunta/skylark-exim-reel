/// <reference lib="webworker" />

/**
 * Frame store and decoder for the canvas image-sequence engine (sequence.ts, #264).
 *
 * The worker owns the frames: it fetches each one once and keeps the compressed bytes (a 60-frame hero set is ~3 MB as
 * bytes, against ~500 MB as decoded bitmaps), and decodes to an ImageBitmap on demand with createImageBitmap. So the
 * main thread never fetches or decodes inside a scroll frame, and a frame the main thread dropped to stay inside its
 * bitmap budget is decoded again from the bytes already here — never fetched again.
 */
export type ToWorker =
  /** fetch the frame and keep its bytes */
  | { k: 'fetch'; seq: string; i: number; url: string; hi?: boolean }
  /** fetch it if needed, then decode it */
  | { k: 'decode'; seq: string; i: number; url: string; hi?: boolean }
  /** drop a sequence's bytes (the frame set changed, or the stage is gone) */
  | { k: 'free'; seq: string }

export type FromWorker =
  | { k: 'fetched'; seq: string; i: number; bytes: number }
  | { k: 'decoded'; seq: string; i: number; bitmap: ImageBitmap }
  | { k: 'failed'; seq: string; i: number; error: string }

/** compressed frame bytes, by `<seq>:<i>` */
const store = new Map<string, Blob>()
const key = (seq: string, i: number) => `${seq}:${i}`

async function bytes(seq: string, i: number, url: string, hi = false) {
  const k = key(seq, i)
  const have = store.get(k)
  if (have) return have
  // the set on screen asks at high priority, a set being prefetched at low: the browser's queue keeps the same order
  const res = await fetch(url, { priority: hi ? 'high' : 'low' } as RequestInit)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const blob = await res.blob()
  store.set(k, blob)
  return blob
}

onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.k === 'free') {
    for (const k of [...store.keys()]) if (k.startsWith(`${m.seq}:`)) store.delete(k)
    return
  }
  try {
    const blob = await bytes(m.seq, m.i, m.url, m.hi)
    if (m.k === 'fetch') {
      const out: FromWorker = { k: 'fetched', seq: m.seq, i: m.i, bytes: blob.size }
      postMessage(out)
      return
    }
    const bitmap = await createImageBitmap(blob)
    const out: FromWorker = { k: 'decoded', seq: m.seq, i: m.i, bitmap }
    postMessage(out, [bitmap])
  } catch (err) {
    const out: FromWorker = { k: 'failed', seq: m.seq, i: m.i, error: String(err) }
    postMessage(out)
  }
}
