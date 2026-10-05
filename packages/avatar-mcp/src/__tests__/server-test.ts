import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  const workspaceDir = path.join(root, '.source-workspace')
  await mkdir(workspaceDir)
  await writeFile(path.join(workspaceDir, 'index.html'), '<title>Avatar Lab Workspace</title>')
  await writeFile(path.join(workspaceDir, 'avatar-lab.js'), 'var AvatarLab = {}')
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createAvatarMcpServer({ root, workspaceDir }).connect(serverTransport)
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
    'export_workspace_docs',
    'get_authoring_guide',
    'get_avatar_schema',
    'list_templates',
    'prepare_workspace',
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

it('matches mood tints to the palette through the set and edit tools', async () => {
  const set = await call('create_avatar_set', {
    avatars: [
      { name: 'Captain', template: 'freddy' },
      { name: 'Mate', template: 'nova', moodColors: 'library' },
    ],
    shared: { moodColors: 'match', behavior: { expressions: ['angry-brows'] } },
    outputDir: 'crew',
  })
  expect(set.isError).toBeFalsy()
  const angryTint = async (file: string) =>
    JSON.parse(await readFile(path.join(root, 'crew', file), 'utf8')).expressions['angry-brows']
      .colors
  expect(await angryTint('captain.avatar.json')).toEqual({ body: '#ff6c6b' })
  expect(await angryTint('mate.avatar.json')).toEqual({ body: '#ba3636', eyes: '#610000' })

  const edited = await call('edit_avatar', {
    path: 'crew/mate.avatar.json',
    operations: [{ op: 'set_mood_colors', mode: 'match' }],
    preview: false,
    includeDefinition: false,
  })
  expect(edited.isError).toBeFalsy()
  expect(await angryTint('mate.avatar.json')).toEqual({ body: '#0499a8' })
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

it('prepares the workspace artifact and exports avatars as database documents', async () => {
  const prepared = await call('prepare_workspace')
  expect(prepared.isError).toBeFalsy()
  const { publish } = JSON.parse(texts(prepared)[0]!)
  expect(publish).toMatchObject({
    capabilities: { db: {}, user: {}, sample: {}, downloads: true },
    icon: 'avatar',
  })
  expect(await readFile(publish.file_path, 'utf8')).toContain('Avatar Lab Workspace')
  expect(await readFile(publish.files['avatar-lab.js'], 'utf8')).toContain('AvatarLab')

  await call('create_avatar', {
    spec: { name: 'Pixel Pal', behavior: { animations: ['idle'] } },
    outputPath: 'avatars/pixel-pal.avatar.json',
    preview: false,
  })
  const exported = await call('export_workspace_docs', {
    avatars: [{ path: 'avatars/pixel-pal.avatar.json' }],
    view: { selected: 'pixel-pal', animation: 'idle', caption: 'Meet Pixel Pal' },
  })
  expect(exported.isError).toBeFalsy()
  const { writes } = JSON.parse(texts(exported)[0]!)
  expect(
    writes.map(
      (write: { collection: string; doc_id: string }) => `${write.collection}/${write.doc_id}`
    )
  ).toEqual(['avatars/pixel-pal', 'workspace/view'])
  const document = JSON.parse(await readFile(writes[0].file_path, 'utf8'))
  expect(document).toMatchObject({ name: 'Pixel Pal', order: 0, updatedBy: 'claude' })
  expect(parseAvatarDefinition(JSON.stringify(document.definition)).ok).toBe(true)
  expect(JSON.parse(await readFile(writes[1].file_path, 'utf8'))).toEqual({
    selected: 'pixel-pal',
    animation: 'idle',
    caption: 'Meet Pixel Pal',
  })

  // Documents saved back from the workspace can be edited directly.
  const relative = path.relative(root, writes[0].file_path)
  const edited = await call('edit_avatar', {
    path: relative,
    operations: [{ op: 'set_name', name: 'Pixel Pro' }],
    outputPath: 'avatars/pixel-pro.avatar.json',
    preview: false,
    includeDefinition: false,
  })
  expect(edited.isError).toBeFalsy()
  expect(await readFile(path.join(root, 'avatars/pixel-pro.avatar.json'), 'utf8')).toContain(
    '"name": "Pixel Pro"'
  )
})

it('adds an animated mouth and whiskers through the edit tool', async () => {
  const created = await call('create_avatar', {
    spec: { name: 'Mochi', behavior: { include: 'none' } },
    outputPath: 'avatars/mochi.avatar.json',
    preview: false,
  })
  expect(created.isError).toBeFalsy()

  const edited = await call('edit_avatar', {
    path: 'avatars/mochi.avatar.json',
    operations: [
      {
        op: 'set_face',
        mouth: { thickness: 3, x: 0, y: 50, width: 22, curve: 4, cat: 1 },
        whiskers: { count: 3, thickness: 2, x: 70, y: 42, length: 44 },
      },
      {
        op: 'upsert_expression',
        key: 'meow',
        expression: { mouth: { open: 8 }, whiskers: { angle: 10 } },
      },
    ],
    preview: false,
    includeDefinition: false,
  })
  expect(edited.isError).toBeFalsy()
  const saved = parseAvatarDefinition(
    await readFile(path.join(root, 'avatars/mochi.avatar.json'), 'utf8')
  )
  if (!saved.ok) throw new Error(saved.errors[0]?.message)
  expect(saved.value.face).toEqual({
    mouth: { thickness: 3, x: 0, y: 50, width: 22, curve: 4, cat: 1 },
    whiskers: { count: 3, thickness: 2, x: 70, y: 42, length: 44 },
  })
  expect(saved.value.expressions.meow).toMatchObject({
    mouth: { open: 8 },
    whiskers: { angle: 10 },
  })
})

it('gives body nodes their own color through the edit tool', async () => {
  const created = await call('create_avatar', {
    spec: { name: 'Bun', colors: { body: '#ffffff' }, behavior: { include: 'none' } },
    outputPath: 'avatars/bun.avatar.json',
    preview: false,
  })
  expect(created.isError).toBeFalsy()

  const edited = await call('edit_avatar', {
    path: 'avatars/bun.avatar.json',
    operations: [
      {
        op: 'add_body_node',
        node: { surface: 'capsule', position: [-36, -130, -16] },
      },
      {
        op: 'add_body_node',
        node: { surface: 'capsule', position: [-36, -134, -10], color: '#F8A' },
      },
      { op: 'update_body_node', index: 0, color: '#eeeeee' },
      { op: 'update_body_node', index: 0, color: null },
    ],
    preview: false,
    includeDefinition: false,
  })
  expect(edited.isError).toBeFalsy()
  const saved = parseAvatarDefinition(
    await readFile(path.join(root, 'avatars/bun.avatar.json'), 'utf8')
  )
  if (!saved.ok) throw new Error(saved.errors[0]?.message)
  expect(saved.value.body.nodes.map(node => node.color)).toEqual([undefined, '#ff88aa'])
})
