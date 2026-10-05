import {
  surfacePresets,
  validateAvatarDefinition,
  type AvatarAnimationDefinition,
  type AvatarBodyNodeDefinition,
  type AvatarDefinition,
  type AvatarDefinitionError,
  type AvatarExpressionDefinition,
  type AvatarFaceDefinition,
  type AvatarMouthDefinition,
  type AvatarMouthShapeDefinition,
  type AvatarWhiskerPoseDefinition,
  type AvatarWhiskersDefinition,
  type BodyNodeSurfaceType,
  type HexColor,
  type SurfaceDefinition,
  type SurfaceType,
  type ValidationResult,
} from '@bible-strong/avatar-core'

import {
  baseBehaviorDefinition,
  characterTemplates,
  DEFAULT_TEMPLATE_KEY,
  findCharacterTemplate,
  type NeutralEyes,
} from './templates'

type Vector3 = [number, number, number]
type EyeDefinition = NeutralEyes['left']

export type SurfaceSpec =
  SurfaceType | ({ type: SurfaceType } & Partial<Omit<SurfaceDefinition, 'type'>>)

export type BodyNodeSpec = {
  surface: SurfaceSpec
  position?: Vector3
  rotation?: Vector3
  /** Fill for this node, such as inner ears or a nose. Defaults to the body color. */
  color?: string
}

export type EyesSpec = Partial<EyeDefinition> & {
  spacing?: number
  left?: Partial<EyeDefinition>
  right?: Partial<EyeDefinition>
}

export type ExpressionSpec = {
  /** Expression to start from; every omitted field is copied from it. Defaults to `neutral`. */
  basedOn?: string
  head?: Partial<AvatarExpressionDefinition['head']>
  eyes?: EyesSpec
  perspective?: number
  motion?: Partial<AvatarExpressionDefinition['motion']>
  /** Temporary color overrides while the expression is shown. `null` removes inherited overrides. */
  colors?: Partial<Record<'body' | 'eyes', string>> | null
  /** Mouth values while the expression is shown, merged over the inherited ones. `null` clears. */
  mouth?: Partial<AvatarMouthShapeDefinition> | null
  /** Whisker values while the expression is shown, merged over the inherited ones. `null` clears. */
  whiskers?: Partial<AvatarWhiskerPoseDefinition> | null
}

export type MouthSpec = Partial<Omit<AvatarMouthDefinition, 'color'>> & { color?: string }
export type WhiskersSpec = Partial<Omit<AvatarWhiskersDefinition, 'color'>> & { color?: string }

/** Mouth and whiskers. New features need their required fields; edits merge into existing ones. */
export type FaceSpec = {
  mouth?: MouthSpec
  whiskers?: WhiskersSpec
}

export type AnimationStepSpec = {
  expression: string
  holdMs?: number
  transitionMs?: number
  transition?: AvatarAnimationDefinition['steps'][number]['transition']
}

export type AnimationSpec = {
  steps: AnimationStepSpec[]
  playbackMode?: AvatarAnimationDefinition['playbackMode']
  blink?: Partial<AvatarAnimationDefinition['blink']>
  label?: string
  description?: string
  group?: string
}

export type BehaviorSpec = {
  /**
   * Which part of the Base behavior library to inherit when no explicit subset is listed.
   * `all` (default) inherits every bundled expression and animation; `none` keeps only `neutral`.
   */
  include?: 'all' | 'none'
  /** Inherit only these bundled animations (and every expression they reference). */
  animations?: string[]
  /** Inherit only these bundled expressions. */
  expressions?: string[]
  customExpressions?: Record<string, ExpressionSpec>
  customAnimations?: Record<string, AnimationSpec>
}

export type AvatarSpec = {
  name?: string
  /** Character template providing the default body, colors and neutral eyes. Defaults to `strobi`. */
  template?: string
  colors?: Partial<Record<'body' | 'eyes', string>>
  body?: {
    primary?: SurfaceSpec
    /** Replaces the template's secondary primitives when provided. */
    nodes?: BodyNodeSpec[]
  }
  /** Neutral eye overrides; inherited expressions shift with them, like in the Studio. */
  neutralEyes?: EyesSpec
  /** Optional mouth and whiskers; expressions animate them with `mouth`/`whiskers` overrides. */
  face?: FaceSpec
  behavior?: BehaviorSpec
}

