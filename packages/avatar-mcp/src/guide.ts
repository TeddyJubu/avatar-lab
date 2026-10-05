import { surfacePresets } from '@bible-strong/avatar-core'

import { baseBehaviorDefinition, characterTemplates } from './templates'

export const authoringGuide = () => `# Bible Strong avatar authoring guide

An avatar is one portable \`.avatar.json\` definition (schema \`bible-strong/avatar-definition\`, v1).
It holds a body, two colors, an optional mouth and whiskers, named expressions and named
animations. The same file drives
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
- A node can set its own \`color\` (pink inner ears, a nose, a belly patch); otherwise it is
  drawn in the body color, expression tints included. Nodes paint from back to front, so give a
  decoration a few units more z than the node it sits on. Change or clear it with
  \`update_body_node\` (\`"color": null\` returns to the body color).
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
  expression by the same delta so they stay relative to the neutral appearance. Eye sizes never
  go below 10; bundled expressions are rebuilt from the library on \`set_neutral_eyes\`, so closed
  and squinting eyes still close after the neutral eyes grow.
- An expression also sets \`head\` rotation in degrees (x pitches: positive looks up, negative
  down; y turns: positive looks right, negative left; z tilts), \`perspective\` (0.1–10, default 1), ambient \`motion\`
  (eyes: none | microSaccades | shake, body: none | slowDrift | shake) and optional temporary
  \`colors\` overrides.
- Custom expressions start from \`basedOn\` (any existing or bundled expression, default
  \`neutral\`) and override only what you specify. Squint: lower eye height. Surprise: taller,
  wider eyes. Anger/sadness: opposite eye angles. Looking aside: head y plus eye x.
- The bundled \`angry-brows\` and \`uneasy-left\` expressions tint the fur with the library's dark
  red (and dark red eyes) and pale blue, whatever the palette. \`"moodColors": "match"\` in a spec
  (or in \`shared\` for a set), or the \`set_mood_colors\` edit, derives both tints from the
  avatar's own colors instead and keeps its eyes readable on them (contrast of at least 4.5:1).
  Matched tints follow later \`set_colors\` edits; \`"mode": "library"\` restores the shared ones.

## Mouth and whiskers

An avatar can add an optional \`face\` with a \`mouth\` and \`whiskers\`, drawn in the eye color unless
they set their own \`color\`. Both live in the same facial frame as the eyes (y grows downward;
the eyes sit near y 0, the chin near y 100 on the default sphere).

- \`mouth\`: \`thickness\`, center \`x\`/\`y\`, \`width\` (0 hides it), \`curve\` (how far the middle
  bows below the corners: positive smiles, negative frowns), \`cat\` (0 single curve, 1 cat "ω"
  with two lobes), \`open\` (depth of the opening, 0 closed) and \`tilt\` in degrees. Example:
  \`{ "thickness": 3, "x": 0, "y": 50, "width": 22, "curve": 4, "cat": 1 }\`.
- \`whiskers\`: \`count\` per side (1–4), root \`thickness\` (tips taper), right-hand root \`x\`/\`y\`
  (mirrored on the left), vertical \`gap\` between roots, \`length\` (0 hides them), \`angle\` of
  the whole fan in degrees (positive raises the tips), \`spread\` in degrees between neighbouring
  whiskers and tip \`curve\` (droop).
  Example: \`{ "count": 3, "thickness": 2, "x": 70, "y": 42, "length": 44, "spread": 10 }\`.
- Expressions animate them with partial overrides that transitions interpolate:
  \`"mouth": { "curve": 8, "open": 6 }\`, \`"whiskers": { "angle": 12, "spread": 16 }\`. Smile:
  higher curve. Laugh or meow: add open. Surprise: small width, curve 0, open. Sad: negative
  curve with drooping whiskers (negative angle, positive curve). Smirk: tilt.
- Set them with the spec's \`face\`, change them with the \`set_face\` edit (merges; \`null\`
  removes a feature), and override them per expression with \`mouth\`/\`whiskers\` in an
  expression spec (\`null\` clears inherited overrides).
- Whiskers stick out past the head, so keep root \`x\` + \`length\` within the ±140 frame.

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
