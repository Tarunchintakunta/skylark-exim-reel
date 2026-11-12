import { expect, test } from '@playwright/test'
import { chaptersFor } from '../src/config/chapters'
import { film } from '../src/config/content'

// #262: the wild-catch path (and the shared homepage plant card) never calls the plant a shrimp facility
test('no shrimp in the wild-catch path captions or alt text', () => {
  const text = chaptersFor('ocean').flatMap((c) => [...c.captions.flatMap((k) => [k.title, k.body ?? '', k.note ?? '']), ...c.media.map((m) => m.alt)])
  expect(text.filter((t) => /shrimp/i.test(t))).toEqual([])
  expect(film['intake.any'][0].body).not.toMatch(/shrimp/i)
})
