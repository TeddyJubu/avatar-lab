import { renderAvatarDefinition, type AvatarExpressionDefinition } from '@bible-strong/avatar-core'

import { createAvatarFromSpec } from '../authoring'
import { contrastRatio } from '../moods'
import { characterTemplates } from '../templates'

/** Half the side of the 300 unit stage the renderers draw. */
const STAGE = 150

/** Bounding box of SVG paths. Curve control points make it a little larger than the shape. */
const pathBounds = (paths: readonly string[]) => {
  let extent = 0
  paths.forEach(path => {
    // Ellipses are two arcs between opposite points: measure the full ellipse around them.
    const ellipse = /^M(\S+) (\S+)A(\S+) (\S+) (\S+) \d \d (\S+) (\S+)A/.exec(path)
    if (ellipse) {
      const [x1, y1, rx, ry, rotation, x2, y2] = ellipse.slice(1).map(Number) as number[]
      const angle = (rotation! * Math.PI) / 180
      const halfWidth = Math.hypot(rx! * Math.cos(angle), ry! * Math.sin(angle))
      const halfHeight = Math.hypot(rx! * Math.sin(angle), ry! * Math.cos(angle))
      extent = Math.max(
        extent,
        Math.abs((x1! + x2!) / 2) + halfWidth,
        Math.abs((y1! + y2!) / 2) + halfHeight
      )
      return
    }
    ;(path.match(/-?\d+(?:\.\d+)?/g) ?? []).forEach(value => {
      extent = Math.max(extent, Math.abs(Number(value)))
    })
  })
  return extent
}

/** Horizontal room between the two eyes, counting each eye as its rotated bounding box. */
const eyeGap = ({ eyes }: AvatarExpressionDefinition) => {
  const halfWidth = ({ width, height, angle }: AvatarExpressionDefinition['eyes']['left']) => {
    const radians = (angle * Math.PI) / 180
    return Math.abs((width / 2) * Math.cos(radians)) + Math.abs((height / 2) * Math.sin(radians))
  }
  return eyes.spacing + eyes.right.x - eyes.left.x - halfWidth(eyes.left) - halfWidth(eyes.right)
}

describe('bundled character templates', () => {
  characterTemplates.forEach(template => {
    it(`keeps ${template.name} on the stage with readable, separate eyes`, () => {
      const created = createAvatarFromSpec({ template: template.key })
      if (!created.ok) throw new Error(JSON.stringify(created.errors))
      const definition = created.value
      expect(contrastRatio(definition.colors.body, definition.colors.eyes)).toBeGreaterThanOrEqual(
        4.5
      )
      definition.expressionOrder.forEach(key => {
        const { geometry } = renderAvatarDefinition(definition, key)
        expect(
          pathBounds([...geometry.backPaths, geometry.headPath, ...geometry.frontPaths]),
          key
        ).toBeLessThanOrEqual(STAGE)
        expect(eyeGap(definition.expressions[key]!), key).toBeGreaterThanOrEqual(3)
      })
    })
  })
})
