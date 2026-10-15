import { test, expect } from '@playwright/test'
import { oklchToHex } from '../src/color'
import { generateVariant } from '../src/randomize'

function inspectColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { lightness: L, chroma: Math.hypot(a, bb), hue: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 }
}

test('OKLCH conversion preserves neutrals and maps gamut without hue clipping', () => {
  expect(oklchToHex(0, 0, 0)).toBe('#000000')
  expect(oklchToHex(1, 0, 0)).toBe('#ffffff')
  expect(oklchToHex(0.5, 0, 240)).toBe('#636363')
  const mapped = inspectColor(oklchToHex(0.7, 0.4, 140))
  expect(mapped.lightness).toBeCloseTo(0.7, 2)
  expect(mapped.chroma).toBeLessThan(0.4)
  expect(Math.abs(mapped.hue - 140)).toBeLessThan(2)
})

test('random palettes cover the hue wheel without high chroma or preset dependence', () => {
  for (const mood of ['light', 'dark'] as const) {
    const hueSectors = new Set<number>()
    const palettes = new Set<string>()
    for (let seed = 0; seed < 256; seed++) {
      const variant = generateVariant(seed, mood)
      const main = inspectColor(variant.colors[2])
      hueSectors.add(Math.floor(main.hue / 30))
      palettes.add(variant.colors.join(','))
      expect(variant.scale).toBe(2)
      for (const hex of variant.colors) {
        const color = inspectColor(hex)
        expect(color.chroma).toBeLessThanOrEqual(0.11)
        expect(color.lightness).toBeGreaterThan(mood === 'light' ? 0.55 : 0.09)
        expect(color.lightness).toBeLessThan(mood === 'light' ? 0.98 : 0.79)
      }
    }
    expect(hueSectors.size).toBe(12)
    expect(palettes.size).toBe(256)
  }
})
