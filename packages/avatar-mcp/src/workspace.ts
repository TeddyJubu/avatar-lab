import { avatarDefinitionFileName, type AvatarDefinition } from '@bible-strong/avatar-core'

/**
 * Data contract shared by the workspace artifact page and Claude.
 *
 * The page keeps everything in the artifact's `db` capability; Claude reads and writes the same
 * documents with the ArtifactData tool:
 *
 * - `avatars/<key>`: one avatar, `{ name, definition, order, updatedAt, updatedBy }`.
 * - `workspace/view`: what the page shows, `{ selected, expression, animation, background, caption }`.
 * - `requests/<id>`: requests people typed in the page for Claude,
 *   `{ text, avatar, status: "open" | "done", reply, createdAt }`.
 */
export const WORKSPACE_COLLECTIONS = {
  avatars: 'avatars',
  workspace: 'workspace',
  requests: 'requests',
} as const

export const WORKSPACE_VIEW_DOC = 'view'

/** Capabilities the workspace page declares when it is published. */
export const WORKSPACE_CAPABILITIES = {
  db: {},
  user: {},
  sample: {},
  downloads: true,
} as const

export type WorkspaceAvatarDocument = {
  name: string
  definition: AvatarDefinition
  order: number
  updatedAt: string
  updatedBy: 'claude' | 'workspace'
}

export type WorkspaceView = {
  selected?: string
  expression?: string
  animation?: string
  background?:
    | { type: 'transparent' }
    | { type: 'solid'; color: string }
    | { type: 'linear' | 'radial'; from: string; to: string }
  caption?: string
}

/** A document id derived from the avatar name, e.g. "Pixel Pal" -> "pixel-pal". */
export const workspaceAvatarKey = (name: string) =>
  avatarDefinitionFileName(name).replace(/\.avatar\.json$/, '')

export const createWorkspaceAvatarDocument = (
  definition: Readonly<AvatarDefinition>,
  order: number,
  now = new Date()
): WorkspaceAvatarDocument => ({
  name: definition.name ?? 'Avatar',
  definition: definition as AvatarDefinition,
  order,
  updatedAt: now.toISOString(),
  updatedBy: 'claude',
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Accepts a bare definition, a workspace avatar document, or a saved ArtifactData read that wraps
 * the document in `data`, and returns the definition-shaped value inside.
 */
export const unwrapWorkspaceDocument = (value: unknown): unknown => {
  let current = value
  for (let depth = 0; depth < 3 && isRecord(current) && !('schema' in current); depth += 1) {
    if (isRecord(current.definition)) current = current.definition
    else if (isRecord(current.data)) current = current.data
    else break
  }
  return current
}
