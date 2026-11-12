import { RFQ_TO, rfqSchema, rfqSubject, rfqSummary } from '../src/config/rfq'

/**
 * RFQ endpoint (TRD §12). Sends through Resend only when RESEND_API_KEY is set; otherwise tells the client to
 * fall back to a pre-filled mailto. No secret is needed to build or deploy.
 * Env: RESEND_API_KEY (optional), RFQ_TO (default info@skylarkexim.com), RFQ_FROM (a sender on a Resend-verified domain).
 */

// ponytail: per-instance in-memory bucket (5 requests / 10 min / IP); move to Vercel KV/Upstash if abuse appears
const WINDOW = 10 * 60 * 1000
const LIMIT = 5
const hits = new Map<string, number[]>()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function POST(req: Request) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (recent.length >= LIMIT) return json({ ok: false, error: 'rate_limited' }, 429)
  hits.set(ip, [...recent, now])

  let data: unknown
  try {
    data = await req.json()
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400)
  }
  const parsed = rfqSchema.safeParse(data)
  if (!parsed.success) return json({ ok: false, error: 'invalid', issues: parsed.error.issues.map((i) => i.path.join('.')) }, 400)
  const r = parsed.data
  // honeypot filled: pretend success, send nothing
  if (r.website) return json({ ok: true })

  const key = process.env.RESEND_API_KEY
  const from = process.env.RFQ_FROM
  if (!key || !from) return json({ ok: false, fallback: 'mailto' })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [process.env.RFQ_TO || RFQ_TO], reply_to: r.email, subject: rfqSubject(r), text: rfqSummary(r) }),
  })
  if (!res.ok) return json({ ok: false, fallback: 'mailto' }, 502)
  return json({ ok: true })
}