export type AuthoringResult<T> = ValidationResult<T>

const fail = (path: string, code: string, message: string): AuthoringResult<never> => ({
  ok: false,
  errors: [{ path, code, message }],
})

class AuthoringError extends Error {
  constructor(readonly error: AvatarDefinitionError) {
    super(error.message)
  }
}

const authoringError = (path: string, code: string, message: string) =>
  new AuthoringError({ path, code, message })

const clone = <T>(value: T): T => structuredClone(value) as T

const normalizeColor = (value: string, path: string): HexColor => {
  const trimmed = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(trimmed)
  const normalized = short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : trimmed
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw authoringError(path, 'invalid_color', `Expected a #rrggbb color, received '${value}'`)
  }
  return normalized as HexColor
}

export const resolveSurface = (spec: SurfaceSpec): SurfaceDefinition => {
  const type = typeof spec === 'string' ? spec : spec.type
  const preset = surfacePresets[type]
  if (!preset) throw authoringError('/type', 'unknown_surface', `Unknown surface type '${type}'`)
  const overrides = typeof spec === 'string' ? {} : spec
  return { ...preset, ...overrides, type }
}

const resolveNode = (spec: BodyNodeSpec, path: string): AvatarBodyNodeDefinition => {
  const surface = resolveSurface(spec.surface)
  if (surface.type === 'mickey' || surface.type === 'cursor') {
    throw authoringError(
      `${path}/surface/type`,
      'invalid_node_surface',
      `'${surface.type}' can only be used as the primary surface`
    )
  }
  return {
    surface: surface as SurfaceDefinition<BodyNodeSurfaceType>,
    position: [...(spec.position ?? [0, 0, 0])],
    rotation: [...(spec.rotation ?? [0, 0, 0])],
    ...(spec.color !== undefined ? { color: normalizeColor(spec.color, `${path}/color`) } : {}),
  }
}

const eyeFields = ['width', 'height', 'x', 'y', 'angle'] as const

/** Applies an eye spec onto complete eyes. Shared fields apply to both eyes before per-eye ones. */
export const mergeEyes = (base: NeutralEyes, spec: EyesSpec = {}): NeutralEyes => {
  const shared: Partial<EyeDefinition> = {}
  eyeFields.forEach(field => {
    if (spec[field] !== undefined) shared[field] = spec[field]
  })
  return {
    left: { ...base.left, ...shared, ...spec.left },
    right: { ...base.right, ...shared, ...spec.right },
    spacing: spec.spacing ?? base.spacing,
  }
}

const MIN_EYE_SIZE = 10

/**
 * Moves an expression's eyes by the difference between two neutral appearances, keeping the
 * expression relative to the avatar's neutral eyes exactly as the Studio does.
 */
export const shiftExpressionEyes = (
  expression: AvatarExpressionDefinition,
  from: NeutralEyes,
  to: NeutralEyes
): AvatarExpressionDefinition => {
  const shiftEye = (side: 'left' | 'right'): EyeDefinition => {
    const result = { ...expression.eyes[side] }
    eyeFields.forEach(field => {
      result[field] = expression.eyes[side][field] + to[side][field] - from[side][field]
    })
    result.width = Math.max(MIN_EYE_SIZE, result.width)
    result.height = Math.max(MIN_EYE_SIZE, result.height)
    return result
  }
  return {
    ...expression,
    eyes: {
      left: shiftEye('left'),
      right: shiftEye('right'),
      spacing: expression.eyes.spacing + to.spacing - from.spacing,
    },
  }
}

