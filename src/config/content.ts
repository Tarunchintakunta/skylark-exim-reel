// Every line here comes from docs/CONTENT.md ("Use on site" column) or docs/STORY.md.
// Headlines are editorial and make no factual claim. Do not add facts here that are not in CONTENT.md.
import { MARKET_COORDS, MARKET_COUNT, marketLabel } from './markets.ts'

export interface CaptionCopy {
  eyebrow?: string
  title: string
  body?: string
  chips?: string[]
  /** small mono line instead of a body (the last sea shot) */
  note?: string
}

export const MARINE_FISH = ['Indian Mackerel', 'Tuna', 'Swordfish', 'Cuttlefish', 'Squid', 'Leatherjacket', 'Ribbon Fish', 'Seer Fish']
export const SHRIMPS = ['Vannamei', 'Black Tiger Shrimp', 'Sea White Shrimp', 'Pink / Brown', 'Sea Tiger Shrimp']
export const SHRIMP_CHIPS = ['Vannamei', 'Black Tiger', 'Sea White', 'Pink / Brown', 'Sea Tiger']
export const STATES = ['Raw fresh', 'Chilled', 'Frozen']

export const MARKETS = MARKET_COORDS.map((m) => marketLabel(m.name))

export const start = {
  eyebrow: 'Visakhapatnam · Andhra Pradesh',
  // confirm-list #3 fallback (the drafts' "Two Origins. One Standard." is not on skylarkexim.com)
  title: 'From Visakhapatnam to the world.',
  body: 'Premium raw fresh, chilled and frozen seafood, with a fully integrated value chain from sourcing to delivery.',
  ocean: { label: 'The Ocean', sub: 'Wild catch' },
  pond: { label: 'The Pond', sub: 'Farmed shrimp' },
  skip: 'Skip the story',
  /** hero fork and end-of-path link (#219) */
  choose: 'Choose the story',
  /** homepage hero scroll cue */
  cue: 'Scroll to explore',
  other: 'See the other story',
  cta: 'Request export quote',
}

/** Hero "What we export" line (CONTENT.md products and states). */
export const exportsLine = { title: 'What we export', items: ['Vannamei and Black Tiger shrimp', 'Marine fish', 'Raw fresh, chilled and frozen'] }

