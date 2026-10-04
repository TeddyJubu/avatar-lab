# avatar-lab Claude Code plugin

Design, edit, validate and render Bible Strong procedural SVG avatars, one at a time or as whole
sets, directly from Claude Code.

## Install

```text
/plugin marketplace add smontlouis/bible-strong-avatar-lab
/plugin install avatar-lab@bible-strong-avatar-lab
```

Restart Claude Code after installing. Node.js 22.12 or newer must be on your `PATH`.

## What it adds

- **MCP server `avatar-lab`** with the tools `get_authoring_guide`, `list_templates`,
  `get_avatar_schema`, `create_avatar`, `create_avatar_set`, `edit_avatar`, `validate_avatar` and
  `render_avatar`.
- **Skill `avatar-design`**, which Claude uses automatically when you ask for avatars, mascots or
  character sets.
- **Command `/avatar-lab:avatar-set <theme>`**, which designs and saves a themed set into
  `avatars/`.

The server reads and writes files only inside the directory Claude Code was started in. Set
`AVATAR_MCP_ROOT` to choose another directory.

## Previews

The bundled server needs no installation and returns SVG previews. To get PNG previews and
contact sheets that Claude can see, install the optional rasterizer once:

```sh
npm install --global @resvg/resvg-js
```

Alternatively, run the npm package, which installs it automatically:
`claude mcp add avatar-lab -- npx -y @bible-strong/avatar-mcp`.

## Development

The server in `server/avatar-mcp.mjs` is generated from `packages/avatar-mcp`. Run `pnpm plugin`
after changing it; `pnpm check` fails when the bundle is stale.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](./LICENSE).
