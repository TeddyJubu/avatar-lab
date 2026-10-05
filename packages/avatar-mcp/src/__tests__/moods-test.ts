import type { AvatarDefinition, HexColor } from '@bible-strong/avatar-core'

import {
  createAvatarFromSpec,
  editAvatarDefinition,
  type AvatarEditOperation,
  type AvatarSpec,
} from '../authoring'
import {
  contrastRatio,
  matchedMoodColors,
  MIN_MOOD_EYE_CONTRAST,
  MOOD_EXPRESSION_KEYS,
} from '../moods'
import { characterTemplates } from '../templates'

const create = (spec: AvatarSpec) => {
  const result = createAvatarFromSpec(spec)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

const edit = (definition: AvatarDefinition, operations: AvatarEditOperation[]) => {
  const result = editAvatarDefinition(definition, operations)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

const moodTints = (definition: AvatarDefinition) =>
  MOOD_EXPRESSION_KEYS.map(key => definition.expressions[key]?.colors)

const LIBRARY_TINTS = [{ body: '#ba3636', eyes: '#610000' }, { body: '#adc3ff' }]

describe('matchedMoodColors', () => {
  it('derives angry and uneasy tints from each bundled template', () => {
    const derived = Object.fromEntries(
      characterTemplates.map(template => [template.key, matchedMoodColors(template.colors)])
    )
    expect(derived).toEqual({
      strobi: { 'angry-brows': '#8f62ff', 'uneasy-left': '#6e8ad2' },
      freddy: { 'angry-brows': '#ff6c6b', 'uneasy-left': '#da997f' },
      citrus: { 'angry-brows': '#ffab6c', 'uneasy-left': '#dcc88f' },
      nova: { 'angry-brows': '#0499a8', 'uneasy-left': '#89bac1' },
      'grok-bot': { 'angry-brows': '#320002', 'uneasy-left': '#1f1f1f' },
      sunee: { 'angry-brows': '#d16f60', 'uneasy-left': '#dcac86' },
      kirby: { 'angry-brows': '#ffaea6', 'uneasy-left': '#dec3d4' },
      cloudee: { 'angry-brows': '#8f9aa8', 'uneasy-left': '#bac1c7' },
      cubee: { 'angry-brows': '#eb5c00', 'uneasy-left': '#d97572' },
      onee: { 'angry-brows': '#a5b0bf', 'uneasy-left': '#d1d8df' },
    })
  })

  it('keeps readable eyes readable on every mood', () => {
    const channels = ['00', '40', '80', 'bf', 'ff']
    const palette = channels.flatMap(r =>
      channels.flatMap(g => channels.map(b => `#${r}${g}${b}` as HexColor))
    )
    palette.forEach(body => {
      palette
        .filter(eyes => contrastRatio(body, eyes) >= MIN_MOOD_EYE_CONTRAST)
        .forEach(eyes => {
          Object.entries(matchedMoodColors({ body, eyes })).forEach(([key, mood]) => {
            expect(
              contrastRatio(mood, eyes),
              `${key} ${mood} on ${body} with ${eyes} eyes`
            ).toBeGreaterThanOrEqual(MIN_MOOD_EYE_CONTRAST)
          })
        })
    })
  })
})

describe('palette-matched mood authoring', () => {
  it('keeps the library tints unless the spec asks for matched ones', () => {
    const library = create({ template: 'nova' })
    const matched = create({ template: 'nova', moodColors: 'match' })
    expect(moodTints(library)).toEqual(LIBRARY_TINTS)
    expect(moodTints(matched)).toEqual([{ body: '#0499a8' }, { body: '#89bac1' }])

    const withoutTints = (definition: AvatarDefinition) => {
      const copy = structuredClone(definition)
      MOOD_EXPRESSION_KEYS.forEach(key => delete copy.expressions[key]!.colors)
      return copy
    }
    expect(withoutTints(matched)).toEqual(withoutTints(library))
  })

  it('matches custom expressions based on a mood and moods pulled in by animations', () => {
    const definition = create({
      colors: { body: '#e65c5c' },
      moodColors: 'match',
      behavior: {
        include: 'none',
        customExpressions: { fuming: { basedOn: 'angry-brows', head: { z: 6 } } },
        customAnimations: { sulk: { steps: [{ expression: 'uneasy-left' }] } },
      },
    })
    expect(definition.expressions.fuming!.colors).toEqual({ body: '#eb5c00' })
    expect(definition.expressions['uneasy-left']!.colors).toEqual({ body: '#d97572' })

    const pulled = edit(
      create({ moodColors: 'match', behavior: { expressions: ['uneasy-left'] } }),
      [
        {
          op: 'upsert_animation',
          key: 'fume',
          animation: { steps: [{ expression: 'angry-brows' }] },
        },
      ]
    )
    expect(moodTints(pulled)).toEqual([{ body: '#8f62ff' }, { body: '#6e8ad2' }])
  })

  it('lets matched tints follow recolors and leaves library and custom tints alone', () => {
    const recolor: AvatarEditOperation = { op: 'set_colors', body: '#e65c5c' }
    const matched = create({ template: 'strobi', moodColors: 'match' })
    expect(moodTints(edit(matched, [recolor]))).toEqual([{ body: '#eb5c00' }, { body: '#d97572' }])
    expect(moodTints(edit(create({ template: 'strobi' }), [recolor]))).toEqual(LIBRARY_TINTS)
    expect(
      moodTints(
        edit(matched, [
          {
            op: 'upsert_expression',
            key: 'angry-brows',
            expression: { colors: { body: '#123456' } },
          },
          recolor,
        ])
      )
    ).toEqual([{ body: '#123456' }, { body: '#d97572' }])
  })

  it('switches between matched and library tints with set_mood_colors', () => {
    const library = create({ template: 'cubee' })
    const matched = edit(library, [{ op: 'set_mood_colors', mode: 'match' }])
    expect(moodTints(matched)).toEqual([{ body: '#eb5c00' }, { body: '#d97572' }])
    expect(edit(matched, [{ op: 'set_mood_colors', mode: 'library' }])).toEqual(library)
    expect(
      editAvatarDefinition(create({ behavior: { include: 'none' } }), [
        { op: 'set_mood_colors', mode: 'match' },
      ])
    ).toMatchObject({
      ok: false,
      errors: [{ path: '/operations/0/op', code: 'unknown_expression' }],
    })
  })
})
