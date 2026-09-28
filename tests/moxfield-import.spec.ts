import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'

const csvPath = resolve('tests/fixtures/moxfield-small.csv')

test('Moxfield import resolves exact printings and requires explicit review before collection mutation', async ({ page }) => {
  const lookupBatches: number[] = []
  await page.route('https://api.scryfall.com/cards/collection', async (route) => {
    const body = route.request().postDataJSON() as { identifiers: Array<{ set: string; collector_number: string }> }
    lookupBatches.push(body.identifiers.length)
    const data = body.identifiers.flatMap(({ set, collector_number }) => {
      const entry = knownPrintings[`${set}/${collector_number}`]
      return entry ? [entry] : []
    })
    const found = new Set(data.map((card) => `${card.set}/${card.collector_number}`))
    const not_found = body.identifiers.filter(({ set, collector_number }) => !found.has(`${set}/${collector_number}`))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, not_found }) })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'My collection' })).toBeVisible()
  await page.getByRole('button', { name: 'My collection' }).click()
  const initialTotal = await page.locator('.stat').first().locator('strong').innerText()
  await page.getByRole('button', { name: 'Import CSV ＋' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Choose CSV file').setInputFiles(csvPath)
  await expect(dialog.getByRole('region', { name: 'Review Moxfield import' })).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByText('Review import')).toBeVisible()
  const reviewText = await dialog.locator('.moxfield-review-heading').innerText()
  expect(reviewText).toContain('3 groups matched')
  expect(reviewText).toContain('4 cards')
  await expect(dialog.locator('input[name="import-mode"]').nth(0)).toBeChecked()
  await dialog.getByLabel('Add to current collection').check()
  await dialog.getByRole('button', { name: /Confirm addition/ }).click()
  await expect(page.getByRole('status')).toContainText('Added 4 cards from Moxfield')
  await page.getByRole('button', { name: 'My collection' }).click()
  await expect(page.locator('.stat').first().locator('strong')).not.toHaveText(initialTotal)
  await expect(page.locator('.collection-row').filter({ hasText: 'Aang, A Lot to Learn' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'My collection' }).click()
  await expect(page.locator('.collection-row').filter({ hasText: 'Aang, A Lot to Learn' })).toBeVisible()
  expect(lookupBatches.length).toBeGreaterThan(0)
  expect(lookupBatches.every((size) => size <= 75)).toBe(true)
})

const knownPrintings: Record<string, Record<string, unknown>> = {
  'afr/1': { id: 'afr-1', oracle_id: 'oracle-plus-two-mace', name: '+2 Mace', type_line: 'Artifact — Equipment', color_identity: [], cmc: 2, legalities: { commander: 'legal' }, set: 'afr', collector_number: '1' },
  'tle/146': { id: 'tle-146', oracle_id: 'oracle-aang', name: 'Aang, A Lot to Learn', type_line: 'Legendary Creature — Human Avatar', color_identity: ['W'], cmc: 2, legalities: { commander: 'legal' }, set: 'tle', collector_number: '146' },
  'tle/69': { id: 'tle-69', oracle_id: 'oracle-aang-katara', name: 'Aang and Katara', type_line: 'Legendary Creature — Human Avatar', color_identity: ['W', 'U'], cmc: 3, legalities: { commander: 'legal' }, set: 'tle', collector_number: '69' },
}

test('refuses confirmation if all exact printing lookups fail', async ({ page }) => {
  await page.route('https://api.scryfall.com/cards/collection', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [], not_found: route.request().postDataJSON().identifiers }),
  }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'My collection' })).toBeVisible()
  await page.getByRole('button', { name: 'My collection' }).click()
  const initialTotal = await page.locator('.stat').first().locator('strong').innerText()
  await page.getByRole('button', { name: 'Import CSV ＋' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Choose CSV file').setInputFiles(csvPath)
  await expect(dialog.locator('.import-errors li').first()).toBeVisible({ timeout: 120_000 })
  await expect(dialog.locator('.moxfield-review')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /Confirm/ })).toHaveCount(0)
  await expect(page.locator('.stat').first().locator('strong')).toHaveText(initialTotal)
})
