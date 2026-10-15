import { DEFAULT_PARAMETERS, type ShaderParameters } from './presets'
import { oklchToHex } from './color'

export type Mood = 'light' | 'dark'

/** Seeded color harmonies spanning the whole hue wheel, with restrained chroma. */
export function generateVariant(seed: number, mood: Mood): ShaderParameters {
  // Mulberry32: Tommy Ettinger's algorithm, JS implementation by bryc.
  // MIT fallback license; see public/THIRD_PARTY_NOTICES.txt.
  let state = seed >>> 0
  const random = () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const range = (min: number, max: number, precision = 3) => Number((min + random() * (max - min)).toFixed(precision))
  const hue = range(0, 360)
  // Analogous, split-complementary, soft triadic, and complementary duotone.
  // Every family has a dominant hue; contrast colors are softened by chroma and lightness.
  const harmonies = [[-30, 35], [150, -150], [120, -120], [20, 180]]
  const [side, accent] = harmonies[Math.floor(random() * harmonies.length)]
  const chroma = range(0.06, 0.105)
  const color = (minL: number, maxL: number, strength: number, offset: number) => {
    const L = range(minL, maxL)
    const C = Math.min(chroma * strength, L * 0.2)
    return oklchToHex(L, C, hue + offset + range(-8, 8))
  }
  // Five shader roles: base, shadow, dominant color, soft highlight, grounding color.
  // No colors are sampled from the curated presets.
  const colors = mood === 'light' ? [
    color(0.90, 0.97, 0.18, accent),
    color(0.56, 0.72, 0.75, side),
    color(0.70, 0.84, 1, 0),
    color(0.87, 0.97, 0.38, accent),
    color(0.63, 0.80, 0.68, side / 2),
  ] : [
    color(0.10, 0.18, 0.2, 0),
    color(0.20, 0.30, 0.5, side),
    color(0.38, 0.53, 0.85, 0),
    color(0.60, 0.78, 0.55, accent),
    color(0.13, 0.23, 0.33, side / 2),
  ]
  return {
    ...DEFAULT_PARAMETERS, type: 'flowlight', colors,
    scale: 2, speed: range(8, 22, 0),
    offsetX: range(-160, 160, 0), offsetY: range(-160, 80, 0),
    grain: range(0.004, 0.014),
    lightX: range(0.25, 0.95), lightY: range(0.35, 0.85),
    lightCore: range(0.01, 0.06), lightHalo: range(0.01, 0.07),
    bloomStrength: range(0.06, 0.16),
    bottomFade: mood === 'light' ? 0 : range(0.72, 0.95),
    vignette: mood === 'light' ? range(0.02, 0.12) : range(0.4, 0.7),
  }
}
