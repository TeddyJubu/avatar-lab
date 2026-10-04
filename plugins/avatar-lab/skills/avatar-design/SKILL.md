---
name: avatar-design
description: Design Bible Strong procedural SVG avatars and avatar sets with the avatar-lab MCP tools. Use when the user asks for avatars, mascots, characters, bot faces or a set of avatars, or wants to edit, preview, animate or export a .avatar.json file.
---

# Designing avatars with avatar-lab

The `avatar-lab` MCP server builds validated `.avatar.json` definitions. The same file works in the
Studio, `@bible-strong/avatar-react` and `@bible-strong/avatar-web`.

## Workflow

1. Call `get_authoring_guide` once per session for the coordinate system and expression rules, and
   `list_templates` for character templates, surfaces and bundled expressions and animations.
2. Plan the set before calling any tools: a shared palette, a distinct silhouette for each avatar
   (template, primary surface, body nodes such as ears, antennas or arms) and a personality (neutral
   eyes, a few custom expressions).
3. Create:
   - one avatar: `create_avatar` with `outputPath`;
   - several: `create_avatar_set` with explicit `avatars` specs (or `variations` for quick
     exploration) and an `outputDir`. Put common colors, eyes or behavior in `shared`.
4. Review the returned preview or contact sheet critically. Fix clipped parts (keep everything
   within about ±140 units), illegible eye contrast, and avatars that look too similar.
5. Refine with `edit_avatar` using `path` so the file is updated in place. Every edit list applies
   atomically.
6. Use `render_avatar` for final snapshots (`.png` or `.svg`, optional solid or gradient
   background) or to check an animation frame with `animation` and `atMs`.

## Spec tips

- Omitted fields come from the template (`strobi` by default). Body `nodes` replace the template's
  nodes. Negative y is up; nodes with z < 0 sit behind the face and z > 0 in front.
- `neutralEyes` moves every inherited expression with it. Shared eye fields such as
  `{ "height": 60 }` apply to both eyes; `left` and `right` override per eye.
- Keep behavior small when the user does not need everything:
  `"behavior": { "animations": ["idle", "happy", "thinking"] }` brings in exactly the expressions
  those animations use.
- Custom expressions start from `basedOn` and override only what you give. Custom animations may
  reference bundled expressions; they are added automatically.
- Keys are lowercase kebab-case. Colors are `#rrggbb`.

## Handing off

Report the files written and show how to use them:

```tsx
import { Avatar } from '@bible-strong/avatar-react'
import '@bible-strong/avatar-react/styles.css'
import definition from './avatars/nova.avatar.json'

;<Avatar definition={definition} defaultAnimation="idle" />
```

Files can also be imported in the Studio at https://avatars.bible-strong.app.
