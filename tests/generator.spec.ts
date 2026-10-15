import { test, expect } from '@playwright/test'
import { generateVariant } from '../src/randomize'
import { SHADER_PRESETS } from '../src/presets'

test('random variants are reproducible, bounded and independent', () => {
  for (const name of ['Blue Haze', 'Silver Tide']) {
    expect(SHADER_PRESETS[name].scale).toBe(2)
    expect(SHADER_PRESETS[name].grain).toBe(0.002)
  }
  expect(Object.keys(SHADER_PRESETS).slice(0, 2)).toEqual(['Abyss Blue', 'Cloud White'])
  expect(SHADER_PRESETS['Cloud White']).toMatchObject({
    type: 'pattern', colors: ['#8AA3D6', '#FFFFFF', '#FFFFFF'], grain: 0, speed: 14, scale: 0.78,
  })
  expect(SHADER_PRESETS.Flowlight).toEqual({
    type: 'flowlight', colors: ['#000000', '#000000', '#204a7e', '#ccac66', '#000000'],
    grain: 0.005, speed: 56, shape: 'checks', shapeScale: 0, rotation: 15,
    proportion: 60, softness: 80, distortion: 18, swirl: 20, swirlIterations: 12,
    scale: 1.64, offsetX: -124, offsetY: -48, lightX: 0.89, lightY: 0.46,
    lightCore: 0.14, lightHalo: 0.2, bottomFade: 0, vignette: 0.38,
    bloomThreshold: 0.61, bloomRange: 0.18, bloomStrength: 0.4,
  })
  const original = JSON.stringify(SHADER_PRESETS)
  for (const mood of ['light', 'dark'] as const) {
    for (let seed = 0; seed < 100; seed++) {
      const variant = generateVariant(seed, mood)
      expect(variant).toEqual(generateVariant(seed, mood))
      expect(variant.type).toBe('flowlight')
      expect(variant.colors).toHaveLength(5)
      variant.colors.forEach(color => expect(color).toMatch(/^#[0-9a-f]{6}$/i))
      expect(variant.scale).toBe(2)
      for (const value of Object.values(variant)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBeTruthy()
      }
      variant.colors[0] = '#ffffff'
    }
  }
  expect(JSON.stringify(SHADER_PRESETS)).toBe(original)
  expect(generateVariant(1, 'light')).not.toEqual(generateVariant(2, 'light'))
  expect(generateVariant(1, 'light')).not.toEqual(generateVariant(1, 'dark'))
})

test('every preset compiles and draws non-uniform pixels without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 900, height: 600 })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 0.5 })
    const original = WebGL2RenderingContext.prototype.drawArrays
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      original.apply(this, args)
      const pixels: string[] = []
      for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) {
        const pixel = new Uint8Array(4)
        this.readPixels(Math.floor(this.drawingBufferWidth * x / 5), Math.floor(this.drawingBufferHeight * y / 5), 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel)
        pixels.push(Array.from(pixel).join(','))
      }
      const canvas = this.canvas as HTMLCanvasElement
      canvas.dataset.pixelVariety = String(new Set(pixels).size)
      canvas.dataset.frameCount = String(Number(canvas.dataset.frameCount || 0) + 1)
    }
  })
  await page.goto('/')
  await expect(page).toHaveTitle('Shader Animation Generator')
  for (const name of Object.keys(SHADER_PRESETS)) {
    const previousFrames = Number(await page.locator('canvas').getAttribute('data-frame-count') || 0)
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-frame-count'))).toBeGreaterThan(previousFrames + 1)
    await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-pixel-variety'))).toBeGreaterThan(3)
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('controls, clipboard, JSON downloads, types and randomization work', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Flowlight', exact: true }).click()
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('flowlight')
  await expect(page.getByRole('slider', { name: 'Light core' })).toHaveValue('0.14')
  await expect(page.getByRole('slider', { name: 'Swirl', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click()
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
  expect(copied.type).toBe('flowlight')
  expect(copied.offsetX).toBe(-124)
  expect(copied.colors).toEqual(SHADER_PRESETS.Flowlight.colors)
  await page.getByLabel('Type', { exact: true }).selectOption('fluid')
  await expect(page.getByRole('slider', { name: 'Light core' })).toHaveCount(0)
  await page.getByLabel('Type', { exact: true }).selectOption('pattern')
  await page.getByRole('button', { name: 'Add color' }).click()
  await expect(page.getByLabel('Color 6', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add color' })).toBeDisabled()
  await page.getByLabel('Type', { exact: true }).selectOption('flowlight')
  await expect(page.getByLabel('Color 6', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Random light' }).click()
  await page.getByText('View JSON', { exact: true }).click()
  const light = JSON.parse(await page.getByLabel('Shader JSON').inputValue())
  expect(light.scale).toBe(2)
  expect(light.vignette).toBeLessThanOrEqual(0.12)
  await page.getByRole('button', { name: 'Random dark' }).click()
  const dark = JSON.parse(await page.getByLabel('Shader JSON').inputValue())
  expect(dark.scale).toBe(2)
  expect(dark.vignette).toBeGreaterThanOrEqual(0.4)
  expect(dark.colors).not.toEqual(light.colors)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('custom-shader.json')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(dark)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await page.getByRole('button', { name: 'Customize' }).click()
  await expect(page.getByRole('complementary')).toBeVisible()
})

test('mobile controls stay in viewport and canvas resizes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Blue Haze', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Blue Haze', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const panel = await page.getByRole('complementary').boundingBox()
  expect(panel!.x).toBeGreaterThanOrEqual(0)
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390)
  await expect.poll(() => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBe(390)
  await page.setViewportSize({ width: 844, height: 390 })
  await expect.poll(() => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBe(844)
})

test('minimal controls have no header or footer backdrop', async ({ page }) => {
  await page.goto('/')
  const firstPreset = page.getByRole('navigation').getByRole('button').first()
  await expect(firstPreset).toHaveText('Abyss Blue')
  await expect(firstPreset).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Abyss Blue', exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Scale', exact: true })).toHaveValue('2.2')
  await expect(page.locator('header, h1')).toHaveCount(0)
  await expect(page.locator('footer')).toHaveCSS('background-image', 'none')
  await expect(page.locator('footer')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('footer')).toHaveCSS('text-shadow', 'none')
  await expect(page.locator('footer')).toHaveCSS('mix-blend-mode', 'normal')
  await expect(page.locator('footer')).toHaveCSS('color', 'rgba(255, 255, 255, 0.65)')
  const strip = await page.getByRole('navigation').boundingBox()
  expect(strip!.height).toBeLessThanOrEqual(32)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeVisible()
})

test('modern panel keeps native menu and slider keyboard behavior', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LIVE EDITOR', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('complementary').getByRole('heading')).toHaveCSS('font-family', /Montserrat/)
  const loadedFonts = await page.evaluate(async () => (await document.fonts.load('500 18px Montserrat')).filter(font => font.status === 'loaded').length)
  expect(loadedFonts).toBe(1)
  await page.getByRole('button', { name: 'Porcelain Blue', exact: true }).click()
  const grain = page.getByRole('slider', { name: 'Grain', exact: true })
  await grain.focus()
  await grain.press('ArrowRight')
  await expect(grain).toHaveValue('0.001')
  expect(await grain.evaluate(el => el.style.getPropertyValue('--range-progress'))).toBe('2%')
  await grain.press('End')
  await expect(grain).toHaveValue('0.05')
  expect(await grain.evaluate(el => el.style.getPropertyValue('--range-progress'))).toBe('100%')
  await grain.press('Home')
  await expect(grain).toHaveValue('0')
  await page.getByLabel('Shape', { exact: true }).selectOption('stripes')
  await expect(page.getByLabel('Shape', { exact: true })).toHaveValue('stripes')
  await page.getByLabel('Type', { exact: true }).selectOption('flowlight')
  await expect(page.getByRole('slider', { name: 'Light core', exact: true })).toBeVisible()
})

test('scroll edge fades follow overflow and color icons are centered', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 })
  await page.goto('/')
  const strip = page.getByRole('navigation')
  await expect(strip).toHaveAttribute('data-scroll-left', 'false')
  await expect(strip).toHaveAttribute('data-scroll-right', 'true')
  await strip.evaluate(el => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2 })
  await expect(strip).toHaveAttribute('data-scroll-left', 'true')
  await expect(strip).toHaveAttribute('data-scroll-right', 'true')
  await strip.evaluate(el => { el.scrollLeft = el.scrollWidth })
  await expect(strip).toHaveAttribute('data-scroll-left', 'true')
  await expect(strip).toHaveAttribute('data-scroll-right', 'false')
  await page.setViewportSize({ width: 2200, height: 1000 })
  await expect(strip).toHaveAttribute('data-scroll-left', 'false')
  await expect(strip).toHaveAttribute('data-scroll-right', 'false')
  await expect(strip).toHaveCSS('mask-image', 'none')
  for (const name of ['Add color', 'Remove color']) {
    const button = page.getByRole('button', { name, exact: true })
    const outer = await button.boundingBox()
    const icon = await button.locator('svg').boundingBox()
    expect(Math.abs(outer!.x + outer!.width / 2 - icon!.x - icon!.width / 2)).toBeLessThan(0.5)
    expect(Math.abs(outer!.y + outer!.height / 2 - icon!.y - icon!.height / 2)).toBeLessThan(0.5)
  }
})

test('WebGL unavailability and clipboard denial have useful fallbacks', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type === 'webgl2' ? null : original.apply(this, [type, ...args] as never)
    } as typeof original
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied') } } })
    document.execCommand = () => false
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('WebGL 2 is unavailable')
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Export status' })).toContainText('Clipboard unavailable')
  const json = page.getByLabel('Shader JSON')
  await expect(json).toBeVisible()
  await expect(json).toBeFocused()
  await expect(json).toBeInViewport()
  expect(await json.evaluate(el => {
    const textarea = el as HTMLTextAreaElement
    return textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length
  })).toBe(true)
  await expect(page.getByRole('status', { name: 'Manual copy instructions' })).toContainText('⌘C / Ctrl+C')
})