const resolveExpression = (
  spec: ExpressionSpec,
  lookup: (key: string) => AvatarExpressionDefinition | undefined,
  path: string,
  fallbackBase = 'neutral'
): AvatarExpressionDefinition => {
  const baseKey = spec.basedOn ?? fallbackBase
  const base = lookup(baseKey)
  if (!base) {
    throw authoringError(`${path}/basedOn`, 'unknown_expression', `Unknown expression '${baseKey}'`)
  }
  const result: AvatarExpressionDefinition = {
    head: { ...base.head, ...spec.head },
    eyes: mergeEyes(base.eyes, spec.eyes),
    perspective: spec.perspective ?? base.perspective,
    motion: { ...base.motion, ...spec.motion },
  }
  const colors = spec.colors === null ? undefined : { ...base.colors, ...(spec.colors ?? {}) }
  if (colors && Object.keys(colors).length) {
    result.colors = Object.fromEntries(
      Object.entries(colors).map(([key, value]) => [
        key,
        normalizeColor(value as string, `${path}/colors/${key}`),
      ])
    )
  }
  const mouth = spec.mouth === null ? undefined : { ...base.mouth, ...(spec.mouth ?? {}) }
  if (mouth && Object.keys(mouth).length) result.mouth = mouth
  const whiskers =
    spec.whiskers === null ? undefined : { ...base.whiskers, ...(spec.whiskers ?? {}) }
  if (whiskers && Object.keys(whiskers).length) result.whiskers = whiskers
  return result
}

const REQUIRED_FACE_FIELDS = {
  mouth: ['thickness', 'x', 'y', 'width', 'curve'],
  whiskers: ['count', 'thickness', 'x', 'y', 'length'],
} as const

const listFields = (fields: readonly string[]) =>
  `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}`

/** Merges a face feature spec into the current one; `null` removes the feature. */
const mergeFaceFeature = <T extends { color?: string }>(
  feature: keyof typeof REQUIRED_FACE_FIELDS,
  current: Readonly<T> | undefined,
  spec: (Partial<Omit<T, 'color'>> & { color?: string }) | null | undefined,
  path: string
): T | undefined => {
  if (spec === null) return undefined
  if (spec === undefined) return current ? clone(current) : undefined
  if (!current) {
    const required = REQUIRED_FACE_FIELDS[feature]
    const missing = required.filter(field => (spec as Record<string, unknown>)[field] === undefined)
    if (missing.length) {
      throw authoringError(
        path,
        'missing_face_fields',
        `${feature === 'mouth' ? 'A new mouth needs' : 'New whiskers need'} ${listFields(required)}; missing ${missing.join(', ')}`
      )
    }
  }
  const merged = { ...clone(current ?? ({} as T)), ...spec } as T
  if (spec.color !== undefined) merged.color = normalizeColor(spec.color, `${path}/color`)
  return merged
}

const resolveFace = (
  current: Readonly<AvatarFaceDefinition> | undefined,
  spec: {
    mouth?: MouthSpec | null
    whiskers?: WhiskersSpec | null
  },
  path: string
): AvatarFaceDefinition | undefined => {
  const mouth = mergeFaceFeature<AvatarMouthDefinition>(
    'mouth',
    current?.mouth,
    spec.mouth,
    `${path}/mouth`
  )
  const whiskers = mergeFaceFeature<AvatarWhiskersDefinition>(
    'whiskers',
    current?.whiskers,
    spec.whiskers,
    `${path}/whiskers`
  )
  if (!mouth && !whiskers) return undefined
  return { ...(mouth ? { mouth } : {}), ...(whiskers ? { whiskers } : {}) }
}

export const DEFAULT_STEP = { holdMs: 1600, transitionMs: 420, transition: 'smooth' } as const
export const DEFAULT_BLINK: AvatarAnimationDefinition['blink'] = {
  enabled: true,
  initialDelayMs: 1800,
  minIntervalMs: 3400,
  maxIntervalMs: 6200,
  durationMs: 280,
}

const resolveAnimation = (
  spec: AnimationSpec,
  previous?: AvatarAnimationDefinition
): AvatarAnimationDefinition => {
  const metadata = {
    ...previous?.metadata,
    ...(spec.label === undefined ? {} : { label: spec.label }),
    ...(spec.description === undefined ? {} : { description: spec.description }),
    ...(spec.group === undefined ? {} : { group: spec.group }),
  }
  return {
    playbackMode: spec.playbackMode ?? previous?.playbackMode ?? 'loop',
    steps: spec.steps.map(step => ({
      expression: step.expression,
      holdMs: step.holdMs ?? DEFAULT_STEP.holdMs,
      transitionMs: step.transitionMs ?? DEFAULT_STEP.transitionMs,
      transition: step.transition ?? DEFAULT_STEP.transition,
    })),
    blink: { ...(previous?.blink ?? DEFAULT_BLINK), ...spec.blink },
    ...(Object.keys(metadata).length ? { metadata } : {}),
  }
}

