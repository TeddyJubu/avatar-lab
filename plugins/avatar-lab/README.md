# avatar-lab Claude Code plugin

Design, edit, validate and render Bible Strong procedural SVG avatars, one at a time or as whole
sets, directly from Claude Code.

Maintained by [TeddyJubu](https://github.com/TeddyJubu/avatar-lab). Built on
[Bible Strong Avatar Lab](https://github.com/smontlouis/bible-strong-avatar-lab) by Stéphane
Montlouis-Calixte.

## Install

```text
/plugin marketplace add TeddyJubu/avatar-lab
/plugin install avatar-lab@bible-strong-avatar-lab
```

Restart Claude Code after installing. Node.js 22.12 or newer must be on your `PATH`.

## What it adds

- **MCP server `avatar-lab`** with the tools `get_authoring_guide`, `list_templates`,
  `get_avatar_schema`, `create_avatar`, `create_avatar_set`, `edit_avatar`, `validate_avatar`,
  `render_avatar`, `prepare_workspace` and `export_workspace_docs`.
- **Workspace artifact**, a live studio page published to claude.ai that acts as the front end.
- **Skill `avatar-design`**, which Claude uses automatically when you ask for avatars, mascots or
  character sets, or mention the workspace.
- **Commands** `/avatar-lab:avatar-set <theme>`, which designs and saves a themed set into
  `avatars/`, and `/avatar-lab:workspace [instruction]`, which opens the workspace, syncs your
  avatar files and answers requests left in it.

The server reads and writes files only inside the directory Claude Code was started in. Set
`AVATAR_MCP_ROOT` to choose another directory.

## The workspace

Run `/avatar-lab:workspace` (or ask Claude to "open the avatar workspace"). Claude publishes the page
in `workspace/` as a private claude.ai Artifact and saves its link in `.avatar-lab/workspace.json`.

The page renders every avatar stored in its database, plays any expression or animation, and lets
you rename, recolor, import, export and delete avatars. Everything it shows lives in the artifact's
shared database, which is also Claude's control surface:

| Document         | Contents                                                   | Written by                |
| ---------------- | ---------------------------------------------------------- | ------------------------- |
| `avatars/<key>`  | `{ name, definition, order, updatedAt, updatedBy }`        | Claude and the page       |
| `workspace/view` | `{ selected, expression, animation, background, caption }` | Claude, to steer the page |
| `requests/<id>`  | `{ text, avatar, status, reply, createdAt }`               | the page; Claude replies  |

Claude writes these with its ArtifactData tool. `export_workspace_docs` turns `.avatar.json` files
into ready-to-send writes that reference files on disk, so large definitions never pass through
the conversation. Changes made in the page are visible to Claude on its next read.

In the page, **Ask here** runs Claude inside the workspace with page functions as tools
(`create_avatar`, `edit_avatar`, `show`), using the viewer's own Claude usage. **Leave for Claude
Code** adds a request to `requests/` that your coding session picks up and answers.

The workspace needs a Claude Code session with Artifacts (claude.ai sign-in). Without it, the
plugin still works with files and previews.

## Previews

The bundled server needs no installation and returns SVG previews. To get PNG previews and
contact sheets that Claude can see, install the optional rasterizer once:

```sh
npm install --global @resvg/resvg-js
```

Alternatively, run the npm package, which installs it automatically:
`claude mcp add avatar-lab -- npx -y @teddyjubu/avatar-mcp`.

## Development

`server/avatar-mcp.mjs`, `workspace/index.html` and `workspace/avatar-lab.js` are generated from
`packages/avatar-mcp` (the page source is `packages/avatar-mcp/workspace/index.html`). Run
`pnpm plugin` after changing them; `pnpm check` fails when they are stale.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](./LICENSE).
