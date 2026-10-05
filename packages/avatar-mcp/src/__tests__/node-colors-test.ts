import {
  createAvatarFromSpec,
  describeAvatar,
  editAvatarDefinition,
  type AvatarSpec,
} from '../authoring'
import { renderAvatarSvg } from '../svg'

const bunny: AvatarSpec = {
  name: 'Bunny',
  colors: { body: '#ffffff', eyes: '#2b2540' },
  body: {
    primary: { type: 'sphere', width: 200, height: 180, depth: 180 },
    nodes: [
      { surface: { type: 'capsule', width: 40, height: 110 }, position: [-34, -120, -14] },
      {
        surface: { type: 'capsule', width: 20, height: 80 },
        position: [-34, -124, -9],
        color: '#F8A',
      },
    ],
  },
  behavior: { include: 'none' },
}

const create = (spec: AvatarSpec) => {
  const result = createAvatarFromSpec(spec)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

describe('body node color authoring', () => {
  it('normalizes node colors and reports them in the summary', () => {
    const definition = create(bunny)
    expect(definition.body.nodes[0]).not.toHaveProperty('color')
    expect(definition.body.nodes[1]!.color).toBe('#ff88aa')
    expect(describeAvatar(definition).body).toEqual({
      primary: 'sphere',
      nodes: ['capsule', 'capsule'],
      nodeColors: { 1: '#ff88aa' },
    })
    const plain = create({ ...bunny, body: { nodes: [{ surface: 'cone' }] } })
    expect(describeAvatar(plain).body).not.toHaveProperty('nodeColors')
  })

  it('adds, keeps, changes and clears node colors with edits', () => {
    const definition = create(bunny)
    const edited = editAvatarDefinition(definition, [
      { op: 'add_body_node', node: { surface: 'sphere', position: [0, 30, 96], color: '#c2405f' } },
      { op: 'update_body_node', index: 1, position: [-34, -126, -9] },
      { op: 'update_body_node', index: 0, color: '#eeeeee' },
    ])
    if (!edited.ok) throw new Error(JSON.stringify(edited.errors))
    expect(edited.value.body.nodes.map(node => node.color)).toEqual([
      '#eeeeee',
      '#ff88aa',
      '#c2405f',
    ])

    const cleared = editAvatarDefinition(edited.value, [
      { op: 'update_body_node', index: 1, color: null },
    ])
    if (!cleared.ok) throw new Error(JSON.stringify(cleared.errors))
    expect(cleared.value.body.nodes[1]).not.toHaveProperty('color')

    expect(
      editAvatarDefinition(definition, [
        { op: 'add_body_node', node: { surface: 'sphere', color: 'pink' } },
      ])
    ).toEqual({
      ok: false,
      errors: [
        {
          path: '/operations/0/node/color',
          code: 'invalid_color',
          message: "Expected a #rrggbb color, received 'pink'",
        },
      ],
    })
    expect(
      editAvatarDefinition(definition, [{ op: 'update_body_node', index: 1, color: '' }])
    ).toMatchObject({ ok: false, errors: [{ path: '/operations/0/color', code: 'invalid_color' }] })
  })

  it('fills colored nodes in SVG renders', () => {
    const svg = renderAvatarSvg(create(bunny))
    expect(svg).toContain('fill="#ff88aa"')
    const fills = [...svg.matchAll(/<path d="[^"]*" fill="(#[0-9a-f]{6})"/g)].map(match => match[1])
    // Ear, inner ear and head, in paint order, before the eyes.
    expect(fills.slice(0, 3)).toEqual(['#ffffff', '#ff88aa', '#ffffff'])
  })
})
