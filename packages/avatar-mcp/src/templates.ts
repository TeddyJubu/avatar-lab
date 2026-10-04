import {
  validateAvatarDefinition,
  type AvatarBodyDefinition,
  type AvatarColorsDefinition,
  type AvatarDefinition,
  type AvatarExpressionDefinition,
} from '@bible-strong/avatar-core'

import baseDefinitionJson from './templates/base.avatar.json'
import charactersJson from './templates/characters.json'

export type NeutralEyes = AvatarExpressionDefinition['eyes']

export type CharacterTemplate = {
  key: string
  studioId: string
  name: string
  body: AvatarBodyDefinition
  colors: AvatarColorsDefinition
  neutralEyes: NeutralEyes
}

const validatedBase = validateAvatarDefinition(baseDefinitionJson)
if (!validatedBase.ok) {
  throw new Error(`Bundled base behavior library is invalid: ${validatedBase.errors[0]?.message}`)
}

/**
 * The bundled Base behavior library, exported from the Studio's default document. Its neutral eyes
 * are the Studio defaults, so every other expression is relative to them.
 */
export const baseBehaviorDefinition: Readonly<AvatarDefinition> = validatedBase.value

export const characterTemplates = charactersJson as unknown as readonly CharacterTemplate[]

export const DEFAULT_TEMPLATE_KEY = 'strobi'

export const findCharacterTemplate = (key: string) =>
  characterTemplates.find(template => template.key === key)