const baseNeutralEyes = () => baseBehaviorDefinition.expressions.neutral.eyes

/** A base expression shifted to the given neutral eyes, or undefined when it is not bundled. */
const shiftedBaseExpression = (key: string, neutralEyes: NeutralEyes) => {
  const expression = baseBehaviorDefinition.expressions[key]
  return expression
    ? shiftExpressionEyes(clone(expression), baseNeutralEyes(), neutralEyes)
    : undefined
}

/** Pulls bundled expressions referenced by animations but missing from the definition. */
const includeReferencedExpressions = (definition: AvatarDefinition, path: string) => {
  const neutralEyes = definition.expressions.neutral.eyes
  Object.entries(definition.animations).forEach(([animationKey, animation]) => {
    animation.steps.forEach((step, index) => {
      if (definition.expressions[step.expression]) return
      const pulled = shiftedBaseExpression(step.expression, neutralEyes)
      if (!pulled) {
        throw authoringError(
          `${path}/${animationKey}/steps/${index}/expression`,
          'unknown_expression',
          `Animation '${animationKey}' references unknown expression '${step.expression}'`
        )
      }
      definition.expressions[step.expression] = pulled
      definition.expressionOrder.push(step.expression)
    })
  })
}

const checkSemanticKey = (key: string, path: string) => {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key) || key.length > 64) {
    throw authoringError(
      path,
      'invalid_semantic_key',
      `Invalid key '${key}': use lowercase kebab-case such as 'happy-wave'`
    )
  }
}

const withAuthoringErrors = <T>(build: () => AuthoringResult<T>): AuthoringResult<T> => {
  try {
    return build()
  } catch (error) {
    if (error instanceof AuthoringError) return { ok: false, errors: [error.error] }
    throw error
  }
}

export const createAvatarFromSpec = (spec: AvatarSpec = {}): AuthoringResult<AvatarDefinition> =>
  withAuthoringErrors(() => {
    const templateKey = spec.template ?? DEFAULT_TEMPLATE_KEY
    const template = findCharacterTemplate(templateKey)
    if (!template) {
      return fail(
        '/template',
        'unknown_template',
        `Unknown template '${templateKey}'. Available: ${characterTemplates.map(item => item.key).join(', ')}`
      )
    }
    const neutralEyes = mergeEyes(template.neutralEyes, spec.neutralEyes)
    const behavior = spec.behavior ?? {}
    const base = baseBehaviorDefinition

    const inheritedAnimations = new Set<string>()
    const inheritedExpressions = new Set<string>()
    if (behavior.animations || behavior.expressions) {
      behavior.animations?.forEach((key, index) => {
        const animation = base.animations[key]
        if (!animation) {
          throw authoringError(
            `/behavior/animations/${index}`,
            'unknown_animation',
            `Unknown bundled animation '${key}'`
          )
        }
        inheritedAnimations.add(key)
        animation.steps.forEach(step => inheritedExpressions.add(step.expression))
      })
      behavior.expressions?.forEach((key, index) => {
        if (!base.expressions[key]) {
          throw authoringError(
            `/behavior/expressions/${index}`,
            'unknown_expression',
            `Unknown bundled expression '${key}'`
          )
        }
        inheritedExpressions.add(key)
      })
    } else if ((behavior.include ?? 'all') === 'all') {
      base.animationOrder.forEach(key => inheritedAnimations.add(key))
      base.expressionOrder.forEach(key => inheritedExpressions.add(key))
    }
    inheritedExpressions.add('neutral')

    const definition: AvatarDefinition = {
      schema: 'bible-strong/avatar-definition',
      schemaVersion: 1,
      ...(spec.name ? { name: spec.name } : {}),
      body: {
        primary: spec.body?.primary
          ? resolveSurface(spec.body.primary)
          : clone(template.body.primary),
        nodes: spec.body?.nodes
          ? spec.body.nodes.map((node, index) => resolveNode(node, `/body/nodes/${index}`))
          : clone(template.body.nodes),
      },
      colors: {
        body: normalizeColor(spec.colors?.body ?? template.colors.body, '/colors/body'),
        eyes: normalizeColor(spec.colors?.eyes ?? template.colors.eyes, '/colors/eyes'),
      },
      expressions: {},
      expressionOrder: [],
      animations: {},
      animationOrder: [],
    }
    const face = spec.face ? resolveFace(undefined, spec.face, '/face') : undefined
    if (face) definition.face = face

    base.expressionOrder
      .filter(key => inheritedExpressions.has(key))
      .forEach(key => {
        definition.expressions[key] = shiftedBaseExpression(key, neutralEyes)!
        definition.expressionOrder.push(key)
      })
    base.animationOrder
      .filter(key => inheritedAnimations.has(key))
      .forEach(key => {
        definition.animations[key] = clone(base.animations[key]!)
        definition.animationOrder.push(key)
      })

    const lookup = (key: string) =>
      definition.expressions[key] ?? shiftedBaseExpression(key, neutralEyes)
    Object.entries(behavior.customExpressions ?? {}).forEach(([key, expressionSpec]) => {
      const path = `/behavior/customExpressions/${key}`
      checkSemanticKey(key, path)
      if (key === 'neutral') {
        throw authoringError(path, 'reserved_semantic_key', "Use 'neutralEyes' to change 'neutral'")
      }
      const exists = key in definition.expressions
      definition.expressions[key] = resolveExpression(
        expressionSpec,
        lookup,
        path,
        exists || base.expressions[key] ? key : 'neutral'
      )
      if (!exists) definition.expressionOrder.push(key)
    })
    Object.entries(behavior.customAnimations ?? {}).forEach(([key, animationSpec]) => {
      checkSemanticKey(key, `/behavior/customAnimations/${key}`)
      const exists = key in definition.animations
      definition.animations[key] = resolveAnimation(animationSpec)
      if (!exists) definition.animationOrder.push(key)
    })
    includeReferencedExpressions(definition, '/behavior/customAnimations')

    return validateAvatarDefinition(definition)
  })

