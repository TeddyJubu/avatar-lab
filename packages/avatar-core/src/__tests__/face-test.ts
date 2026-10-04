import {
  expressionFromDefinition,
  interpolatePose,
  parseAvatarDefinition,
  playAvatarAnimation,
  poseFromExpression,
  renderAvatarDefinition,
  sampleAvatarFrame,
  validateAvatarDefinition,
  type AvatarDefinition,
  type AvatarExpressionDefinition,
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

const definition: AvatarDefinition = {
  schema: 'bible-strong/avatar-definition',
  schemaVersion: 1,
  name: 'Whiskers',
  body: {
    primary: { type: 'sphere', width: 240, height: 240, depth: 240, roundness: 1 },
    nodes: [],
  },
  colors: { body: '#ffd0ad', eyes: '#3a2431' },
  face: {
    mouth: { thickness: 3, x: 0, y: 48, width: 22, curve: 4, cat: 1 },
    whiskers: { count: 3, thickness: 2, x: 70, y: 40, length: 44, spread: 12 },
  },
  expressions: {
    neutral: expression,
    laugh: {
      ...expression,
      colors: { eyes: '#aa0000' },
      mouth: { curve: 8, open: 10 },
      whiskers: { angle: 12 },
    },
    'look-away': { ...expression, head: { x: 0, y: 70, z: 0 } },
    'turned-around': { ...expression, head: { x: 0, y: 180, z: 0 } },
    hidden: { ...expression, mouth: { width: 0 }, whiskers: { length: 0 } },
  },
  expressionOrder: ['neutral', 'laugh', 'look-away', 'turned-around', 'hidden'],
  animations: {
    giggle: {
      playbackMode: 'loop',
      steps: [{ expression: 'laugh', holdMs: 1_000, transitionMs: 400, transition: 'smooth' }],
      blink: {
        enabled: false,
        initialDelayMs: 0,
        minIntervalMs: 1_000,
        maxIntervalMs: 1_000,
        durationMs: 100,
      },
    },
  },
  animationOrder: ['giggle'],
}

const withoutFace = (): AvatarDefinition => {
  const { face: _face, ...rest } = structuredClone(definition)
  return rest
}

describe('face features', () => {
  it('validates mouths, whiskers and their expression overrides', () => {
    expect(parseAvatarDefinition(JSON.stringify(definition)).ok).toBe(true)

    const invalid = structuredClone(definition) as unknown as {
      face: { whiskers: { count: number }; mouth: { cat: number; nose?: boolean } }
      expressions: Record<string, { mouth?: Record<string, unknown> }>
    }
    invalid.face.whiskers.count = 5
    invalid.face.mouth.cat = 2
    invalid.face.mouth.nose = true
    invalid.expressions.laugh!.mouth = { thickness: 4 }
    const result = validateAvatarDefinition(invalid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map(error => error.path)).toEqual(
      expect.arrayContaining([
        '/face/whiskers/count',
        '/face/mouth/cat',
        '/face/mouth/nose',
        '/expressions/laugh/mouth/thickness',
      ])
    )
  })

  it('merges expression overrides over the resting face values', () => {
    const laugh = expressionFromDefinition('laugh', definition.expressions.laugh!, definition.face)
    expect(laugh).toMatchObject({
      mouthX: 0,
      mouthY: 48,
      mouthWidth: 22,
      mouthCurve: 8,
      mouthCat: 1,
      mouthOpen: 10,
      mouthTilt: 0,
      whiskerLength: 44,
      whiskerAngle: 12,
      whiskerSpread: 12,
      whiskerCurve: 0,
    })
    const plain = expressionFromDefinition('laugh', definition.expressions.laugh!)
    expect(plain.mouthCurve).toBeUndefined()
    expect(plain.whiskerAngle).toBeUndefined()
  })

  it('draws a stroked mouth that opens, and whiskers on both sides', () => {
    const neutral = renderAvatarDefinition(definition, 'neutral')
    expect(neutral.geometry.mouthVisible).toBe(true)
    expect(neutral.geometry.mouthPaths).toHaveLength(2)
    expect(neutral.geometry.whiskerFrontPaths).toHaveLength(6)
    expect(neutral.geometry.whiskerBackPaths).toHaveLength(0)

    const laugh = renderAvatarDefinition(definition, 'laugh')
    expect(laugh.geometry.mouthPaths).toHaveLength(3)
    expect(laugh.geometry.whiskerFrontPaths).not.toEqual(neutral.geometry.whiskerFrontPaths)

    const hidden = renderAvatarDefinition(definition, 'hidden').geometry
    expect(hidden.mouthPaths).toEqual([])
    expect(hidden.whiskerFrontPaths).toEqual([])
    expect(hidden.whiskerBackPaths).toEqual([])
  })

  it('moves whiskers behind the head and hides the mouth when the face turns away', () => {
    const away = renderAvatarDefinition(definition, 'look-away').geometry
    expect(away.whiskerFrontPaths).toHaveLength(3)
    expect(away.whiskerBackPaths).toHaveLength(3)

    const turned = renderAvatarDefinition(definition, 'turned-around').geometry
    expect(turned.mouthVisible).toBe(false)
    expect(turned.mouthPaths).toEqual([])
    expect(turned.whiskerBackPaths).toHaveLength(6)
  })

  it('colors the face with the frame eye color unless a face color is set', () => {
    expect(renderAvatarDefinition(definition, 'neutral').colors).toEqual({
      body: '#ffd0ad',
      eyes: '#3a2431',
      mouth: '#3a2431',
      whiskers: '#3a2431',
    })
    expect(renderAvatarDefinition(definition, 'laugh').colors).toMatchObject({
      mouth: '#aa0000',
      whiskers: '#aa0000',
    })
    const colored = structuredClone(definition)
    colored.face!.whiskers!.color = '#ffffff'
    expect(renderAvatarDefinition(colored, 'laugh').colors).toMatchObject({
      mouth: '#aa0000',
      whiskers: '#ffffff',
    })
  })

  it('interpolates face values during a transition', () => {
    const started = playAvatarAnimation(definition, 'giggle', 0)
    if (!started.ok) throw new Error(started.error.message)
    const frame = sampleAvatarFrame(definition, started.value, 200, { random: () => 0.5 })
    expect(frame.expression.mouthCurve).toBeCloseTo(6, 5)
    expect(frame.expression.mouthOpen).toBeCloseTo(5, 5)
    expect(frame.expression.whiskerAngle).toBeCloseTo(6, 5)
  })

  it('interpolates mouth tilt and whisker angle the short way round', () => {
    const from = poseFromExpression({
      ...expressionFromDefinition('neutral', expression, definition.face),
      mouthTilt: 170,
      whiskerAngle: -170,
    })
    const to = poseFromExpression({
      ...expressionFromDefinition('neutral', expression, definition.face),
      mouthTilt: -170,
      whiskerAngle: 170,
    })
    const halfway = interpolatePose(from, to, 0.5).expression
    expect(Math.abs(halfway.mouthTilt!)).toBeCloseTo(180, 5)
    expect(Math.abs(halfway.whiskerAngle!)).toBeCloseTo(180, 5)
  })

  it('keeps avatars without a face unchanged', () => {
    const plain = withoutFace()
    const scene = renderAvatarDefinition(plain, 'laugh')
    expect(scene.colors).toEqual({ body: '#ffd0ad', eyes: '#aa0000' })
    expect(scene.geometry).toMatchObject({
      mouthPaths: [],
      mouthVisible: false,
      whiskerBackPaths: [],
      whiskerFrontPaths: [],
    })
    expect(scene.geometry.headPath).toBe(
      renderAvatarDefinition(definition, 'laugh').geometry.headPath
    )
  })
})
