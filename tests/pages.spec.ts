import { expect, test } from '@playwright/test'

const ready = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => document.documentElement.dataset.ready === '1')

test('quote page keeps the form, the chips, and the office panel', async ({ page }) => {
  await page.goto('/quote')
  await ready(page)
  await expect(page).toHaveTitle('Request an export quote | Skylark Exim')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Sheela Nagar/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://skylarkexim.com/quote')
  await expect(page.getByRole('heading', { level: 1, name: 'Request an export quote' })).toBeVisible()
  const form = page.locator('#quote-form')
  await expect(form.getByLabel('Name')).toBeVisible()
  await expect(form.getByLabel('Company')).toBeVisible()
  await expect(form.getByLabel('Country')).toBeVisible()
  await expect(form.getByLabel('Email')).toBeVisible()
  await expect(form.getByLabel('Phone (optional)')).toBeVisible()
  await expect(form.getByLabel('Product category')).toBeVisible()
  await expect(form.getByRole('group', { name: 'Species' }).getByLabel('Indian Mackerel')).toBeVisible()
  await expect(form.getByRole('group', { name: 'Fresh / chilled / frozen' }).getByLabel('Frozen')).toBeVisible()
  const office = page.getByRole('complementary', { name: 'Office' })
  await expect(office).toContainText('Sheela Nagar, Visakhapatnam')
  await expect(office.getByRole('link', { name: 'info@skylarkexim.com' })).toHaveAttribute('href', 'mailto:info@skylarkexim.com')
  await expect(office).not.toContainText(/response|business day|within \d/i)
  await expect(page.locator('.quote-cta')).toHaveAttribute('aria-current', 'page')
})

test('a species chip is reachable from the keyboard', async ({ page }) => {
  await page.goto('/quote')
  await ready(page)
  const tuna = page.locator('#quote-form').getByLabel('Tuna', { exact: true })
  await tuna.focus()
  await page.keyboard.press(' ')
  await expect(tuna).toBeChecked()
})

test('a successful quote request shows a confirmation and can be reset', async ({ page }) => {
  await page.route('**/api/rfq', (route) => route.fulfill({ json: { ok: true } }))
  await page.goto('/quote')
  await ready(page)
  const form = page.locator('#quote-form')
  await form.getByLabel('Name').fill('Test Buyer')
  await form.getByLabel('Company').fill('Test Imports')
  await form.getByLabel('Country').fill('Japan')
  await form.getByLabel('Email').fill('buyer@example.com')
  await form.getByRole('button', { name: 'Send request' }).click()
  const thanks = page.getByRole('heading', { name: 'Thank you. Your request is with our team.' })
  await expect(thanks).toBeFocused()
  await page.getByRole('button', { name: 'Send another request' }).click()
  await expect(page.locator('#quote-form')).toBeVisible()
})

test('quote hash prefill selects the species', async ({ page }) => {
  await page.goto('/quote#category=shrimps&species=Black+Tiger+Shrimp')
  await ready(page)
  const form = page.locator('#quote-form')
  await expect(form.getByLabel('Product category')).toHaveValue('shrimps')
  await expect(form.getByLabel('Black Tiger Shrimp', { exact: true })).toBeChecked()
})

test('news page is an honest empty state', async ({ page }) => {
  await page.goto('/news')
  await ready(page)
  await expect(page).toHaveTitle('News & updates | Skylark Exim')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://skylarkexim.com/news')
  await expect(page.getByRole('heading', { level: 1, name: 'News & updates' })).toBeVisible()
  await expect(page.getByText('Updates coming soon')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Request export quote', exact: true })).toHaveAttribute('href', '/quote')
  const labels = await page.getByRole('navigation', { name: 'Site' }).locator('.nav__link').allTextContents()
  // no News item in the nav while news.json is empty (nav.ts)
  expect(labels.slice(0, 9).map((label) => label.trim())).toEqual(['Home', 'Our Story', 'Wild catch', 'Farmed shrimp', 'Products', 'Markets', 'About', 'Order', 'Contact'])
})

test('an unknown news slug stays on the news layout', async ({ page }) => {
  await page.goto('/news/not-a-real-update')
  await ready(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Update not found' })).toBeVisible()
  await expect(page.getByText('This update is not published.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'News & updates' })).toHaveAttribute('href', '/news')
  await expect(page).toHaveTitle('Update not found | Skylark Exim')
})

test('Products in the quote navbar opens the homepage at #products', async ({ page }) => {
  await page.goto('/quote')
  await ready(page)
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Products' }).click()
  await page.waitForURL(/\/#products$/)
  await ready(page)
  await page.waitForSelector('#boot', { state: 'detached' })
  await expect.poll(async () => page.locator('#products').evaluate((el) => Math.abs(el.getBoundingClientRect().top)), { timeout: 8_000 }).toBeLessThan(120)
})

test('the homepage ends on the closing band', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.waitForSelector('#boot', { state: 'detached' })
  const close = page.locator('.close')
  await close.scrollIntoViewIfNeeded()
  await expect(close).toContainText('From Visakhapatnam to the world.')
  await expect(close.getByRole('link', { name: 'Request export quote' })).toHaveAttribute('href', '/quote')
  // no news link anywhere on the homepage while news.json is empty (nav.ts)
  await expect(page.locator('a[href^="/news"]')).toHaveCount(0)
  await expect(page.locator('.home-news')).toHaveCount(0)
  await expect(page.locator('form.rfq')).toHaveCount(0)
  await expect(page.locator('a.hero__contact')).toHaveAttribute('href', '/quote')
  await expect(page.locator('a.contact-band__cta')).toHaveAttribute('href', '/quote')
})

test('the quote link is in the mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/quote')
  await ready(page)
  await page.getByRole('button', { name: 'Menu' }).click()
  const quote = page.getByRole('link', { name: 'Request export quote →' })
  await expect(quote).toHaveCount(1)
  await expect(quote).toHaveAttribute('href', '/quote')
  await expect(quote).toHaveAttribute('aria-current', 'page')
})

test('direct visits to /products, /about and /contact land on their homepage section (#272)', async ({ page }) => {
  for (const id of ['products', 'about', 'contact']) {
    for (const path of [`/${id}`, `/${id}.html`]) {
      const res = await page.goto(path)
      expect(res?.status(), path).toBe(200)
      expect(new URL(page.url()).pathname, path).toBe('/')
      expect(new URL(page.url()).hash, path).toBe(`#${id}`)
      await ready(page)
      await expect(page.locator(`#${id}`)).toBeInViewport()
    }
  }
})
