import { test, expect } from '@playwright/test'

test('legacy copy writes the real clipboard when the modern API rejects', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => { throw new DOMException('Blocked by permissions policy', 'NotAllowedError') },
    })
  })
  await page.goto('/')
  const copy = page.getByRole('button', { name: 'Copy JSON', exact: true })
  await copy.click()
  await expect(page.getByRole('status', { name: 'Export status' })).toHaveText('JSON copied to clipboard.')
  const actual = await page.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(actual)).toEqual(JSON.parse(await page.getByLabel('Shader JSON').inputValue()))
  await expect(copy).toBeFocused()
  await expect(page.locator('textarea')).toHaveCount(1)
})

test('missing Clipboard API uses a selected-text compatibility attempt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined })
    document.execCommand = command => {
      const textarea = document.activeElement as HTMLTextAreaElement
      ;(window as unknown as Record<string, unknown>).copyAttempt = {
        command, text: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd,
      }
      return command === 'copy'
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Export status' })).toHaveText('JSON copied to clipboard.')
  const attempt = await page.evaluate(() => (window as unknown as { copyAttempt: { command: string; text: string; start: number; end: number } }).copyAttempt)
  expect(attempt.command).toBe('copy')
  expect(attempt.start).toBe(0)
  expect(attempt.end).toBe(attempt.text.length)
  expect(JSON.parse(attempt.text)).toEqual(JSON.parse(await page.getByLabel('Shader JSON').inputValue()))
  await expect(page.locator('textarea')).toHaveCount(1)
})
