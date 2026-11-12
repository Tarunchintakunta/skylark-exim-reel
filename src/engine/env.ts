// Device/mode flags, read once at startup. A reload picks up changes (good enough for a marketing site).
const mq = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches
const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection

/** < 820 px or touch: 720w clips, native scroll, 0.8× chapter lengths, simplified 3D */
const mobile = mq('(max-width: 819px)') || mq('(pointer: coarse)')

export const env = {
  reduced: mq('(prefers-reduced-motion: reduce)'),
  coarse: mq('(pointer: coarse)'),
  mobile,
  saveData: Boolean(conn?.saveData),
  /**
   * 3G or slower (Network Information API, Chromium only): the light tier and one clip of prefetch, like Save-Data.
   * Phones only. effectiveType is a coarse, flapping estimate (a fast desktop line sometimes reads 3g), so a desktop never
   * drops off its frame sets on it alone: only Save-Data takes a desktop to the light tier (PR #324 audit).
   */
  slow: mobile && ['slow-2g', '2g', '3g'].includes(conn?.effectiveType ?? ''),
  fine: mq('(hover: hover) and (pointer: fine)'),
}