export const film: Record<string, CaptionCopy[]> = {
  o1: [{ eyebrow: 'The Ocean · 01', title: 'Before the harbour wakes.', body: 'Based in Visakhapatnam, Andhra Pradesh. Raw material is sourced directly from farms or fishing vessels.' }],
  o2: [{ eyebrow: 'The Ocean · 02', title: 'Out of the water.', body: 'Initial quality checks (size, freshness, health) are done before acceptance.' }],
  o3: [{ eyebrow: 'The Ocean · 03', title: 'On ice.', body: 'The crew lay the catch in crates and shovel crushed ice over it. Premium raw fresh, chilled and frozen seafood.', chips: MARINE_FISH }],
  o4: [{ eyebrow: 'The Ocean · 04', title: 'Home under a chilled seal.', body: 'Transported under chilled conditions to the processing plant.' }],
  p1: [{ eyebrow: 'The Pond · 01', title: 'Partner farms on the Andhra coast.', body: 'Strategic partnerships with aquaculture farmers and a focus on responsible sourcing.' }],
  p2: [{ eyebrow: 'The Pond · 02', title: 'Every batch has a history.', body: 'We guarantee superior freshness, traceability, and product integrity across all markets.' }],
  p3: [{ eyebrow: 'The Pond · 03', title: 'Harvested into ice.', body: 'Shrimp are sourced directly from farms. Initial quality checks (size, freshness, health) are done before acceptance.', chips: SHRIMP_CHIPS }],
  intake: [{ eyebrow: 'The Plant · Anandapuram', title: 'Into the plant.', body: 'Our processing unit at Anandapuram, Visakhapatnam: a state-of-the-art shrimp processing facility equipped with internationally acclaimed modernized equipment.' }],
  /** the same unit in words that fit fish too (#262): anywhere that is not the farmed-shrimp path */
  'intake.any': [{ eyebrow: 'The Plant · Anandapuram', title: 'Into the plant.', body: 'Our processing unit at Anandapuram, Visakhapatnam, equipped with internationally acclaimed modernized equipment.' }],
  process: [
    { eyebrow: 'The Plant · Washing', title: 'Washed clean.', body: 'Thorough washing with clean, treated water to remove impurities.' },
    { eyebrow: 'The Plant · Grading', title: 'Graded to one standard.', body: 'Sorted by size, weight, and type. Grading ensures uniformity for export standards.' },
    { eyebrow: 'The Plant · Processing', title: 'Made to order.', body: 'De-heading, peeling and deveining, manual or machine, based on product requirement: Head-On, Headless, Peeled, or Value-Added.' },
  ],
  coldchain: [
    { eyebrow: 'The Plant · Quality lab', title: 'Tested before it moves.', body: 'Checks for hygiene, freshness, texture and absence of defects. Samples tested for international food safety compliance.' },
    { eyebrow: 'The Plant · Freezing', title: 'Frozen at its best.', body: 'IQF (Individually Quick Frozen) or block freezing. Glazing (a thin ice layer) applied to preserve freshness during shipment.' },
    { eyebrow: 'The Plant · Packing', title: 'Packed and labelled.', body: 'Export-grade cartons, vacuum packs, or customized packaging. Labels with product details, size, batch, and export compliance.' },
    { eyebrow: 'The Plant · Cold storage', title: 'Held at −18\u00a0°C to −20\u00a0°C.', body: 'Our warehouse has a total storage capacity of 700 pallets.' },
  ],
  // the wild-catch path (#219): the fish in the plant. Only work-flow steps that hold for any seafood (receiving checks,
  // washing, grading, freezing and glazing, cold storage) and the company's quality text; nothing shrimp-specific
  'intake.ocean': [{ eyebrow: 'The Plant · Anandapuram', title: 'Into the plant.', body: 'Transported under chilled conditions to our processing unit at Anandapuram, Visakhapatnam. Initial quality checks (size, freshness, health) are done before acceptance.' }],
  'process.ocean': [
    { eyebrow: 'The Plant · Washing', title: 'Washed and graded.', body: 'Thorough washing with clean, treated water to remove impurities. Sorted by size, weight and type. Grading ensures uniformity for export standards.' },
    { eyebrow: 'The Plant · Quality', title: 'One standard, every stage.', body: 'Our commitment to excellence is powered by advanced processing facilities, innovative technology, and strict adherence to international quality standards.', note: 'Quality control staff · Lab unit, Anandapuram' },
  ],
  'coldchain.ocean': [
    { eyebrow: 'The Plant · Freezing', title: 'Frozen at its best.', body: 'IQF (Individually Quick Frozen) or block freezing. Glazing (a thin ice layer) applied to preserve freshness during shipment.' },
    { eyebrow: 'The Plant · Cold storage', title: 'Held cold until dispatch.', body: 'Our warehouse has a total storage capacity of 700 pallets.' },
  ],
  docs: [{ eyebrow: 'Export · Documentation', title: 'Paperwork, done properly.', body: 'Our documentation staff professionally prepare all necessary documents and handle logistical tracking of shipments. Compliance with export certificates (HACCP, EU, FDA, etc.).' }],
  port: [{ eyebrow: 'Export · The port', title: 'Loaded under the cranes.', body: 'Shipped in reefer containers to maintain the cold chain until the destination.' }],
  sea: [{ eyebrow: 'Export · At sea', title: 'From Visakhapatnam to the world’s table.', note: 'Cold chain · outbound' }],
  world: [{ eyebrow: 'Export · Markets', title: `Trusted in ${MARKET_COUNT} markets.`, body: MARKETS.join(' · ') }],
}

/** Label card in the packing caption: field names only, never values (STORY §7). */
export const LABEL_FIELDS = ['Product', 'Size', 'Batch', 'Export compliance']
/** Documentation interlude cards (STORY §8): functions only, no document contents. */
export const DOC_CARDS = ['Export documents', 'Compliance (HACCP · EU · FDA)', 'Shipment tracking']

