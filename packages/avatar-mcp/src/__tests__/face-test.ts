import {
  createAvatarFromSpec,
  describeAvatar,
  editAvatarDefinition,
  type AvatarSpec,
} from '../authoring'
import { renderAvatarSvg } from '../svg'

const kitten: AvatarSpec = {
  name: 'Kitten',
  colors: { body: '#ffd0ad', eyes: '#3a2431' },
  face: {
    mouth: { thickness: 3, x: 0, y: 48, width: 22, curve: 4, cat: 1, color: '#A35' },
    whiskers: { count: 2, thickness: 2, x: 70, y: 40, length: 40, color: '#123456' },
  },
  behavior: {
    include: 'none',
    customExpressions: {
      giggle: { mouth: { curve: 8, open: 6 }, whiskers: { angle: 10 } },
      'giggle-again': { basedOn: 'giggle', mouth: { open: 9 } },
      calm: { basedOn: 'giggle', mouth: null, whiskers: null },
    },
  },
}

const create = (spec: AvatarSpec) => {
  const result = createAvatarFromSpec(spec)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

describe('face authoring', () => {
  it('creates a face and expression overrides that inherit through basedOn', () => {
    const definition = create(kitten)
    expect(definition.face).toEqual({
      mouth: { thickness: 3, x: 0, y: 48, width: 22, curve: 4, cat: 1, color: '#aa3355' },
      whiskers: { count: 2, thickness: 2, x: 70, y: 40, length: 40, color: '#123456' },
    })
    expect(definition.expressions.giggle).toMatchObject({
      mouth: { curve: 8, open: 6 },
      whiskers: { angle: 10 },
    })
    expect(definition.expressions['giggle-again']!.mouth).toEqual({ curve: 8, open: 9 })
    expect(definition.expressions.calm!.mouth).toBeUndefined()
    expect(definition.expressions.calm!.whiskers).toBeUndefined()
    expect(describeAvatar(definition).face).toEqual({ mouth: true, whiskers: 2 })
  })

  it('merges, removes and validates face edits atomically', () => {
    const definition = create(kitten)

    const longer = editAvatarDefinition(definition, [
      { op: 'set_face', whiskers: { length: 52, color: '#fff' } },
    ])
    if (!longer.ok) throw new Error(JSON.stringify(longer.errors))
    expect(longer.value.face!.whiskers).toMatchObject({ count: 2, length: 52, color: '#ffffff' })
    expect(describeAvatar(longer.value)).not.toHaveProperty('warnings')
    expect(longer.value.face!.mouth).toEqual(definition.face!.mouth)

    const noWhiskers = editAvatarDefinition(definition, [{ op: 'set_face', whiskers: null }])
    if (!noWhiskers.ok) throw new Error(JSON.stringify(noWhiskers.errors))
    expect(noWhiskers.value.face).toEqual({ mouth: definition.face!.mouth })

    const bare = editAvatarDefinition(definition, [{ op: 'set_face', mouth: null, whiskers: null }])
    if (!bare.ok) throw new Error(JSON.stringify(bare.errors))
    expect('face' in bare.value).toBe(false)

    expect(describeAvatar(bare.value).warnings).toEqual([
      'Expressions giggle, giggle-again override the mouth, but the avatar has no face.mouth, so nothing is drawn; add one with set_face or remove the overrides',
      'Expressions giggle, giggle-again override the whiskers, but the avatar has no face.whiskers, so nothing is drawn; add one with set_face or remove the overrides',
    ])

    const incomplete = editAvatarDefinition(bare.value, [{ op: 'set_face', mouth: { width: 20 } }])
    expect(incomplete).toEqual({
      ok: false,
      errors: [
        {
          path: '/operations/0/mouth',
          code: 'missing_face_fields',
          message:
            'A new mouth needs thickness, x, y, width and curve; missing thickness, x, y, curve',
        },
      ],
    })
    const emptyWhiskers = createAvatarFromSpec({ face: { whiskers: {} } })
    expect(emptyWhiskers.ok).toBe(false)
    if (emptyWhiskers.ok) return
    expect(emptyWhiskers.errors[0]).toMatchObject({
      path: '/face/whiskers',
      code: 'missing_face_fields',
    })

    const override = editAvatarDefinition(definition, [
      { op: 'upsert_expression', key: 'giggle', expression: { mouth: { tilt: -10 } } },
    ])
    if (!override.ok) throw new Error(JSON.stringify(override.errors))
    expect(override.value.expressions.giggle!.mouth).toEqual({ curve: 8, open: 6, tilt: -10 })
  })

  it('renders the mouth with the eyes and whiskers in front of the face', () => {
    const definition = create(kitten)
    const svg = renderAvatarSvg(definition, { expression: 'giggle' })
    const mouths = svg.match(/fill="#aa3355"/g) ?? []
    expect(mouths).toHaveLength(3)
    expect(svg.match(/fill="#123456"/g)).toHaveLength(4)
    // The mouth sits in the clipped eye group, after the eyes; the whiskers come after every
    // other shape, so they are drawn on top of the face.
    const eyesEnd = svg.indexOf('</g>', svg.indexOf('clip-path='))
    expect(svg.lastIndexOf('fill="#3a2431"', eyesEnd)).toBeLessThan(svg.indexOf('fill="#aa3355"'))
    expect(svg.lastIndexOf('fill="#aa3355"')).toBeLessThan(eyesEnd)
    expect(svg.indexOf('fill="#123456"')).toBeGreaterThan(eyesEnd)
    expect(svg.indexOf('fill="#123456"')).toBeGreaterThan(svg.lastIndexOf('fill="#ffd0ad"'))
  })
})
