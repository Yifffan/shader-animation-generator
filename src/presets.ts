import type { ShaderGradientProps } from './components/ShaderGradient'

export type ShaderPreset = Omit<ShaderGradientProps, 'className' | 'style' | 'firstFrameOnly' | 'onError'>
export type ShaderParameters = Required<ShaderPreset>

export const DEFAULT_PARAMETERS: ShaderParameters = {
  type: 'pattern', colors: ['#2E58A4', '#AED5F3', '#FFFFFF'], grain: 0, speed: 30,
  shape: 'checks', shapeScale: 10, rotation: 0, proportion: 50, softness: 100,
  distortion: 7, swirl: 21, swirlIterations: 12, scale: 0.3, offsetX: 0, offsetY: 0,
  lightX: 0.89, lightY: 0.46, lightCore: 0.14, lightHalo: 0.2, bottomFade: 0, vignette: 0.38,
  bloomThreshold: 0.61, bloomRange: 0.18, bloomStrength: 0.4,
}

// A deep-blue and warm-gold fluid palette with soft light and bloom.
export const FLOWLIGHT_PRESET: ShaderParameters = {
  type: 'flowlight',
  colors: ['#000000', '#000000', '#204a7e', '#ccac66', '#000000'],
  grain: 0.005,
  speed: 56,
  shape: 'checks',
  shapeScale: 0,
  rotation: 15,
  proportion: 60,
  softness: 80,
  distortion: 18,
  swirl: 20,
  swirlIterations: 12,
  scale: 1.64,
  offsetX: -124,
  offsetY: -48,
  lightX: 0.89,
  lightY: 0.46,
  lightCore: 0.14,
  lightHalo: 0.2,
  bottomFade: 0,
  vignette: 0.38,
  bloomThreshold: 0.61,
  bloomRange: 0.18,
  bloomStrength: 0.4,
}

export const SHADER_PRESET_CLOUD_WHITE: ShaderPreset = {
  type: 'pattern',
  colors: ['#8AA3D6', '#FFFFFF', '#FFFFFF'],
  grain: 0,
  speed: 14,
  distortion: 20,
  swirl: 12,
  swirlIterations: 8,
  scale: 0.78,
  rotation: -5,
  proportion: 50,
  softness: 100,
  shape: 'checks',
  shapeScale: 10,
  offsetX: 0,
  offsetY: 65,
}

export const SHADER_PRESET_PORCELAIN_BLUE: ShaderPreset = {
  colors: ['#2E58A4', '#AED5F3', '#FFFFFF'],
  grain: 0,
  speed: 20,
  shape: 'checks',
  shapeScale: 10,
  rotation: -5,
  proportion: 50,
  softness: 100,
  distortion: 24,
  swirl: 16,
  swirlIterations: 8,
  scale: 0.5,
  offsetX: 0,
  offsetY: 96,
}

export const SHADER_PRESET_MIDNIGHT_BLUE: ShaderPreset = {
  colors: ['#2E58A4', '#AED5F3', '#000000'],
  grain: 0,
  speed: 24,
  shape: 'checks',
  shapeScale: 10,
  rotation: 12,
  proportion: 47,
  softness: 90,
  distortion: 6,
  swirl: 14,
  swirlIterations: 12,
  scale: 0.32,
  offsetX: 1,
  offsetY: 40,
}

export const SHADER_PRESET_GLACIER: ShaderPreset = {
  type: 'fluid',
  colors: ['#050A1A', '#0A172E', '#1A3859', '#2D5973', '#081224'],
  grain: 0.004,
  speed: 100,
  scale: 2.5,
  shapeScale: 0,
}

export const SHADER_PRESETS: Record<string, ShaderPreset> = {
  'Abyss Blue': { ...FLOWLIGHT_PRESET, colors: ['#03080f', '#102038', '#345780', '#a4b0b4', '#070b12'], scale: 2.2, offsetX: -100, offsetY: -30, grain: 0.006, speed: 10, lightCore: 0.03, lightHalo: 0.05, vignette: 0.58, bottomFade: 0.88, bloomStrength: 0.12 },
  'Cloud White': SHADER_PRESET_CLOUD_WHITE,
  'Porcelain Blue': SHADER_PRESET_PORCELAIN_BLUE,
  'Midnight Blue': SHADER_PRESET_MIDNIGHT_BLUE,
  Flowlight: FLOWLIGHT_PRESET,
  'Blue Haze': { ...FLOWLIGHT_PRESET, colors: ['#ffffff', '#edf1f5', '#73a2dd', '#ffffff', '#b5d5f6'], scale: 2, offsetX: -76, offsetY: -35, grain: 0.002, speed: 12, lightCore: 0.02, lightHalo: 0.04, vignette: 0.04, bloomStrength: 0.08 },
  'Silver Tide': { ...FLOWLIGHT_PRESET, colors: ['#ecf0f5', '#adc2dd', '#5d87b8', '#ffffff', '#bcd5ef'], scale: 2, offsetX: 62, offsetY: -105, grain: 0.002, speed: 15, lightCore: 0.04, lightHalo: 0.02, vignette: 0.08, bloomStrength: 0.12 },
  'Velvet Night': { ...FLOWLIGHT_PRESET, colors: ['#03050b', '#101e32', '#244365', '#718398', '#05070d'], scale: 2, offsetX: 40, offsetY: -140, grain: 0.01, speed: 14, lightCore: 0.02, lightHalo: 0.04, vignette: 0.65, bottomFade: 0.95, bloomStrength: 0.09 },
  Glacier: SHADER_PRESET_GLACIER,
  'Starry Night': { type: 'fluid', colors: ['#0F1A47', '#1F3880', '#2E598C', '#BF9C40', '#475E38'], grain: 0.004, speed: 80, scale: 2.5, shapeScale: 0 },
  'Ocean Foam': { type: 'fluid', colors: ['#1A6B94', '#389AB8', '#D9EBF5', '#144D73', '#73BFD1'], grain: 0.004, speed: 100, scale: 2.5, shapeScale: 0 },
  Saturn: { type: 'fluid', colors: ['#080F1A', '#1F2E3D', '#59808C', '#8C9E99', '#141F29'], grain: 0.004, speed: 70, scale: 2.5, shapeScale: 0 },
  Mist: { type: 'fluid', colors: ['#D9E0EB', '#8CA6D1', '#4D80CC', '#B8C7E0', '#7394D9'], grain: 0.004, speed: 90, scale: 2.5, shapeScale: 0 },
}
