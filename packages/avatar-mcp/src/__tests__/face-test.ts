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
    whiskers: { count: 2, thickness: 2, x: 70, y: 40, length: 40 },
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
      whiskers: { count: 2, thickness: 2, x: 70, y: 40, length: 40 },
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
    expect(longer.value.face!.mouth).toEqual(definition.face!.mouth)

    const noWhiskers = editAvatarDefinition(definition, [{ op: 'set_face', whiskers: null }])
    if (!noWhiskers.ok) throw new Error(JSON.stringify(noWhiskers.errors))
    expect(noWhiskers.value.face).toEqual({ mouth: definition.face!.mouth })

    const bare = editAvatarDefinition(definition, [{ op: 'set_face', mouth: null, whiskers: null }])
    if (!bare.ok) throw new Error(JSON.stringify(bare.errors))
    expect('face' in bare.value).toBe(false)

    const incomplete = editAvatarDefinition(bare.value, [{ op: 'set_face', mouth: { width: 20 } }])
    expect(incomplete.ok).toBe(false)
    if (incomplete.ok) return
    expect(incomplete.errors.map(error => error.path)).toContain('/face/mouth/thickness')

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
    const whiskers = svg.match(/fill="#3a2431"/g) ?? []
    // Two eyes plus four whiskers.
    expect(whiskers).toHaveLength(6)
    expect(svg.indexOf('fill="#aa3355"')).toBeLessThan(svg.indexOf('</g>'))
  })
})
