import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createAvatarDefinition } from '@/features/avatar/avatarDefinition'
import { resolveAvatarBehavior } from '@/features/avatar/avatars'
import { loadStudioDocument } from '@/features/studio/studioDocument'

import {
  createAvatarFromSpec,
  editAvatarDefinition,
  generateAvatarVariations,
  type AvatarSpec,
} from '../authoring'
import { characterTemplates } from '../templates'

/** Rounds numbers so float noise from re-applying eye offsets does not matter. */
const rounded = (value: unknown): unknown =>
  typeof value === 'number'
    ? Math.round(value * 1e9) / 1e9
    : Array.isArray(value)
      ? value.map(rounded)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)]))
        : value

const create = (spec: AvatarSpec) => {
  const result = createAvatarFromSpec(spec)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

describe('character templates', () => {
  it('reproduces every bundled Studio avatar export exactly', () => {
    const document = loadStudioDocument({ getItem: () => null })
    expect(characterTemplates.map(template => template.studioId)).toEqual(
      document.library.avatars.map(avatar => avatar.id)
    )
    characterTemplates.forEach(template => {
      const avatar = document.library.avatars.find(candidate => candidate.id === template.studioId)!
      const behavior = resolveAvatarBehavior(avatar, {
        expressions: document.expressions,
        sequences: document.sequences,
      })
      const studio = createAvatarDefinition({ avatar, behavior })
      if (!studio.ok) throw new Error(studio.errors[0]?.message)
      expect(rounded(create({ name: avatar.name, template: template.key }))).toEqual(
        rounded(studio.value)
      )
    })
  })

  it('keeps the bundled base library identical to the consumer fixture', async () => {
    const fixture = JSON.parse(
      await readFile(resolve('examples/react-vite-consumer/src/strobi.avatar.json'), 'utf8')
    )
    const base = JSON.parse(
      await readFile(resolve('packages/avatar-mcp/src/templates/base.avatar.json'), 'utf8')
    )
    expect(base).toEqual(fixture)
  })
})

describe('createAvatarFromSpec', () => {
  it('resolves surface presets, body nodes and short colors', () => {
    const definition = create({
      name: 'Bolt',
      colors: { body: '#F80', eyes: '#fff' },
      body: {
        primary: { type: 'cube', roundness: 0.6 },
        nodes: [{ surface: 'cone', position: [0, -130, -10] }],
      },
      behavior: { include: 'none' },
    })
    expect(definition.colors).toEqual({ body: '#ff8800', eyes: '#ffffff' })
    expect(definition.body.primary).toEqual({
      type: 'cube',
      width: 245,
      height: 245,
      depth: 220,
      roundness: 0.6,
    })
    expect(definition.body.nodes[0]).toMatchObject({
      surface: { type: 'cone', tipRoundness: 0.55 },
      position: [0, -130, -10],
      rotation: [0, 0, 0],
    })
    expect(definition.expressionOrder).toEqual(['neutral'])
    expect(definition.animationOrder).toEqual([])
  })

  it('inherits a bundled animation subset together with its expressions', () => {
    const definition = create({ behavior: { animations: ['idle'] } })
    expect(definition.animationOrder).toEqual(['idle'])
    expect(definition.expressionOrder).toEqual(['neutral', 'upward-side-glance', 'curious-left'])
  })

  it('shifts inherited expressions with the neutral eyes', () => {
    const base = create({ behavior: { expressions: ['joyful-wide'] } })
    const taller = create({
      neutralEyes: { height: 70, left: { angle: 5 } },
      behavior: { expressions: ['joyful-wide'] },
    })
    expect(taller.expressions.neutral.eyes.left).toMatchObject({ height: 70, angle: 5 })
    expect(taller.expressions['joyful-wide']!.eyes.left.height).toBeCloseTo(
      base.expressions['joyful-wide']!.eyes.left.height + 20
    )
    expect(taller.expressions['joyful-wide']!.eyes.right.angle).toBe(
      base.expressions['joyful-wide']!.eyes.right.angle
    )
  })

  it('builds custom expressions and pulls bundled expressions used by custom animations', () => {
    const definition = create({
      behavior: {
        include: 'none',
        customExpressions: {
          wink: { eyes: { left: { height: 12 } }, motion: { eyes: 'microSaccades' } },
          blush: { basedOn: 'joyful-wide', colors: { body: '#ff99aa' } },
        },
        customAnimations: {
          greet: {
            steps: [{ expression: 'wink' }, { expression: 'surprised-left', holdMs: 900 }],
            playbackMode: 'once',
            label: 'Greet',
          },
        },
      },
    })
    expect(definition.expressionOrder).toEqual(['neutral', 'wink', 'blush', 'surprised-left'])
    expect(definition.expressions.wink!.eyes.left.height).toBe(12)
    expect(definition.expressions.wink!.eyes.right.height).toBe(50)
    expect(definition.expressions.blush!.colors).toEqual({ body: '#ff99aa' })
    expect(definition.animations.greet).toMatchObject({
      playbackMode: 'once',
      steps: [
        { expression: 'wink', holdMs: 1600, transitionMs: 420, transition: 'smooth' },
        { expression: 'surprised-left', holdMs: 900 },
      ],
      blink: { enabled: true },
      metadata: { label: 'Greet' },
    })
  })

  it('reports actionable errors', () => {
    const unknownTemplate = createAvatarFromSpec({ template: 'dragon' })
    expect(unknownTemplate.ok).toBe(false)
    if (!unknownTemplate.ok) expect(unknownTemplate.errors[0]?.code).toBe('unknown_template')

    const badKey = createAvatarFromSpec({ behavior: { customExpressions: { Happy: {} } } })
    if (badKey.ok) throw new Error('Expected invalid key')
    expect(badKey.errors[0]).toMatchObject({ code: 'invalid_semantic_key' })

    const missing = createAvatarFromSpec({
      behavior: { customAnimations: { loop: { steps: [{ expression: 'nope' }] } } },
    })
    if (missing.ok) throw new Error('Expected unknown expression')
    expect(missing.errors[0]).toMatchObject({ code: 'unknown_expression' })

    const nodeSurface = createAvatarFromSpec({ body: { nodes: [{ surface: 'mickey' }] } })
    if (nodeSurface.ok) throw new Error('Expected invalid node surface')
    expect(nodeSurface.errors[0]).toMatchObject({ code: 'invalid_node_surface' })
  })
})

describe('editAvatarDefinition', () => {
  const base = create({ name: 'Edit me', behavior: { animations: ['idle'] } })

  it('applies operations in order and validates the result', () => {
    const result = editAvatarDefinition(base, [
      { op: 'set_name', name: 'Edited' },
      { op: 'set_colors', body: '#123456' },
      { op: 'add_body_node', node: { surface: 'sphere', position: [80, -90, -10] } },
      { op: 'upsert_expression', key: 'focused', expression: { eyes: { height: 30 } } },
      {
        op: 'upsert_animation',
        key: 'focus',
        animation: { steps: [{ expression: 'focused' }, { expression: 'eyes-closed' }] },
      },
      { op: 'reorder_animations', order: ['focus'] },
    ])
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    expect(result.value.name).toBe('Edited')
    expect(result.value.colors.body).toBe('#123456')
    expect(result.value.body.nodes).toHaveLength(1)
    expect(result.value.expressionOrder.slice(-2)).toEqual(['focused', 'eyes-closed'])
    expect(result.value.animationOrder).toEqual(['focus', 'idle'])
  })

  it('shifts every expression when the neutral eyes move', () => {
    const result = editAvatarDefinition(base, [{ op: 'set_neutral_eyes', eyes: { y: 3 } }])
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    expect(result.value.expressions.neutral.eyes.left.y).toBe(3)
    expect(result.value.expressions['curious-left']!.eyes.left.y).toBeCloseTo(
      base.expressions['curious-left']!.eyes.left.y + 10
    )
  })

  it('rebuilds bundled expressions instead of shifting eyes clamped to the minimum size', () => {
    // Short neutral eyes clamp closed and squinting eyes to the minimum height. Growing them back
    // must close those eyes like a fresh avatar does, not leave them half open.
    const short = create({
      template: 'nova',
      neutralEyes: { height: 26 },
      behavior: { customExpressions: { peek: { eyes: { height: 30 } } } },
    })
    const grown = editAvatarDefinition(short, [{ op: 'set_neutral_eyes', eyes: { height: 46 } }])
    if (!grown.ok) throw new Error(JSON.stringify(grown.errors))
    const { peek, ...bundled } = grown.value.expressions
    const fresh = create({ template: 'nova' }).expressions
    expect(rounded(bundled)).toEqual(rounded(fresh))
    expect(fresh['eyes-closed']!.eyes.left.height).toBeLessThan(12)
    // Custom expressions still move by the same delta.
    expect(peek!.eyes.left.height).toBeCloseTo(50)
  })

  it('is atomic and protects referenced expressions', () => {
    const result = editAvatarDefinition(base, [
      { op: 'set_name', name: 'Never applied' },
      { op: 'remove_expression', key: 'curious-left' },
    ])
    if (result.ok) throw new Error('Expected failure')
    expect(result.errors[0]).toMatchObject({ code: 'expression_in_use', path: '/operations/1/key' })
    expect(base.name).toBe('Edit me')
  })
})

describe('generateAvatarVariations', () => {
  it('is deterministic for a seed and produces valid avatars', () => {
    const first = generateAvatarVariations({ count: 8, seed: 42, namePrefix: 'Bot' })
    expect(generateAvatarVariations({ count: 8, seed: 42, namePrefix: 'Bot' })).toEqual(first)
    expect(new Set(first.map(spec => spec.colors?.body)).size).toBe(8)
    first.forEach(spec => expect(createAvatarFromSpec(spec).ok).toBe(true))
    expect(first[0]?.name).toBe('Bot 1')
  })
})
