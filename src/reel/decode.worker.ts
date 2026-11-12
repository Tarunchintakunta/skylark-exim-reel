/// <reference lib="webworker" />
/**
 * Reel frame decoder: fetch (HTTP cache first, /media is immutable) and decode off the main thread, hand back an
 * ImageBitmap (transferred, no copy). A request superseded before it starts is dropped (`cancel`).
 */
const dropped = new Set<number>()

self.onmessage = async (e: MessageEvent<{ id: number; url: string } | { cancel: number[] }>) => {
  const msg = e.data
  if ('cancel' in msg) {
    for (const id of msg.cancel) dropped.add(id)
    return
  }
  const { id, url } = msg
  try {
    if (dropped.delete(id)) return void self.postMessage({ id, bmp: null })
    const blob = await (await fetch(url)).blob()
    if (dropped.delete(id)) return void self.postMessage({ id, bmp: null })
    const bmp = await createImageBitmap(blob)
    self.postMessage({ id, bmp }, [bmp])
  } catch {
    self.postMessage({ id, bmp: null, error: true })
  }
}
