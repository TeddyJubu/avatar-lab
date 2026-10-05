import {
  playAvatarAnimation,
  renderAvatarDefinition,
  renderAvatarFrame,
  validateAvatarDefinition,
  type AvatarDefinition,
  type AvatarExpressionDefinition,
  type AvatarScene,
} from '../index'

const expression: AvatarExpressionDefinition = {
  head: { x: 0, y: 0, z: 0 },
  eyes: {
    left: { width: 28, height: 38, x: 0, y: 0, angle: 0 },
    right: { width: 28, height: 38, x: 0, y: 0, angle: 0 },
    spacing: 64,
  },
  perspective: 1,
  motion: { eyes: 'none', body: 'none' },
}

const INNER_EAR = '#f28aa6'
const NOSE = '#c2405f'

const definition: AvatarDefinition = {
  schema: 'bible-strong/avatar-definition',
  schemaVersion: 1,
  name: 'Bun',
  body: {
    primary: { type: 'sphere', width: 240, height: 220, depth: 240, roundness: 1 },
    nodes: [
      {
        surface: { type: 'capsule', width: 44, height: 120, depth: 26, roundness: 1 },
        position: [-36, -130, -16],
        rotation: [0, 0, -8],
      },
      {
        surface: { type: 'capsule', width: 22, height: 86, depth: 12, roundness: 1 },
        position: [-38, -138, -10],
        rotation: [0, 0, -8],
        color: INNER_EAR,
      },
      {
        surface: { type: 'sphere', width: 20, height: 14, depth: 14, roundness: 1 },
        position: [0, 30, 116],
        rotation: [0, 0, 0],
        color: NOSE,
      },
    ],
  },
  colors: { body: '#ffffff', eyes: '#2b2540' },
  expressions: {
    neutral: expression,
    blush: { ...expression, colors: { body: '#ffd9e0' } },
    'turned-around': { ...expression, head: { x: 0, y: 180, z: 0 } },
  },
  expressionOrder: ['neutral', 'blush', 'turned-around'],
  animations: {
    fluster: {
      playbackMode: 'loop',
      steps: [{ expression: 'blush', holdMs: 1_000, transitionMs: 400, transition: 'smooth' }],
      blink: {
        enabled: false,
        initialDelayMs: 0,
        minIntervalMs: 1_000,
        maxIntervalMs: 1_000,
        durationMs: 100,
      },
    },
  },
  animationOrder: ['fluster'],
}

const nodeColorById: Record<string, string | undefined> = {
  'runtime-node-0': undefined,
  'runtime-node-1': INNER_EAR,
  'runtime-node-2': NOSE,
}

/** Every body path's fill must be its node's color, or the frame's body color. */
const expectFillsFollowNodes = (scene: AvatarScene) => {
  const { geometry, colors } = scene
  expect(colors.backPaths).toHaveLength(geometry.backPaths.length)
  expect(colors.frontPaths).toHaveLength(geometry.frontPaths.length)
  geometry.backNodeIds.forEach((id, index) => {
    expect(colors.backPaths![index]).toBe((id && nodeColorById[id]) ?? colors.body)
  })
  geometry.frontNodeIds.forEach((id, index) => {
    expect(colors.frontPaths![index]).toBe((id && nodeColorById[id]) ?? colors.body)
  })
}

describe('body node colors', () => {
  it('accepts a lowercase hex color on any node and rejects anything else', () => {
    expect(validateAvatarDefinition(definition).ok).toBe(true)

    const invalid = structuredClone(definition) as unknown as {
      body: { nodes: { color?: string }[] }
    }
    invalid.body.nodes[0]!.color = 'pink'
    invalid.body.nodes[1]!.color = '#F28AA6'
    invalid.body.nodes[2]!.color = '#fff'
    const result = validateAvatarDefinition(invalid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map(error => error.path)).toEqual(
      expect.arrayContaining(['/body/nodes/0/color', '/body/nodes/1/color', '/body/nodes/2/color'])
    )
  })

  it('leaves scenes of avatars without node colors unchanged', () => {
    const plain = structuredClone(definition)
    plain.body.nodes.forEach(node => delete node.color)
    expect(renderAvatarDefinition(plain, 'neutral').colors).toEqual({
      body: '#ffffff',
      eyes: '#2b2540',
    })
  })

  it('fills each body path with its node color and the rest with the body color', () => {
    const neutral = renderAvatarDefinition(definition, 'neutral')
    expectFillsFollowNodes(neutral)
    expect(neutral.colors.frontPaths).toEqual([NOSE])
    expect(neutral.colors.backPaths).toEqual(expect.arrayContaining(['#ffffff', INNER_EAR]))
    // The inner ear sits in front of the ear, so it is painted after it.
    expect(neutral.geometry.backNodeIds.indexOf('runtime-node-1')).toBeGreaterThan(
      neutral.geometry.backNodeIds.indexOf('runtime-node-0')
    )
  })

  it('keeps fills attached to their nodes when the head turns and layers change', () => {
    const turned = renderAvatarDefinition(definition, 'turned-around')
    expectFillsFollowNodes(turned)
    expect(turned.geometry.frontNodeIds).not.toContain('runtime-node-2')
    expect(turned.colors.backPaths).toContain(NOSE)
  })

  it('tints uncolored nodes with the expression body color but keeps node colors', () => {
    const blush = renderAvatarDefinition(definition, 'blush')
    expectFillsFollowNodes(blush)
    expect(blush.colors.backPaths).toEqual(expect.arrayContaining(['#ffd9e0', INNER_EAR]))
    expect(blush.colors.backPaths).not.toContain('#ffffff')
  })

  it('blends uncolored nodes with the body during a transition', () => {
    const started = playAvatarAnimation(definition, 'fluster', 0)
    if (!started.ok) throw new Error(started.error.message)
    const frame = renderAvatarFrame(definition, started.value, 200, { random: () => 0.5 })
    expect(frame.colors.body).not.toBe('#ffffff')
    expect(frame.colors.body).not.toBe('#ffd9e0')
    expectFillsFollowNodes(frame)
  })
})
