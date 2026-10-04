import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const templates = path.join(root, 'packages/avatar-mcp/src/templates')
const document = JSON.parse(
  await readFile(path.join(root, 'src/features/studio/defaultStudioDocument.json'), 'utf8')
)

const slug = name =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const characters = document.library.avatars.map(({ id, name, body, colors, eyes }) => ({
  key: slug(name),
  studioId: id,
  name,
  body: {
    primary: body.primary,
    nodes: body.nodes.map(({ surface, position, rotation }) => ({ surface, position, rotation })),
  },
  colors,
  neutralEyes: {
    left: {
      width: eyes.widthLeft,
      height: eyes.heightLeft,
      x: eyes.positionXLeft,
      y: eyes.positionYLeft,
      angle: eyes.leftAngle,
    },
    right: {
      width: eyes.widthRight,
      height: eyes.heightRight,
      x: eyes.positionXRight,
      y: eyes.positionYRight,
      angle: eyes.rightAngle,
    },
    spacing: eyes.spacing,
  },
}))

await writeFile(path.join(templates, 'characters.json'), `${JSON.stringify(characters, null, 2)}\n`)
// The Strobi consumer fixture is the Studio export of the base behavior library.
await copyFile(
  path.join(root, 'examples/react-vite-consumer/src/strobi.avatar.json'),
  path.join(templates, 'base.avatar.json')
)
console.log(`Wrote ${characters.length} character templates and the base behavior library.`)
