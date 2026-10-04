# @teddyjubu/avatar-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any MCP-capable agent
(Claude Code, Claude Desktop, Cursor, VS Code, custom Agent SDK apps…) design, edit, validate and
render Bible Strong procedural avatars, one at a time or as whole sets.

Every avatar it produces is a validated `.avatar.json` definition that works with
`@bible-strong/avatar-react`, `@bible-strong/avatar-web` and `@bible-strong/avatar-core`, and can
be imported into the Studio.

Maintained by [TeddyJubu](https://github.com/TeddyJubu/avatar-lab). Built on
[Bible Strong Avatar Lab](https://github.com/smontlouis/bible-strong-avatar-lab) by Stéphane
Montlouis-Calixte.

## Run it

As a Claude Code plugin (adds a design skill and an `/avatar-lab:avatar-set` command too):

```text
/plugin marketplace add TeddyJubu/avatar-lab
/plugin install avatar-lab@bible-strong-avatar-lab
```

From npm, for any MCP client:

```sh
npx -y @teddyjubu/avatar-mcp --root ./my-avatars
```

From this repository:

```sh
pnpm install
pnpm --filter @teddyjubu/avatar-mcp build
node packages/avatar-mcp/dist/cli.js --root ./my-avatars
```

The server talks over stdio. `--root` (or `AVATAR_MCP_ROOT`) sets the directory that every file
read and write must stay inside; it defaults to the current directory.

### Claude Code without the plugin

```sh
claude mcp add avatar-lab -- npx -y @teddyjubu/avatar-mcp
```

### Claude Desktop, Cursor and other clients

```json
{
  "mcpServers": {
    "avatar-lab": {
      "command": "npx",
      "args": ["-y", "@teddyjubu/avatar-mcp", "--root", "/absolute/path/to/output"]
    }
  }
}
```

## Tools

| Tool                  | Purpose                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `get_authoring_guide` | Coordinate system, surfaces, eye and expression semantics, limits and integration snippets. |
| `list_templates`      | Character templates, surface presets, bundled expressions and animations.                   |
| `get_avatar_schema`   | The v1 JSON Schema for `.avatar.json` files.                                                |
| `create_avatar`       | Build one avatar from a compact spec; returns the definition and a PNG preview.             |
| `create_avatar_set`   | Build many avatars from specs and/or seeded variations; writes files and a contact sheet.   |
| `edit_avatar`         | Apply an atomic list of edit operations to a definition or file.                            |
| `validate_avatar`     | Validate a definition and summarize its expressions and animations.                         |
| `render_avatar`       | Render an expression or an animation frame as SVG or PNG with optional backgrounds.         |

| `prepare_workspace` | Write the workspace artifact page and runtime, and return the Artifact publish parameters. |
| `export_workspace_docs` | Turn avatars into workspace database documents and ready-to-send ArtifactData batch writes. |

Resources: `avatar://guide`, `avatar://schema` and `avatar://templates/base`. Prompt:
`design_avatar_set`.

## Workspace artifact

`workspace/index.html` is a live studio page meant to be published as a claude.ai Artifact with the
`db`, `user`, `sample` and `downloads` capabilities. It loads `avatar-lab.js`, a browser bundle of
this package plus `@bible-strong/avatar-web`, and renders whatever is stored in its database:
`avatars/<key>` documents, a `workspace/view` document that steers the stage, and `requests/<id>`
documents people leave for Claude. The npm package ships both files in `dist/workspace`, and
`--workspace <directory>` points the server at another copy. See the plugin README for the full
data contract.

## Specs

Specs are deliberately small: everything omitted comes from the character template (`strobi` by
default) and the bundled behavior library.

```json
{
  "name": "Bunny",
  "template": "strobi",
  "colors": { "body": "#f6c1d0" },
  "body": {
    "primary": { "type": "sphere", "width": 200, "height": 200, "depth": 200 },
    "nodes": [
      {
        "surface": { "type": "capsule", "width": 40, "height": 110, "depth": 30 },
        "position": [-45, -120, -20],
        "rotation": [0, 0, -12]
      },
      {
        "surface": { "type": "capsule", "width": 40, "height": 110, "depth": 30 },
        "position": [45, -120, -20],
        "rotation": [0, 0, 12]
      }
    ]
  },
  "neutralEyes": { "height": 40, "width": 22 },
  "behavior": {
    "animations": ["idle", "happy"],
    "customExpressions": { "wink": { "eyes": { "left": { "height": 10 } } } },
    "customAnimations": {
      "greet": { "steps": [{ "expression": "wink" }, { "expression": "joyful-wide" }] }
    }
  }
}
```

- Changing `neutralEyes` shifts every inherited expression by the same delta, exactly like the
  Studio, so expressions stay relative to the neutral appearance.
- `behavior.include: "none"` keeps only `neutral`; `behavior.animations` and
  `behavior.expressions` inherit a subset. Custom animations automatically pull in any bundled
  expression they reference.
- `create_avatar_set` accepts `variations: { count, seed, templates, palette, namePrefix }` to
  generate deterministic sets, and `shared` defaults for colors, eyes and behavior.
- `face` adds an optional mouth and whiskers (drawn in the eye color unless they set `color`):
  `{ "mouth": { "thickness": 3, "x": 0, "y": 50, "width": 22, "curve": 4, "cat": 1 },
"whiskers": { "count": 3, "thickness": 2, "x": 70, "y": 42, "length": 44 } }`. Expressions
  animate them with partial overrides such as `"mouth": { "curve": 8, "open": 6 }` and
  `"whiskers": { "angle": 12 }`; the `set_face` edit changes or removes them.

## Library use

The authoring functions are framework-independent and exported for scripts:

```ts
import { createAvatarFromSpec, editAvatarDefinition, renderAvatarSvg } from '@teddyjubu/avatar-mcp'

const result = createAvatarFromSpec({ name: 'Nova', template: 'nova' })
if (result.ok) console.log(renderAvatarSvg(result.value, { expression: 'joyful-wide' }))
```

PNG output uses the optional `@resvg/resvg-js` dependency (also found in npm's global folder);
without it, tools fall back to SVG.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](./LICENSE).

## Templates

The character templates and base behavior library mirror the Studio's bundled document. Tests
assert that every template reproduces the Studio's own avatar export. Regenerate
`src/templates/characters.json` and `src/templates/base.avatar.json` with `pnpm mcp:templates`
when the bundled document changes.
