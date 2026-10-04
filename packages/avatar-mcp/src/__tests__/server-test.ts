import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { parseAvatarDefinition } from '@bible-strong/avatar-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { createAvatarMcpServer } from '../server'

let root: string
let client: Client

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'avatar-mcp-test-'))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createAvatarMcpServer({ root }).connect(serverTransport)
  client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(clientTransport)
})

afterEach(async () => {
  await client.close()
  await rm(root, { recursive: true, force: true })
})

const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as CallToolResult

const texts = (result: CallToolResult) =>
  result.content.flatMap(item => (item.type === 'text' ? [item.text] : []))

it('exposes the avatar authoring tools, resources and prompt', async () => {
  const { tools } = await client.listTools()
  expect(tools.map(tool => tool.name).sort()).toEqual([
    'create_avatar',
    'create_avatar_set',
    'edit_avatar',
    'get_authoring_guide',
    'get_avatar_schema',
    'list_templates',
    'render_avatar',
    'validate_avatar',
  ])
  const { resources } = await client.listResources()
  expect(resources.map(resource => resource.uri)).toEqual([
    'avatar://guide',
    'avatar://schema',
    'avatar://templates/base',
  ])
  const { prompts } = await client.listPrompts()
  expect(prompts.map(prompt => prompt.name)).toEqual(['design_avatar_set'])
})

it('creates, saves, edits and renders an avatar', async () => {
  const created = await call('create_avatar', {
    spec: {
      name: 'Pixel Pal',
      template: 'cubee',
      colors: { body: '#22aa88' },
      behavior: { animations: ['idle', 'happy'] },
    },
    outputPath: 'avatars/pixel-pal.avatar.json',
  })
  expect(created.isError).toBeFalsy()
  expect(created.content.some(item => item.type === 'image')).toBe(true)
  const saved = parseAvatarDefinition(
    await readFile(path.join(root, 'avatars/pixel-pal.avatar.json'), 'utf8')
  )
  if (!saved.ok) throw new Error(saved.errors[0]?.message)
  expect(saved.value.animationOrder).toEqual(['idle', 'happy'])

  const edited = await call('edit_avatar', {
    path: 'avatars/pixel-pal.avatar.json',
    operations: [{ op: 'set_colors', eyes: '#ffffff' }],
    preview: false,
    includeDefinition: false,
  })
  expect(edited.isError).toBeFalsy()
  expect(await readFile(path.join(root, 'avatars/pixel-pal.avatar.json'), 'utf8')).toContain(
    '"eyes": "#ffffff"'
  )

  const rendered = await call('render_avatar', {
    path: 'avatars/pixel-pal.avatar.json',
    animation: 'happy',
    atMs: 1200,
    background: { type: 'radial', from: '#ffffff', to: '#ddeeff' },
    format: 'svg',
    outputPath: 'avatars/pixel-pal.svg',
  })
  expect(rendered.isError).toBeFalsy()
  const svg = await readFile(path.join(root, 'avatars/pixel-pal.svg'), 'utf8')
  expect(svg).toContain('<radialGradient')
  expect(texts(rendered).at(-1)).toBe(svg)
})

it('writes a whole avatar set with a manifest and contact sheet', async () => {
  const result = await call('create_avatar_set', {
    avatars: [{ name: 'Captain', template: 'freddy' }],
    variations: { count: 3, seed: 7, namePrefix: 'Crew' },
    shared: { behavior: { animations: ['idle'] } },
    outputDir: 'crew',
  })
  expect(result.isError).toBeFalsy()
  const manifest = JSON.parse(await readFile(path.join(root, 'crew/index.json'), 'utf8'))
  expect(manifest.avatars.map((avatar: { name: string }) => avatar.name)).toEqual([
    'Captain',
    'Crew 1',
    'Crew 2',
    'Crew 3',
  ])
  for (const avatar of manifest.avatars) {
    const parsed = parseAvatarDefinition(
      await readFile(path.join(root, 'crew', avatar.definition), 'utf8')
    )
    expect(parsed.ok).toBe(true)
    expect(avatar.animations).toEqual(['idle'])
  }
  expect(await readFile(path.join(root, 'crew/contact-sheet.svg'), 'utf8')).toContain('Captain')
})

it('rejects invalid input and paths outside the workspace root', async () => {
  const invalid = await call('create_avatar_set', {
    avatars: [{ name: 'Fine' }, { name: 'Broken', template: 'unknown' }],
    outputDir: 'set',
  })
  expect(invalid.isError).toBe(true)
  expect(texts(invalid)[0]).toContain('/avatars/1/template')

  const escaped = await call('create_avatar', { spec: {}, outputPath: '../escape.avatar.json' })
  expect(escaped.isError).toBe(true)
  expect(texts(escaped)[0]).toContain('outside the workspace root')

  const validation = await call('validate_avatar', { definition: '{"schema": 1}' })
  expect(validation.isError).toBe(true)
})
