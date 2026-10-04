---
description: Design a cohesive set of procedural avatars for a theme and save it to ./avatars
argument-hint: <theme, e.g. "five friendly support bots">
---

Use the avatar-design skill and the avatar-lab MCP tools to design a cohesive avatar set for:
$ARGUMENTS

Unless the request says otherwise, create about six avatars, inherit only the `idle`, `listening`,
`thinking`, `happy` and `surprised` animations, and save the set with `create_avatar_set` into
`avatars/<theme-slug>/`. Review the contact sheet, refine anything clipped, illegible or too similar
with `edit_avatar`, then summarize the avatars and the files written. If this project has an Avatar
Lab workspace (`.avatar-lab/workspace.json`), also push the set to it with `export_workspace_docs`
and ArtifactData, and set `workspace/view` to show the first avatar with a short caption.
