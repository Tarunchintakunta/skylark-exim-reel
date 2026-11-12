import { z } from 'zod'
import { MARINE_FISH, SHRIMPS, STATES } from './content'
import { SHRIMP_FORMS } from './products'

/** One schema for the form (client) and api/rfq.ts (server). TRD §12. */
export const rfqSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  company: z.string().trim().min(2, 'Please enter your company').max(160),
  country: z.string().trim().min(2, 'Please enter your country').max(80),
  email: z.email('Please enter a valid email').max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  category: z.enum(['marine', 'shrimps']),
  species: z.array(z.enum([...MARINE_FISH, ...SHRIMPS] as [string, ...string[]])).max(13).default([]),
  forms: z.array(z.enum(SHRIMP_FORMS.map((f) => f.name) as [string, ...string[]])).max(6).default([]),
  states: z.array(z.enum(STATES as [string, ...string[]])).max(3).default([]),
  quantity: z.string().trim().max(120).optional().or(z.literal('')),
  destination: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().max(2000, 'Please keep the message under 2,000 characters').optional().or(z.literal('')),
  /** honeypot: humans never see or fill this */
  website: z.string().max(0).optional().or(z.literal('')),
})

export type RfqInput = z.input<typeof rfqSchema>
export type Rfq = z.output<typeof rfqSchema>

export const RFQ_TO = 'info@skylarkexim.com'

/** Plain-text summary used for both the email body and the mailto fallback. */
export function rfqSummary(r: Rfq) {
  const line = (k: string, v?: string | string[]) => (v && v.length ? `${k}: ${Array.isArray(v) ? v.join(', ') : v}\n` : '')
  return (
    line('Name', r.name) +
    line('Company', r.company) +
    line('Country', r.country) +
    line('Email', r.email) +
    line('Phone', r.phone) +
    line('Category', r.category === 'marine' ? 'Marine Fish' : 'Shrimps') +
    line('Species', r.species) +
    line('Forms', r.forms) +
    line('State', r.states) +
    line('Quantity', r.quantity) +
    line('Destination market', r.destination) +
    (r.message ? `\n${r.message}\n` : '')
  )
}

export const rfqSubject = (r: Rfq) => `Export quote request: ${r.company} (${r.country})`
