import { createAvatarFromSpec } from '../authoring'
import {
  createWorkspaceAvatarDocument,
  unwrapWorkspaceDocument,
  workspaceAvatarKey,
} from '../workspace'

const definition = (() => {
  const result = createAvatarFromSpec({ name: 'Été Bot', behavior: { include: 'none' } })
  if (!result.ok) throw new Error(result.errors[0]?.message)
  return result.value
})()

it('derives stable document keys from avatar names', () => {
  expect(workspaceAvatarKey('Été Bot')).toBe('ete-bot')
  expect(workspaceAvatarKey('  ')).toBe('avatar')
})

it('wraps definitions in workspace documents', () => {
  expect(createWorkspaceAvatarDocument(definition, 3, new Date('2026-01-02T03:04:05Z'))).toEqual({
    name: 'Été Bot',
    definition,
    order: 3,
    updatedAt: '2026-01-02T03:04:05.000Z',
    updatedBy: 'claude',
  })
})

it('unwraps documents, saved database reads and bare definitions', () => {
  const document = createWorkspaceAvatarDocument(definition, 0)
  expect(unwrapWorkspaceDocument(definition)).toBe(definition)
  expect(unwrapWorkspaceDocument(document)).toBe(definition)
  expect(unwrapWorkspaceDocument({ id: 'ete-bot', version: 4, data: document })).toBe(definition)
  expect(unwrapWorkspaceDocument({ other: true })).toEqual({ other: true })
})
