import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { MARINE_FISH, SHRIMPS } from '../config/content'
import { CATEGORIES, SHRIMP_FORMS, STATES } from '../config/products'
import { RFQ_TO, rfqSchema, rfqSubject, rfqSummary, type Rfq, type RfqInput } from '../config/rfq'
import { store } from '../engine/store'

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'mailto'; href: string } | { kind: 'error'; msg: string }

const KNOWN = new Set<string>([...MARINE_FISH, ...SHRIMPS])

/** Hash wins over the in-memory prefill. The query string does not survive Vite's html fallback. */
function hashPrefill(): { category?: 'marine' | 'shrimps'; species?: string } {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''))
  const category = q.get('category')
  const species = q.get('species') ?? undefined
  const known = category === 'shrimps' || category === 'marine' ? category : undefined
  const list = known === 'shrimps' ? SHRIMPS : known === 'marine' ? MARINE_FISH : [...MARINE_FISH, ...SHRIMPS]
  return {
    category: known,
    species: species && KNOWN.has(species) && (list as readonly string[]).includes(species) ? species : undefined,
  }
}

/** The RFQ form (STORY §15, TRD §12): validated → api/rfq (Resend) or a pre-filled mailto. Lazy chunk: zod + react-hook-form stay out of the first load. */
export default function RfqForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const doneRef = useRef<HTMLHeadingElement>(null)
  const fromHash = hashPrefill()
  const { prefill } = store.getState()
  const category0 = fromHash.category ?? prefill.category ?? 'marine'
  const species0 = fromHash.species ?? (fromHash.category ? undefined : prefill.species)
  const { register, handleSubmit, control, setValue, getValues, reset, formState: { errors } } = useForm<RfqInput, unknown, Rfq>({
    resolver: zodResolver(rfqSchema),
    defaultValues: {
      category: category0,
      species: species0 && KNOWN.has(species0) ? [species0] : [],
      forms: [],
      states: [],
    },
  })
  const category = useWatch({ control, name: 'category' })

  // pre-fill from Products: the category last looked at, plus the species an "Enquire" button names (ticked, never unticked)
  useEffect(
    () =>
      store.subscribe(({ prefill: p }, prev) => {
        if (p === prev.prefill || !p.category) return
        const switched = p.category !== getValues('category')
        setValue('category', p.category)
        if (switched) setValue('species', p.species ? [p.species] : [])
        else if (p.species) setValue('species', [...new Set([...(getValues('species') ?? []), p.species])])
      }),
    [setValue, getValues],
  )

  useEffect(() => {
    if (status.kind === 'sent' || status.kind === 'mailto') doneRef.current?.focus()
  }, [status.kind])

  const onSubmit = async (r: Rfq) => {
    setStatus({ kind: 'sending' })
    const mailto = `mailto:${RFQ_TO}?subject=${encodeURIComponent(rfqSubject(r))}&body=${encodeURIComponent(rfqSummary(r))}`
    try {
      const res = await fetch('/api/rfq', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) })
      const body = await res.json().catch(() => ({}))
      if (body.ok) return setStatus({ kind: 'sent' })
      if (res.status === 429) return setStatus({ kind: 'error', msg: 'Too many requests. Please try again in a few minutes, or email us directly.' })
      if (!body.fallback) throw new Error('rfq failed')
    } catch {
      // API unreachable: still let the buyer send it from their own email app
    }
    setStatus({ kind: 'mailto', href: mailto })
    window.location.href = mailto
  }

  const field = (name: 'name' | 'company' | 'country' | 'email' | 'phone' | 'quantity' | 'destination', label: string, type = 'text', auto?: string) => (
    <label className={`field${errors[name] ? ' is-invalid' : ''}`}>
      <input type={type} placeholder=" " autoComplete={auto} aria-invalid={!!errors[name]} {...register(name)} />
      <span className="field__label">{label}</span>
      {errors[name] && <span className="field__error" role="alert">{errors[name]?.message}</span>}
    </label>
  )
  const checks = (name: 'species' | 'forms' | 'states', options: string[], legend: string) => (
    <fieldset className="checks">
      <legend className="mono">{legend}</legend>
      {options.map((o) => (
        <label key={o} className="check">
          <input type="checkbox" value={o} {...register(name)} />
          <span>{o}</span>
        </label>
      ))}
    </fieldset>
  )

  return status.kind === 'sent' || status.kind === 'mailto' ? (
    <div className="rfq-done" role="status">
      <svg className="rfq-done__check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
      <h3 ref={doneRef} tabIndex={-1} className="tile__title">{status.kind === 'sent' ? 'Thank you. Your request is with our team.' : 'Your email app should open with the request.'}</h3>
      {status.kind === 'mailto' && (
        <p>
          If it didn’t, <a href={status.href}>open the pre-filled email</a> or write to <a href={`mailto:${RFQ_TO}`}>{RFQ_TO}</a>.
        </p>
      )}
      <button
        className="btn"
        type="button"
        onClick={() => {
          reset()
          setStatus({ kind: 'idle' })
        }}
      >
        Send another request
      </button>
    </div>
  ) : (
    <form id="quote-form" className="rfq" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="rfq__row">
        {field('name', 'Name', 'text', 'name')}
        {field('company', 'Company', 'text', 'organization')}
      </div>
      <div className="rfq__row">
        {field('country', 'Country', 'text', 'country-name')}
        {field('email', 'Email', 'email', 'email')}
      </div>
      <div className="rfq__row">
        {field('phone', 'Phone (optional)', 'tel', 'tel')}
        <label className="field field--select">
          <select {...register('category')}>
            <option value="marine">{CATEGORIES.marine.label}</option>
            <option value="shrimps">{CATEGORIES.shrimps.label}</option>
          </select>
          <span className="field__label">Product category</span>
        </label>
      </div>
      {checks('species', category === 'shrimps' ? SHRIMPS : MARINE_FISH, 'Species')}
      {category === 'shrimps' && checks('forms', SHRIMP_FORMS.map((f) => f.name), 'Form')}
      {checks('states', STATES, 'Fresh / chilled / frozen')}
      <div className="rfq__row">
        {field('quantity', 'Quantity')}
        {field('destination', 'Destination market')}
      </div>
      <label className={`field field--area${errors.message ? ' is-invalid' : ''}`}>
        <textarea rows={4} placeholder=" " {...register('message')} />
        <span className="field__label">Message</span>
        {errors.message && <span className="field__error" role="alert">{errors.message.message}</span>}
      </label>
      <label className="hp" aria-hidden="true">
        Website <input tabIndex={-1} autoComplete="off" {...register('website')} />
      </label>
      {status.kind === 'error' && <p className="field__error" role="alert">{status.msg}</p>}
      <button className="btn btn--solid rfq__submit" type="submit" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}
