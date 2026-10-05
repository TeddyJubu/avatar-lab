import type { AvatarColorsDefinition, HexColor } from '@bible-strong/avatar-core'

/**
 * Palette-matched colors for the Base behavior library's two mood expressions.
 *
 * The library tints every avatar's fur the same dark red when angry (with darker red eyes) and the
 * same pale blue when uneasy, whatever the avatar's own colors. These helpers derive both moods
 * from the avatar's fur instead and keep its normal eyes readable on them.
 */
export const MOOD_EXPRESSION_KEYS = ['angry-brows', 'uneasy-left'] as const
export type MoodExpressionKey = (typeof MOOD_EXPRESSION_KEYS)[number]

/** Eyes stay at least this readable (WCAG contrast) on each mood color. */
export const MIN_MOOD_EYE_CONTRAST = 4.5

// --- Color math ----------------------------------------------------------------------------------

type Oklch = { L: number; C: number; h: number }
type Triple = [number, number, number]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

const hexToRgb = (hex: string): Triple => {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map(c => c + c).join('') : value.slice(0, 6)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as Triple
}

const rgbToHex = (rgb: readonly number[]): HexColor =>
  `#${rgb
    .map(v =>
      Math.round(clamp01(v) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Triple
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors (1 to 21). */
export const contrastRatio = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

const rgbToOklab = (rgb: Triple): Triple => {
  const [r, g, b] = rgb.map(toLinear) as Triple
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const oklabToLinear = ([L, a, b]: Triple): Triple => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (linear: Triple) => linear.every(v => v >= -1e-4 && v <= 1 + 1e-4)

const hexToOklch = (hex: string): Oklch => {
  const [L, a, b] = rgbToOklab(hexToRgb(hex))
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

/** OKLCH to hex, reducing chroma until the color fits in sRGB. */
const oklchToHex = ({ L, C, h }: Oklch): HexColor => {
  const rad = (h * Math.PI) / 180
  const lab = (c: number): Triple => [L, c * Math.cos(rad), c * Math.sin(rad)]
  let low = 0
  let high = Math.max(0, C)
  if (!inGamut(oklabToLinear(lab(high)))) {
    for (let i = 0; i < 30; i += 1) {
      const mid = (low + high) / 2
      if (inGamut(oklabToLinear(lab(mid)))) low = mid
      else high = mid
    }
    high = low
  }
  return rgbToHex(oklabToLinear(lab(high)).map(v => toGamma(clamp01(v))))
}

/** Mixes two colors in OKLab. */
const mix = (from: string, to: string, amount: number) => {
  const a = rgbToOklab(hexToRgb(from))
  const b = rgbToOklab(hexToRgb(to))
  const [L, A, B] = a.map((v, i) => v + (b[i]! - v) * amount) as Triple
  return oklchToHex({ L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 })
}

const oklab = (hex: string): Triple => {
  const { L, C, h } = hexToOklch(hex)
  const rad = (h * Math.PI) / 180
  return [L, C * Math.cos(rad), C * Math.sin(rad)]
}

const deltaE = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

// --- Mood shades ---------------------------------------------------------------------------------

/**
 * How far (in OKLab) the hand-tuned Kitty avatar's furious and pale tints sit from her fur. Other
 * coats move the same distance toward their own targets, so every mood reads equally strongly.
 */
const FURIOUS_DISTANCE = 0.11600268287856502
const PALE_DISTANCE = 0.05248381042325547

/** Moves `body` toward `target` by `distance` (halved on dark coats, where shifts read stronger). */
const toward = (body: string, target: string, distance: number) => {
  const span = deltaE(body, target)
  const strength = hexToOklch(body).L < 0.5 ? 0.5 : 1
  return mix(body, target, span === 0 ? 0 : Math.min(1, (distance * strength) / span))
}

const furious = (body: string) => {
  const { L, C } = hexToOklch(body)
  const target =
    L < 0.5
      ? oklchToHex({ L: L + 0.06, C: 0.09, h: 30 })
      : oklchToHex({ L: L - 0.1, C: Math.max(0.125, C * 1.05), h: 30 })
  return toward(body, target, FURIOUS_DISTANCE)
}

const pale = (body: string) => {
  const { L, C, h } = hexToOklch(body)
  const target = oklchToHex({ L: Math.min(0.99, L + (L < 0.5 ? 0.12 : 0.06)), C: C * 0.25, h })
  return toward(body, target, PALE_DISTANCE)
}

/**
 * Raw mood shades for a fur color.
 * - angry: warm coats (within 90° of red-orange) flush toward red-orange, cool coats deepen
 *   their own hue, grey coats turn stormy and near-black coats glow dark maroon.
 * - uneasy: a paler, greyer version of the fur. Light coats wash out toward grey instead of
 *   getting paler, so they never fade into a light background.
 */
const moodShades = (body: string): Record<MoodExpressionKey, HexColor> => {
  const { L, C, h } = hexToOklch(body)
  if (L < 0.25) {
    return {
      'angry-brows': oklchToHex({ L: L + 0.2, C: 0.1, h: 25 }),
      'uneasy-left': oklchToHex({ L: L + 0.24, C: Math.min(C, 0.01), h: C < 0.02 ? 260 : h }),
    }
  }
  if (C < 0.03) {
    return {
      'angry-brows': oklchToHex({ L: L - 0.16, C: 0.025, h: 255 }),
      'uneasy-left': L >= 0.8 ? oklchToHex({ L: L - 0.035, C: 0.012, h: 250 }) : pale(body),
    }
  }
  return {
    'angry-brows':
      hueDistance(h, 30) <= 90 ? furious(body) : oklchToHex({ L: L - 0.1, C: C * 1.15, h }),
    'uneasy-left': L >= 0.8 ? oklchToHex({ L: L - 0.035, C: C * 0.45, h }) : pale(body),
  }
}

/**
 * Fur colors for the angry and uneasy expressions, derived from an avatar's own colors. The eyes
 * keep their normal color and stay at least MIN_MOOD_EYE_CONTRAST readable on each mood.
 */
export const matchedMoodColors = (
  colors: Readonly<AvatarColorsDefinition>
): Record<MoodExpressionKey, HexColor> => {
  const { body, eyes } = colors
  const fur = hexToOklch(body)
  const eyesAreDark = hexToOklch(eyes).L < fur.L
  /** Nudges lightness away from the eyes until they stay readable. */
  const readable = (shade: HexColor) => {
    let color = shade
    const start = hexToOklch(shade)
    for (
      let step = 1;
      step <= 100 && contrastRatio(color, eyes) < MIN_MOOD_EYE_CONTRAST + 0.2;
      step += 1
    ) {
      color = oklchToHex({ ...start, L: clamp01(start.L + (eyesAreDark ? 1 : -1) * 0.005 * step) })
    }
    return color
  }
  const shades = moodShades(body)
  let angry = readable(shades['angry-brows'])
  // When the eyes leave no room to change lightness, shift hue and saturation instead. Warm coats
  // stay red or orange; cool coats may lean either way.
  if (deltaE(body, angry) < 0.06 && fur.C >= 0.03) {
    const turns =
      hueDistance(fur.h, 30) <= 90
        ? [0, Math.sign(((30 - fur.h + 540) % 360) - 180 || 1) * 20]
        : [-25, 25]
    const best = turns
      .map(turn =>
        readable(
          oklchToHex({ L: fur.L, C: Math.max(fur.C * 1.45, 0.12), h: (fur.h + turn + 360) % 360 })
        )
      )
      .sort((a, b) => deltaE(body, b) - deltaE(body, a))[0]!
    if (deltaE(body, best) > deltaE(body, angry)) angry = best
  }
  return { 'angry-brows': angry, 'uneasy-left': readable(shades['uneasy-left']) }
}