export type AvatarEditOperation =
  | { op: 'set_name'; name: string }
  | { op: 'set_colors'; body?: string; eyes?: string }
  | { op: 'set_primary_surface'; surface: SurfaceSpec }
  | { op: 'add_body_node'; node: BodyNodeSpec }
  | {
      op: 'update_body_node'
      index: number
      surface?: SurfaceSpec
      position?: Vector3
      rotation?: Vector3
      /** `null` returns the node to the body color. */
      color?: string | null
    }
  | { op: 'remove_body_node'; index: number }
  | { op: 'set_neutral_eyes'; eyes: EyesSpec; shiftExpressions?: boolean }
  | { op: 'upsert_expression'; key: string; expression: ExpressionSpec }
  | { op: 'remove_expression'; key: string }
  | { op: 'upsert_animation'; key: string; animation: AnimationSpec }
  | { op: 'remove_animation'; key: string }
  | { op: 'reorder_expressions'; order: string[] }
  | { op: 'reorder_animations'; order: string[] }
  | { op: 'set_face'; mouth?: MouthSpec | null; whiskers?: WhiskersSpec | null }

const reorder = (current: string[], requested: string[], path: string) => {
  requested.forEach((key, index) => {
    if (!current.includes(key)) {
      throw authoringError(`${path}/${index}`, 'unknown_order_key', `Unknown key '${key}'`)
    }
  })
  const listed = new Set(requested)
  return [...new Set(requested), ...current.filter(key => !listed.has(key))]
}

