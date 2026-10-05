import type {
  AvatarBodyDefinition,
  AvatarDefinition,
  AvatarExpressionDefinition,
  AvatarFaceDefinition,
  ExpressionKey,
} from './avatarDefinition'
import type { AvatarBody } from './body'
import {
  DEFAULT_WHISKER_SPREAD,
  poseFromExpression,
  renderAvatar,
  type AvatarGeometry,
  type Expression,
  type FaceExpressionField,
} from './geometry'

/** Animatable face values for an expression: the definition's face with its overrides applied. */
export const faceExpressionValues = (
  face: Readonly<AvatarFaceDefinition> | undefined,
  expression: Readonly<AvatarExpressionDefinition>
): Partial<Record<FaceExpressionField, number>> => {
  const values: Partial<Record<FaceExpressionField, number>> = {}
  if (face?.mouth) {
    const mouth = { ...face.mouth, ...expression.mouth }
    values.mouthX = mouth.x
    values.mouthY = mouth.y
    values.mouthWidth = mouth.width
    values.mouthCurve = mouth.curve
    values.mouthCat = mouth.cat ?? 0
    values.mouthOpen = mouth.open ?? 0
    values.mouthTilt = mouth.tilt ?? 0
  }
  if (face?.whiskers) {
    const whiskers = { ...face.whiskers, ...expression.whiskers }
    values.whiskerLength = whiskers.length
    values.whiskerAngle = whiskers.angle ?? 0
    values.whiskerSpread = whiskers.spread ?? DEFAULT_WHISKER_SPREAD
    values.whiskerCurve = whiskers.curve ?? 0
  }
  return values
}

export const expressionFromDefinition = (
  key: ExpressionKey,
  expression: AvatarExpressionDefinition,
  face?: Readonly<AvatarFaceDefinition>
): Expression => ({
  id: key,
  semanticKey: key,
  headX: expression.head.x,
  headY: expression.head.y,
  headZ: expression.head.z,
  widthLeft: expression.eyes.left.width,
  widthRight: expression.eyes.right.width,
  heightLeft: expression.eyes.left.height,
  heightRight: expression.eyes.right.height,
  spacing: expression.eyes.spacing,
  positionXLeft: expression.eyes.left.x,
  positionXRight: expression.eyes.right.x,
  positionYLeft: expression.eyes.left.y,
  positionYRight: expression.eyes.right.y,
  leftAngle: expression.eyes.left.angle,
  rightAngle: expression.eyes.right.angle,
  perspective: expression.perspective,
  eyeMotion: expression.motion.eyes,
  bodyMotion: expression.motion.body,
  ...(expression.colors?.body ? { bodyColor: expression.colors.body } : {}),
  ...(expression.colors?.eyes ? { eyeColor: expression.colors.eyes } : {}),
  ...faceExpressionValues(face, expression),
})

export const bodyFromDefinition = (body: AvatarBodyDefinition): AvatarBody => ({
  primary: { ...body.primary },
  nodes: body.nodes.map((node, index) => ({
    id: `runtime-node-${index}`,
    name: `Runtime node ${index + 1}`,
    surface: { ...node.surface },
    position: [...node.position],
    rotation: [...node.rotation],
  })),
})

export type AvatarScene = {
  geometry: AvatarGeometry
  /**
   * `mouth` and `whiskers` are present only for avatars that define those features.
   * `backPaths` and `frontPaths` hold the fill of each path in `geometry.backPaths` and
   * `geometry.frontPaths`; they are present only when a body node has its own color.
   */
  colors: {
    body: string
    eyes: string
    mouth?: string
    whiskers?: string
    backPaths?: string[]
    frontPaths?: string[]
  }
}

export const renderAvatarExpression = (
  definition: Readonly<AvatarDefinition>,
  expression: Expression,
  colors: { body?: string; eyes?: string } = {},
  blink = 1
): AvatarScene => {
  const body = bodyFromDefinition(definition.body)
  const face = definition.face
  const bodyColor = colors.body ?? expression.bodyColor ?? definition.colors.body
  const eyes = colors.eyes ?? expression.eyeColor ?? definition.colors.eyes
  const geometry = renderAvatar(poseFromExpression(expression), body.primary, blink, {
    bodyNodes: body.nodes,
    ...(face ? { face } : {}),
  })
  const nodeColors = new Map<string, string>()
  definition.body.nodes.forEach((node, index) => {
    if (node.color) nodeColors.set(body.nodes[index].id, node.color)
  })
  // Layers are depth sorted every frame, so fills follow the node ids rather than node order.
  const fills = (ids: readonly (string | null)[]) =>
    ids.map(id => (id === null ? undefined : nodeColors.get(id)) ?? bodyColor)
  return {
    geometry,
    colors: {
      body: bodyColor,
      eyes,
      ...(face?.mouth ? { mouth: face.mouth.color ?? eyes } : {}),
      ...(face?.whiskers ? { whiskers: face.whiskers.color ?? eyes } : {}),
      ...(nodeColors.size
        ? { backPaths: fills(geometry.backNodeIds), frontPaths: fills(geometry.frontNodeIds) }
        : {}),
    },
  }
}

export const renderAvatarDefinition = (
  definition: Readonly<AvatarDefinition>,
  expressionKey: ExpressionKey = 'neutral'
): AvatarScene => {
  const publicExpression = definition.expressions[expressionKey]
  if (!publicExpression) throw new Error(`Unknown expression '${expressionKey}'`)
  const expression = expressionFromDefinition(expressionKey, publicExpression, definition.face)
  return renderAvatarExpression(definition, expression, publicExpression.colors)
}