/** Why choose us (STORY §13; tile lines from CONTENT.md "Use on site"). */
export const TRUST = {
  title: 'Why choose us',
  tiles: [
    { title: 'Quality control staff', line: 'For our clients, our quality control staff guarantee top-notch quality.' },
    { title: 'Lab unit', line: 'Our lab unit at Anandapuram, Visakhapatnam.' },
    { title: 'Traceability', line: 'Superior freshness, traceability and product integrity across all markets.' },
    { title: 'Documentation staff', line: 'Our documentation staff prepare all necessary documents and track every shipment’s logistics.' },
    { title: 'Farmer partnerships', line: 'Strategic partnerships with aquaculture farmers and a focus on responsible sourcing.' },
    { title: 'Prompt delivery', line: 'Competent people for accurate order handling and prompt delivery.' },
  ],
  compliance: 'Compliance with export certificates (HACCP, EU, FDA, etc.)',
  facts: [
    { value: '700', label: 'pallet warehouse' },
    { value: String(MARKET_COUNT), label: 'markets' },
    { value: 'Raw fresh, chilled and frozen', label: 'seafood' },
  ],
}

/** About (STORY §14; CONTENT.md "Use on site"). Vision keeps "coastal commodities" until confirm-list #4 is answered. */
export const ABOUT = {
  title: 'High professionalism and excellence',
  company: [
    'Skylark Exim, based in Visakhapatnam, Andhra Pradesh, is a trusted seafood exporter specialising in premium raw fresh, chilled and frozen seafood. With a fully integrated value chain, we ensure complete control over quality, consistency and sustainability at every stage, from sourcing to delivery.',
    'Our commitment to excellence is powered by advanced processing facilities, innovative technology, and strict adherence to international quality standards. Through strategic partnerships with aquaculture farmers and a focus on responsible sourcing, we guarantee superior freshness, traceability, and product integrity across all markets.',
    'Today, Skylark Exim is recognised as one of India’s leading and globally trusted shrimp exporters, delivering world-class seafood solutions to customers worldwide.',
  ],
  vision:
    'To be a trusted global leader in the seafood export industry by delivering premium-quality, sustainably sourced seafood to international markets, while building long-term partnerships, supporting coastal commodities, and promoting responsible fishing practices for future generations.',
  mission:
    'Our mission is to deliver premium-quality seafood to global markets while ensuring sustainability, freshness and customer satisfaction. We are committed to building long-term relationships with our clients by maintaining the highest standards of hygiene, ethical sourcing and timely delivery.',
  partners: [
    { name: 'V. Yashod Kumar', initials: 'VY' },
    { name: 'N.V. Prudhvi', initials: 'NP' },
  ],
}

/**
 * Homepage bands (#233). Sentences are CONTENT.md lines; the card titles are Tarun's. No founding year: none is on
 * skylarkexim.com (CONTENT.md "Never write"), so the intro says where, not since when.
 */
export const HOME = {
  intro: {
    eyebrow: start.eyebrow,
    title: 'Seafood exporters from Visakhapatnam.',
    body: 'Raw material is sourced directly from farms or fishing vessels. Our processing unit is at Anandapuram, Visakhapatnam.',
  },
  stories: {
    ocean: { title: 'Wild catch: from sea to port', cta: 'Watch the wild catch story' },
    pond: { title: 'Farmed shrimp: from pond to port', cta: 'Watch the farmed shrimp story' },
    /** shared by both cards: where every path ends */
    end: ['The plant', 'The port'],
  },
  plant: {
    eyebrow: 'The plant · Anandapuram',
    title: 'One standard, every stage.',
    body: 'Our commitment to excellence is powered by advanced processing facilities, innovative technology, and strict adherence to international quality standards.',
  },
  news: { title: 'Latest updates', all: 'All news' },
}

/** Contact (CONTENT.md "Contact"). */
export const CONTACT = {
  phones: [
    { label: '+91-9000 604 070', tel: '+919000604070' },
    { label: '+91-9885 827 318', tel: '+919885827318' },
  ],
  email: 'info@skylarkexim.com',
  office: 'Sheela Nagar, Visakhapatnam, Andhra Pradesh',
  unit: 'Abad Overseas Private Limited, S.No. 297/Part, Lodagalavanipalem, Anandapuram-Pendurthi Road, Anandapuram, Visakhapatnam-530052, Andhra Pradesh',
}
