---
description: Open the live Avatar Lab workspace artifact, sync local avatars to it and answer open requests
argument-hint: [optional instruction, e.g. "show Nova playing happy"]
---

Use the avatar-design skill to work in the Avatar Lab workspace artifact.

1. Find the workspace URL in `.avatar-lab/workspace.json`. If there is none, call
   `prepare_workspace`, publish the page with the Artifact tool using its `publish` parameters, and
   save the URL there.
2. Sync every `avatars/**/*.avatar.json` file in this project that is missing from or newer than the
   workspace: list the `avatars` collection, call `export_workspace_docs` for the files, and send the
   writes with ArtifactData `batch` (adding `if_version` for documents that already exist).
3. Query open `requests`, handle each one, and mark it done with a one-sentence reply.
4. Then do this, if given: $ARGUMENTS
5. Finish by writing `workspace/view` so the page shows the most relevant avatar, and reply with
   the workspace link and a short summary.
