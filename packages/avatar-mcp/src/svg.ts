import {
  advanceAvatarPlayback,
  playAvatarAnimation,
  renderAvatarDefinition,
  renderAvatarFrame,
  type AvatarDefinition,
  type AvatarRuntimeEnvironment,
  type AvatarScene,
} from '@bible-strong/avatar-core'

export type SvgBackground =
  | { type: 'transparent' }
  | { type: 'solid'; color: string }
  | { type: 'linear' | 'radial'; from: string; to: string }

export type RenderAvatarSvgOptions = {
  expression?: string
  /** Render a frame of this animation instead of a static expression. */
  animation?: string
  /** Animation time in milliseconds; ignored without `animation`. */
  atMs?: number
  size?: number
  background?: SvgBackground
  /** Uniform zoom around the canvas center; values below 1 leave room for wide bodies. */
  scale?: number
}

const VIEWBOX = '-150 -150 300 300'
const PLAYBACK_STEP_MS = 50
const deterministicEnvironment: AvatarRuntimeEnvironment = {
  random: () => 0.5,
  reduceMotion: false,
}

let clipCounter = 0

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)

const safeColor = (value: string) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : '#000000')

const pathMarkup = (d: string, fill: string, opacity = 1) =>
  d
    ? `<path d="${escapeXml(d)}" fill="${safeColor(fill)}"${opacity === 1 ? '' : ` opacity="${opacity}"`}/>`
    : ''

const sceneFor = (
  definition: Readonly<AvatarDefinition>,
  { expression, animation, atMs = 0 }: RenderAvatarSvgOptions
): AvatarScene => {
  if (!animation) return renderAvatarDefinition(definition, expression ?? 'neutral')
  const started = playAvatarAnimation(definition, animation, 0)
  if (!started.ok) throw new Error(started.error.message)
  let state = started.value
  for (let now = PLAYBACK_STEP_MS; now <= atMs; now += PLAYBACK_STEP_MS) {
    state = advanceAvatarPlayback(definition, state, now, deterministicEnvironment)
  }
  return renderAvatarFrame(definition, state, atMs, deterministicEnvironment)
}

/** Avatar shapes as an SVG group positioned in the -150..150 avatar coordinate space. */
export const renderAvatarGroup = (
  definition: Readonly<AvatarDefinition>,
  options: RenderAvatarSvgOptions = {}
) => {
  const scene = sceneFor(definition, options)
  const { geometry, colors } = scene
  const clipId = `avatar-eyes-${++clipCounter}`
  const scale = options.scale ?? 1
  const mouthColor = colors.mouth ?? colors.eyes
  const whiskerColor = colors.whiskers ?? colors.eyes
  return `<g${scale === 1 ? '' : ` transform="scale(${scale})"`}><defs><clipPath id="${clipId}"><path d="${escapeXml(geometry.headPath)}"/></clipPath></defs>${[
    ...geometry.whiskerBackPaths.map(d => pathMarkup(d, whiskerColor)),
    ...geometry.backPaths.map((d, index) =>
      pathMarkup(d, colors.backPaths?.[index] ?? colors.body)
    ),
    pathMarkup(geometry.headPath, colors.body),
    `<g clip-path="url(#${clipId})">${pathMarkup(geometry.leftPath, colors.eyes, geometry.leftVisible ? 1 : 0)}${pathMarkup(geometry.rightPath, colors.eyes, geometry.rightVisible ? 1 : 0)}${geometry.mouthPaths.map(d => pathMarkup(d, mouthColor)).join('')}</g>`,
    ...geometry.frontPaths.map((d, index) =>
      pathMarkup(d, colors.frontPaths?.[index] ?? colors.body)
    ),
    ...geometry.whiskerFrontPaths.map(d => pathMarkup(d, whiskerColor)),
  ].join('')}</g>`
}

const backgroundMarkup = (background: SvgBackground, id: string) => {
  if (background.type === 'transparent') return { defs: '', rect: '' }
  if (background.type === 'solid') {
    return {
      defs: '',
      rect: `<rect x="-150" y="-150" width="300" height="300" fill="${safeColor(background.color)}"/>`,
    }
  }
  const stops = `<stop offset="0" stop-color="${safeColor(background.from)}"/><stop offset="1" stop-color="${safeColor(background.to)}"/>`
  return {
    defs:
      background.type === 'linear'
        ? `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`
        : `<radialGradient id="${id}" cx="50%" cy="42%" r="70%">${stops}</radialGradient>`,
    rect: `<rect x="-150" y="-150" width="300" height="300" fill="url(#${id})"/>`,
  }
}

export const renderAvatarSvg = (
  definition: Readonly<AvatarDefinition>,
  options: RenderAvatarSvgOptions = {}
) => {
  const size = options.size ?? 512
  const background = backgroundMarkup(
    options.background ?? { type: 'transparent' },
    `avatar-background-${++clipCounter}`
  )
  const label = escapeXml(definition.name ?? 'Avatar')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="${size}" height="${size}" role="img" aria-label="${label}">${background.defs ? `<defs>${background.defs}</defs>` : ''}${background.rect}${renderAvatarGroup(definition, options)}</svg>`
}

export type ContactSheetEntry = {
  definition: Readonly<AvatarDefinition>
  label?: string
  options?: RenderAvatarSvgOptions
}

/** A labelled grid of avatars, handy for reviewing a whole set at a glance. */
export const renderContactSheetSvg = (
  entries: readonly ContactSheetEntry[],
  { columns = 4, cellSize = 200, background = '#f4f5f7' } = {}
) => {
  const columnCount = Math.max(1, Math.min(columns, entries.length))
  const rows = Math.ceil(entries.length / columnCount)
  const labelHeight = 28
  const width = columnCount * cellSize
  const height = rows * (cellSize + labelHeight)
  const cells = entries
    .map((entry, index) => {
      const x = (index % columnCount) * cellSize
      const y = Math.floor(index / columnCount) * (cellSize + labelHeight)
      const factor = cellSize / 300
      const label = escapeXml(entry.label ?? entry.definition.name ?? `Avatar ${index + 1}`)
      return `<g transform="translate(${x} ${y})"><g transform="translate(${cellSize / 2} ${cellSize / 2}) scale(${factor * 0.8})">${renderAvatarGroup(entry.definition, entry.options)}</g><text x="${cellSize / 2}" y="${cellSize + 18}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#30343b">${label}</text></g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${safeColor(background)}"/>${cells}</svg>`
}
