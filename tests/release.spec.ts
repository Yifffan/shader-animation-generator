import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('static release includes owned and third-party licenses', async ({ request }) => {
  for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt']) {
    const response = await request.get(`/${name}`)
    expect(response.ok()).toBe(true)
    const expected = readFileSync(name === 'THIRD_PARTY_NOTICES.txt' ? `public/${name}` : name, 'utf8')
    expect(await response.text()).toBe(expected)
  }
  const notices = await (await request.get('/THIRD_PARTY_NOTICES.txt')).text()
  for (const author of ['Paper Shaders', 'Ashima Arts', 'David Hoskins', 'Tommy Ettinger', 'bryc', 'Montserrat', 'Vite', 'Rolldown']) {
    expect(notices).toContain(author)
  }
  expect(readFileSync('README.md', 'utf8')).toContain('Selected shader visual styles co-created with [@yixiangihsiang](https://github.com/yixiangihsiang).')
})
