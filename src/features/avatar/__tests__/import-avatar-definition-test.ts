import { type AvatarDefinition } from '@bible-strong/avatar-core'
import { describe, expect, it } from 'vitest'

import strobi from '../../../../examples/react-vite-consumer/src/strobi.avatar.json'
import { NEUTRAL_EXPRESSION_ID } from '../../animation/sequences'
import { createAvatarDefinition } from '../avatarDefinition'
import {
  isAvatarDefinitionSource,
  studioAvatarFromDefinition,
  studioAvatarFromDefinitionSource,
} from '../importAvatarDefinition'

describe('studioAvatarFromDefinition', () => {
  it('recognises a definition and rejects a studio project', () => {
    expect(isAvatarDefinitionSource(strobi)).toBe(true)
    expect(isAvatarDefinitionSource({ version: 2, library: { avatars: [] } })).toBe(false)
    expect(isAvatarDefinitionSource(null)).toBe(false)
  })

  it('rejects a file that is not a valid definition', () => {
    expect(() => studioAvatarFromDefinition({ schema: 'bible-strong/avatar-definition' })).toThrow()
  })

  it('imports a definition with a mouth and whiskers, leaving the face behind', () => {
    const withFace = {
      ...structuredClone(strobi),
      face: {
        mouth: { thickness: 3, x: 0, y: 48, width: 22, curve: 4, cat: 1 },
        whiskers: { count: 2, thickness: 2, x: 70, y: 40, length: 40 },
      },
      expressions: {
        ...structuredClone(strobi.expressions),
        'joyful-wide': { ...strobi.expressions['joyful-wide'], mouth: { open: 8 } },
      },
    }
    const { avatar, expressions, sequences } = studioAvatarFromDefinition(withFace)
    const result = createAvatarDefinition({ avatar, behavior: { expressions, sequences } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('face' in result.value).toBe(false)
    expect(result.value.expressions['joyful-wide']).not.toHaveProperty('mouth')
    expect(result.value.expressionOrder).toEqual(strobi.expressionOrder)
  })

  it('drops per-node colors on import and keeps the node geometry', () => {
    const withNodeColor = {
      ...structuredClone(strobi),
      body: {
        ...structuredClone(strobi.body),
        nodes: [
          {
            surface: { type: 'capsule', width: 40, height: 110, depth: 26, roundness: 1 },
            position: [-34, -120, -14],
            rotation: [0, 0, 0],
            color: '#ff88aa',
          },
        ],
      },
    }
    const { avatar, expressions, sequences } = studioAvatarFromDefinition(withNodeColor)
    expect(avatar.body.nodes).toHaveLength(1)
    const result = createAvatarDefinition({ avatar, behavior: { expressions, sequences } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.body.nodes[0]).not.toHaveProperty('color')
    expect(result.value.body.nodes[0]!.surface.type).toBe('capsule')
  })

  it('round-trips back to the same definition', () => {
    const { avatar, expressions, sequences } = studioAvatarFromDefinition(strobi)

    expect(avatar.name).toBe(strobi.name)
    expect(avatar.colors).toEqual(strobi.colors)
    expect(avatar.body.primary).toEqual(strobi.body.primary)
    expect(avatar.body.nodes).toHaveLength(strobi.body.nodes.length)
    // `neutral` becomes the avatar's eye defaults rather than an expression.
    expect(expressions).toHaveLength(strobi.expressionOrder.length - 1)
    expect(expressions.map(e => e.semanticKey)).not.toContain('neutral')
    expect(sequences).toHaveLength(strobi.animationOrder.length)

    // Eye defaults are taken from `neutral`, the resting pose.
    expect(avatar.eyes.spacing).toBe(strobi.expressions.neutral.eyes.spacing)

    const result = createAvatarDefinition({ avatar, behavior: { expressions, sequences } })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.body).toEqual(strobi.body)
    expect(result.value.colors).toEqual(strobi.colors)
    expect(result.value.expressionOrder).toEqual(strobi.expressionOrder)
    expect(result.value.animationOrder).toEqual(strobi.animationOrder)
    expect(result.value.expressions).toEqual(strobi.expressions)
    expect(result.value.animations).toEqual(strobi.animations)
  })

  it('inverts customized neutral eyes instead of applying them twice', () => {
    const customized = structuredClone(strobi) as AvatarDefinition
    Object.values(customized.expressions).forEach(item => {
      item.eyes.left.width += 10
      item.eyes.right.width += 10
      item.eyes.spacing += 6
      item.eyes.left.y -= 4
      item.eyes.right.y -= 4
    })

    const imported = studioAvatarFromDefinition(customized)
    const result = createAvatarDefinition({
      avatar: imported.avatar,
      behavior: { expressions: imported.expressions, sequences: imported.sequences },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.expressions.neutral).toEqual(customized.expressions.neutral)
    Object.keys(customized.expressions).forEach(key => {
      expect(result.value.expressions[key].eyes.left.width).toBeCloseTo(
        customized.expressions[key].eyes.left.width,
        10
      )
      expect(result.value.expressions[key].eyes.spacing).toBeCloseTo(
        customized.expressions[key].eyes.spacing,
        10
      )
      expect(result.value.expressions[key].eyes.left.y).toBeCloseTo(
        customized.expressions[key].eyes.left.y,
        10
      )
    })
  })

  it('preserves animation steps targeting the neutral appearance', () => {
    const customized = structuredClone(strobi) as AvatarDefinition
    customized.animations.sleeping.steps[0].expression = 'neutral'

    const imported = studioAvatarFromDefinition(customized)
    const sleeping = imported.sequences.find(sequence => sequence.semanticKey === 'sleeping')
    expect(sleeping?.steps[0].expressionId).toBe(NEUTRAL_EXPRESSION_ID)

    const result = createAvatarDefinition({
      avatar: imported.avatar,
      behavior: { expressions: imported.expressions, sequences: imported.sequences },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.animations.sleeping).toEqual(customized.animations.sleeping)
  })

  it('creates unique Studio ids for repeated imports', () => {
    const first = studioAvatarFromDefinition(strobi)
    const second = studioAvatarFromDefinition(strobi)

    expect(first.avatar.id).not.toBe(second.avatar.id)
    expect(first.expressions[0].id).not.toBe(second.expressions[0].id)
    expect(first.sequences[0].id).not.toBe(second.sequences[0].id)
  })

  it('rejects neutral properties that the Studio cannot represent', () => {
    const customized = structuredClone(strobi) as AvatarDefinition
    customized.expressions.neutral.head.x = 1

    expect(() => studioAvatarFromDefinition(customized)).toThrow(
      'The neutral expression must use zero head rotation'
    )
  })

  it('rejects eye dimensions that the Studio would clamp during re-export', () => {
    const customized = structuredClone(strobi) as AvatarDefinition
    customized.expressions['upward-side-glance'].eyes.left.width = 9

    expect(() => studioAvatarFromDefinition(customized)).toThrow(
      'uses an eye dimension below the Studio minimum of 10'
    )
  })

  it('uses bounded parsing for untrusted definition text', () => {
    expect(() => studioAvatarFromDefinitionSource('{')).toThrow('Unterminated object')
    expect(() =>
      studioAvatarFromDefinitionSource(JSON.stringify({ ...strobi, schemaVersion: 2 }))
    ).toThrow()

    const duplicateKey = JSON.stringify(strobi).replace(
      '"schemaVersion":1',
      '"schemaVersion":1,"schemaVersion":1'
    )
    expect(() => studioAvatarFromDefinitionSource(duplicateKey)).toThrow('Duplicate object member')
    expect(() => studioAvatarFromDefinitionSource(' '.repeat(262_145))).toThrow(
      'JSON input exceeds'
    )
  })
})
