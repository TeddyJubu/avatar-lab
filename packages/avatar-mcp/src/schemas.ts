import { z } from 'zod'

const surfaceType = z.enum([
  'sphere',
  'mickey',
  'cursor',
  'cube',
  'capsule',
  'cylinder',
  'cone',
  'diamond',
])
const roundness = z.number().min(0).max(2)
const dimension = z.number().min(0.001).max(10000)
const vector3 = z.tuple([z.number(), z.number(), z.number()])
const color = z.string().describe('#rrggbb (or #rgb) color')
const semanticKey = z.string().describe("Lowercase kebab-case key such as 'happy-wave'")

export const surfaceSpecSchema = z
  .union([
    surfaceType,
    z.object({
      type: surfaceType,
      width: dimension.optional(),
      height: dimension.optional(),
      depth: dimension.optional(),
      roundness: roundness.optional(),
      morphRoundness: roundness.optional(),
      tipRoundness: roundness.optional(),
      baseRoundness: roundness.optional(),
    }),
  ])
  .describe('Surface type name, or an object overriding that type preset')

export const bodyNodeSpecSchema = z.object({
  surface: surfaceSpecSchema,
  position: vector3.optional().describe('[x, y, z]; negative y is up, positive z is in front'),
  rotation: vector3.optional().describe('[x, y, z] rotation in degrees'),
})

const eyeFields = {
  width: z.number().optional(),
  height: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  angle: z.number().optional(),
}

export const eyesSpecSchema = z
  .object({
    ...eyeFields,
    spacing: z.number().optional(),
    left: z.object(eyeFields).optional(),
    right: z.object(eyeFields).optional(),
  })
  .describe('Shared eye fields apply to both eyes; left/right override per eye')

export const expressionSpecSchema = z.object({
  basedOn: semanticKey.optional().describe('Expression to start from (default: neutral)'),
  head: z
    .object({ x: z.number().optional(), y: z.number().optional(), z: z.number().optional() })
    .optional()
    .describe('Head rotation in degrees: x pitch (+up), y turn (+right), z tilt'),
  eyes: eyesSpecSchema.optional(),
  perspective: z.number().min(0.1).max(10).optional(),
  motion: z
    .object({
      eyes: z.enum(['none', 'microSaccades', 'shake']).optional(),
      body: z.enum(['none', 'slowDrift', 'shake']).optional(),
    })
    .optional(),
  colors: z
    .object({ body: color.optional(), eyes: color.optional() })
    .nullable()
    .optional()
    .describe('Temporary color overrides; null removes inherited overrides'),
})

export const animationSpecSchema = z.object({
  steps: z
    .array(
      z.object({
        expression: semanticKey,
        holdMs: z.number().min(100).max(60000).optional(),
        transitionMs: z.number().min(0).max(5000).optional(),
        transition: z.enum(['spring', 'smooth', 'snappy']).optional(),
      })
    )
    .min(1)
    .max(128),
  playbackMode: z.enum(['loop', 'once', 'pingPong']).optional(),
  blink: z
    .object({
      enabled: z.boolean().optional(),
      initialDelayMs: z.number().optional(),
      minIntervalMs: z.number().optional(),
      maxIntervalMs: z.number().optional(),
      durationMs: z.number().optional(),
    })
    .optional(),
  label: z.string().max(120).optional(),
  description: z.string().max(512).optional(),
  group: z.string().max(64).optional(),
})

export const behaviorSpecSchema = z
  .object({
    include: z
      .enum(['all', 'none'])
      .optional()
      .describe('Inherit every bundled expression/animation (default) or only neutral'),
    animations: z
      .array(semanticKey)
      .optional()
      .describe('Inherit only these bundled animations plus the expressions they use'),
    expressions: z.array(semanticKey).optional().describe('Inherit only these bundled expressions'),
    customExpressions: z.record(z.string(), expressionSpecSchema).optional(),
    customAnimations: z.record(z.string(), animationSpecSchema).optional(),
  })
  .describe('Behavior library selection and custom additions')

export const avatarSpecSchema = z.object({
  name: z.string().max(120).optional(),
  template: z
    .string()
    .optional()
    .describe('Character template key from list_templates (default: strobi)'),
  colors: z.object({ body: color.optional(), eyes: color.optional() }).optional(),
  body: z
    .object({
      primary: surfaceSpecSchema.optional(),
      nodes: z
        .array(bodyNodeSpecSchema)
        .max(16)
        .optional()
        .describe("Secondary primitives; replaces the template's nodes"),
    })
    .optional(),
  neutralEyes: eyesSpecSchema.optional(),
  behavior: behaviorSpecSchema.optional(),
})

export const editOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_name'), name: z.string().max(120) }),
  z.object({ op: z.literal('set_colors'), body: color.optional(), eyes: color.optional() }),
  z.object({ op: z.literal('set_primary_surface'), surface: surfaceSpecSchema }),
  z.object({ op: z.literal('add_body_node'), node: bodyNodeSpecSchema }),
  z.object({
    op: z.literal('update_body_node'),
    index: z.number().int().min(0),
    surface: surfaceSpecSchema.optional(),
    position: vector3.optional(),
    rotation: vector3.optional(),
  }),
  z.object({ op: z.literal('remove_body_node'), index: z.number().int().min(0) }),
  z.object({
    op: z.literal('set_neutral_eyes'),
    eyes: eyesSpecSchema,
    shiftExpressions: z
      .boolean()
      .optional()
      .describe('Shift every expression by the same delta (default true)'),
  }),
  z.object({
    op: z.literal('upsert_expression'),
    key: semanticKey,
    expression: expressionSpecSchema,
  }),
  z.object({ op: z.literal('remove_expression'), key: semanticKey }),
  z.object({ op: z.literal('upsert_animation'), key: semanticKey, animation: animationSpecSchema }),
  z.object({ op: z.literal('remove_animation'), key: semanticKey }),
  z.object({ op: z.literal('reorder_expressions'), order: z.array(semanticKey) }),
  z.object({ op: z.literal('reorder_animations'), order: z.array(semanticKey) }),
])

export const backgroundSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('transparent') }),
    z.object({ type: z.literal('solid'), color }),
    z.object({ type: z.literal('linear'), from: color, to: color }),
    z.object({ type: z.literal('radial'), from: color, to: color }),
  ])
  .describe('Snapshot background (default transparent)')

export const definitionInputSchema = {
  definition: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .describe('Avatar definition as an object or JSON text'),
  path: z
    .string()
    .optional()
    .describe('Path to a .avatar.json file inside the workspace root (alternative to definition)'),
}