const applyOperation = (
  definition: AvatarDefinition,
  operation: AvatarEditOperation,
  path: string
) => {
  switch (operation.op) {
    case 'set_name':
      if (operation.name) definition.name = operation.name
      else delete definition.name
      return
    case 'set_colors':
      if (operation.body) definition.colors.body = normalizeColor(operation.body, `${path}/body`)
      if (operation.eyes) definition.colors.eyes = normalizeColor(operation.eyes, `${path}/eyes`)
      return
    case 'set_primary_surface':
      definition.body.primary = resolveSurface(operation.surface)
      return
    case 'add_body_node':
      definition.body.nodes.push(resolveNode(operation.node, `${path}/node`))
      return
    case 'update_body_node': {
      const node = definition.body.nodes[operation.index]
      if (!node) {
        throw authoringError(
          `${path}/index`,
          'unknown_body_node',
          `No body node at index ${operation.index}`
        )
      }
      const color = operation.color === null ? undefined : (operation.color ?? node.color)
      definition.body.nodes[operation.index] = resolveNode(
        {
          surface: operation.surface ?? node.surface,
          position: operation.position ?? node.position,
          rotation: operation.rotation ?? node.rotation,
          ...(color !== undefined ? { color } : {}),
        },
        path
      )
      return
    }
    case 'remove_body_node':
      if (!definition.body.nodes[operation.index]) {
        throw authoringError(
          `${path}/index`,
          'unknown_body_node',
          `No body node at index ${operation.index}`
        )
      }
      definition.body.nodes.splice(operation.index, 1)
      return
    case 'set_neutral_eyes': {
      const from = definition.expressions.neutral.eyes
      const to = mergeEyes(from, operation.eyes)
      if (operation.shiftExpressions === false) {
        definition.expressions.neutral = { ...definition.expressions.neutral, eyes: to }
        return
      }
      Object.keys(definition.expressions).forEach(key => {
        definition.expressions[key] = shiftExpressionEyes(definition.expressions[key]!, from, to)
      })
      return
    }
    case 'upsert_expression': {
      checkSemanticKey(operation.key, `${path}/key`)
      const exists = operation.key in definition.expressions
      definition.expressions[operation.key] = resolveExpression(
        operation.expression,
        key =>
          definition.expressions[key] ??
          shiftedBaseExpression(key, definition.expressions.neutral.eyes),
        `${path}/expression`,
        exists ? operation.key : 'neutral'
      )
      if (!exists) definition.expressionOrder.push(operation.key)
      return
    }
    case 'remove_expression': {
      if (operation.key === 'neutral') {
        throw authoringError(`${path}/key`, 'reserved_semantic_key', "'neutral' cannot be removed")
      }
      if (!(operation.key in definition.expressions)) {
        throw authoringError(
          `${path}/key`,
          'unknown_expression',
          `Unknown expression '${operation.key}'`
        )
      }
      const users = Object.entries(definition.animations)
        .filter(([, animation]) => animation.steps.some(step => step.expression === operation.key))
        .map(([key]) => key)
      if (users.length) {
        throw authoringError(
          `${path}/key`,
          'expression_in_use',
          `Expression '${operation.key}' is used by animations: ${users.join(', ')}. Remove or edit them first.`
        )
      }
      delete definition.expressions[operation.key]
      definition.expressionOrder = definition.expressionOrder.filter(key => key !== operation.key)
      return
    }
    case 'upsert_animation': {
      checkSemanticKey(operation.key, `${path}/key`)
      const previous = definition.animations[operation.key]
      definition.animations[operation.key] = resolveAnimation(operation.animation, previous)
      if (!previous) definition.animationOrder.push(operation.key)
      includeReferencedExpressions(definition, `${path}/animation`)
      return
    }
    case 'remove_animation':
      if (!(operation.key in definition.animations)) {
        throw authoringError(
          `${path}/key`,
          'unknown_animation',
          `Unknown animation '${operation.key}'`
        )
      }
      delete definition.animations[operation.key]
      definition.animationOrder = definition.animationOrder.filter(key => key !== operation.key)
      return
    case 'reorder_expressions':
      definition.expressionOrder = reorder(
        definition.expressionOrder,
        operation.order,
        `${path}/order`
      )
      return
    case 'reorder_animations':
      definition.animationOrder = reorder(
        definition.animationOrder,
        operation.order,
        `${path}/order`
      )
      return
    case 'set_face': {
      const face = resolveFace(definition.face, operation, path)
      if (face) definition.face = face
      else delete definition.face
    }
  }
}

/** Applies edits atomically: either every operation succeeds and validates, or nothing changes. */
export const editAvatarDefinition = (
  input: Readonly<AvatarDefinition>,
  operations: readonly AvatarEditOperation[]
): AuthoringResult<AvatarDefinition> =>
  withAuthoringErrors(() => {
    const definition = clone(input) as AvatarDefinition
    operations.forEach((operation, index) =>
      applyOperation(definition, operation, `/operations/${index}`)
    )
    return validateAvatarDefinition(definition)
  })

export type AvatarVariationOptions = {
  count: number
  seed?: number
  templates?: string[]
  namePrefix?: string
  /** Body colors to cycle through; generated from evenly spaced hues when omitted. */
  palette?: string[]
  behavior?: BehaviorSpec
}

