import { surfacePresets } from '@bible-strong/avatar-core'

import { baseBehaviorDefinition, characterTemplates } from './templates'

export const authoringGuide = () => `# Bible Strong avatar authoring guide

An avatar is one portable \`.avatar.json\` definition (schema \`bible-strong/avatar-definition\`, v1).
It holds a body, two colors, named expressions and named animations. The same file drives
\`@bible-strong/avatar-react\`, \`@bible-strong/avatar-web\` and \`@bible-strong/avatar-core\`.

## Recommended workflow

1. \`list_templates\` to see character templates, surfaces, bundled expressions and animations.
2. \`create_avatar\` (one) or \`create_avatar_set\` (many) from compact specs. Unspecified values
   come from the chosen character template; behavior is inherited from the bundled library.
3. Look at the returned preview, then refine with \`edit_avatar\` (atomic list of operations).
4. \`render_avatar\` for SVG/PNG snapshots of any expression or animation frame.
5. Save with \`outputPath\`/\`outputDir\` and integrate the JSON in an app.

## Coordinate system

- The canvas is 300×300 units centered on (0, 0); the default sphere has a 120 unit radius.
- x grows to the right, y grows downward (negative y is up), positive z comes toward the viewer.
- The primary surface carries the face and the eyes. Up to 16 secondary body nodes (ears, arms,
  antennas, horns, clouds…) have their own surface, \`position\` [x, y, z] and \`rotation\`
  [x, y, z] in degrees. Nodes with z > 0 render in front of the face, z < 0 behind it.
- Keep the silhouette within roughly ±140 units so nothing is clipped.

## Surfaces

Types: ${Object.keys(surfacePresets).join(', ')} (\`mickey\` and \`cursor\` are primary-only).
A surface is a type name or an object such as \`{ "type": "cube", "roundness": 0.7 }\`; omitted
dimensions use the preset. \`roundness\`, \`morphRoundness\`, \`tipRoundness\` and \`baseRoundness\`
range from 0 to 2.

## Eyes and expressions

- Eyes are ellipses on the face: \`width\`, \`height\`, \`x\`/\`y\` offset and \`angle\` per eye, plus
  a shared \`spacing\`. Default neutral eyes: width 20, height 50, y -7, spacing 35.
- Eye specs accept shared fields (\`{ "height": 60 }\` affects both eyes) and per-eye overrides
  (\`{ "left": { "angle": 12 } }\`).
- \`neutral\` is the required resting expression. Changing \`neutralEyes\` shifts every inherited
  expression by the same delta so they stay relative to the neutral appearance.
- An expression also sets \`head\` rotation in degrees (x pitches: positive looks up, negative
  down; y turns: positive looks right, negative left; z tilts), \`perspective\` (0.1–10, default 1), ambient \`motion\`
  (eyes: none | microSaccades | shake, body: none | slowDrift | shake) and optional temporary
  \`colors\` overrides.
- Custom expressions start from \`basedOn\` (any existing or bundled expression, default
  \`neutral\`) and override only what you specify. Squint: lower eye height. Surprise: taller,
  wider eyes. Anger/sadness: opposite eye angles. Looking aside: head y plus eye x.

## Animations

An animation is a list of steps \`{ expression, holdMs, transitionMs, transition }\`
(transition: spring | smooth | snappy), a \`playbackMode\` (loop | once | pingPong) and blink
settings. Steps that reference bundled expressions missing from the avatar pull them in
automatically.

## Keys and limits

Expression and animation keys are lowercase kebab-case (\`happy-wave\`). Up to 128 expressions,
64 animations and 128 steps per animation. Colors are \`#rrggbb\`.

## Integration

\`\`\`tsx
import { Avatar } from '@bible-strong/avatar-react'
import '@bible-strong/avatar-react/styles.css'
import definition from './nova.avatar.json'

<Avatar definition={definition} defaultAnimation="idle" />
\`\`\`

\`\`\`ts
import { createAvatar } from '@bible-strong/avatar-web'
const avatar = createAvatar('#avatar', { definition, defaultAnimation: 'idle' })
avatar.play('happy')
\`\`\`
`

export const templateCatalog = () => ({
  characters: characterTemplates.map(template => ({
    key: template.key,
    name: template.name,
    colors: template.colors,
    primarySurface: template.body.primary.type,
    secondaryNodes: template.body.nodes.length,
  })),
  surfaces: surfacePresets,
  bundledExpressions: baseBehaviorDefinition.expressionOrder,
  bundledAnimations: baseBehaviorDefinition.animationOrder.map(key => {
    const animation = baseBehaviorDefinition.animations[key]!
    return {
      key,
      group: animation.metadata?.group,
      playbackMode: animation.playbackMode,
      expressions: [...new Set(animation.steps.map(step => step.expression))],
    }
  }),
})
