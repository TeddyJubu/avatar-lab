/**
 * Browser runtime for the Avatar Lab workspace artifact. Bundled as an IIFE exposing the global
 * `AvatarLab`, so the page renders, plays and authors avatars with exactly the same code as the
 * MCP server.
 */
import {
  avatarDefinitionFileName,
  parseAvatarDefinition,
  validateAvatarDefinition,
} from '@bible-strong/avatar-core'
import { createAvatar } from '@bible-strong/avatar-web'

import {
  createAvatarFromSpec,
  describeAvatar,
  editAvatarDefinition,
  generateAvatarVariations,
} from './authoring'
import { authoringGuide, templateCatalog } from './guide'
import { renderAvatarSvg } from './svg'
import { AVATAR_MCP_VERSION } from './version'

export {
  AVATAR_MCP_VERSION as version,
  authoringGuide,
  avatarDefinitionFileName,
  createAvatar,
  createAvatarFromSpec,
  describeAvatar,
  editAvatarDefinition,
  generateAvatarVariations,
  parseAvatarDefinition,
  renderAvatarSvg,
  templateCatalog,
  validateAvatarDefinition,
}