/** Deterministic Mulberry32 generator so the same seed always yields the same set. */
const createRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const hslToHex = (hue: number, saturation: number, lightness: number) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = (hue / 60) % 6
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
  const [red, green, blue] =
    segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const offset = lightness - chroma / 2
  return `#${[red, green, blue]
    .map(channel =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

const relativeLuminance = (hex: string) => {
  const channels = [1, 3, 5].map(start => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

/** Eye color with the stronger contrast against the body color. */
export const contrastingEyeColor = (bodyColor: string) =>
  relativeLuminance(bodyColor) > 0.22 ? '#111316' : '#ffffff'

/** Generates a varied but deterministic set of avatar specs from the character templates. */
export const generateAvatarVariations = ({
  count,
  seed = 1,
  templates,
  namePrefix = 'Avatar',
  palette,
  behavior,
}: AvatarVariationOptions): AvatarSpec[] => {
  const random = createRandom(seed)
  const pool = templates?.length ? templates : characterTemplates.map(template => template.key)
  const hueOffset = random() * 360
  return Array.from({ length: count }, (_, index) => {
    const template = findCharacterTemplate(pool[Math.floor(random() * pool.length)]!)
    if (!template) throw new Error(`Unknown template '${pool[index % pool.length]}'`)
    const body = palette?.length
      ? palette[index % palette.length]!
      : hslToHex(
          (hueOffset + index * 137.508) % 360,
          0.55 + random() * 0.25,
          0.55 + random() * 0.15
        )
    // Scaling only the primary surface would detach secondary primitives such as ears.
    const scale = template.body.nodes.length ? 1 : 0.92 + random() * 0.16
    const eyeScale = 0.85 + random() * 0.3
    return {
      name: `${namePrefix} ${index + 1}`,
      template: template.key,
      colors: { body, eyes: contrastingEyeColor(normalizeColor(body, `/palette/${index}`)) },
      body: {
        primary: {
          ...template.body.primary,
          width: Math.round(template.body.primary.width * scale * 100) / 100,
          height: Math.round(template.body.primary.height * scale * 100) / 100,
        },
      },
      neutralEyes: {
        left: { height: Math.round(template.neutralEyes.left.height * eyeScale * 100) / 100 },
        right: { height: Math.round(template.neutralEyes.right.height * eyeScale * 100) / 100 },
        spacing: Math.round(template.neutralEyes.spacing * (0.9 + random() * 0.2) * 100) / 100,
      },
      ...(behavior ? { behavior } : {}),
    }
  })
}

/** Expressions whose mouth or whisker overrides have no face feature to animate. */
export const faceWarnings = (definition: Readonly<AvatarDefinition>): string[] =>
  (['mouth', 'whiskers'] as const).flatMap(feature => {
    if (definition.face?.[feature]) return []
    const keys = definition.expressionOrder.filter(key => definition.expressions[key]?.[feature])
    if (!keys.length) return []
    return [
      `Expressions ${keys.join(', ')} override the ${feature}, but the avatar has no face.${feature}, so nothing is drawn; add one with set_face or remove the overrides`,
    ]
  })

export const describeAvatar = (definition: Readonly<AvatarDefinition>) => {
  const warnings = faceWarnings(definition)
  const nodeColors = Object.fromEntries(
    definition.body.nodes.flatMap((node, index) => (node.color ? [[index, node.color]] : []))
  )
  return {
    name: definition.name ?? null,
    colors: definition.colors,
    body: {
      primary: definition.body.primary.type,
      nodes: definition.body.nodes.map(node => node.surface.type),
      ...(Object.keys(nodeColors).length ? { nodeColors } : {}),
    },
    face: {
      mouth: Boolean(definition.face?.mouth),
      whiskers: definition.face?.whiskers?.count ?? 0,
    },
    expressions: definition.expressionOrder,
    animations: definition.animationOrder.map(key => ({
      key,
      playbackMode: definition.animations[key]!.playbackMode,
      steps: definition.animations[key]!.steps.map(step => step.expression),
      ...(definition.animations[key]!.metadata?.label
        ? { label: definition.animations[key]!.metadata!.label }
        : {}),
    })),
    ...(warnings.length ? { warnings } : {}),
  }
}
