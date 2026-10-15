/**
 * OKLCH separates perceived lightness, chroma and hue.
 * https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch
 * Conversion uses the standard Oklab/linear-sRGB matrices. Out-of-gamut colors
 * reduce chroma at fixed lightness and hue rather than clipping RGB channels.
 */
export function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const L = Math.max(0, Math.min(1, lightness))
  const radians = hue * Math.PI / 180
  const toLinearRgb = (C: number) => {
    const a = C * Math.cos(radians)
    const b = C * Math.sin(radians)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ]
  }
  let low = 0
  let high = Math.max(0, chroma)
  let rgb = toLinearRgb(high)
  const inGamut = (values: number[]) => values.every(value => value >= -1e-7 && value <= 1 + 1e-7)
  if (!inGamut(rgb)) {
    for (let i = 0; i < 20; i++) {
      const middle = (low + high) / 2
      if (inGamut(toLinearRgb(middle))) low = middle
      else high = middle
    }
    rgb = toLinearRgb(low)
  }
  return '#' + rgb.map(value => {
    const linear = Math.max(0, Math.min(1, value))
    const srgb = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
    return Math.round(srgb * 255).toString(16).padStart(2, '0')
  }).join('')
}
