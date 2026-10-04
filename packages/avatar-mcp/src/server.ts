import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  avatarDefinitionFileName,
  parseAvatarDefinition,
  validateAvatarDefinition,
  type AvatarDefinition,
  type AvatarDefinitionError,
  type ValidationResult,
} from '@bible-strong/avatar-core'
import avatarDefinitionSchema from '@bible-strong/avatar-core/schema'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import {
  createAvatarFromSpec,
  describeAvatar,
  editAvatarDefinition,
  generateAvatarVariations,
  type AvatarSpec,
} from './authoring'
import { authoringGuide, templateCatalog } from './guide'
import {
  avatarSpecSchema,
  backgroundSchema,
  behaviorSpecSchema,
  definitionInputSchema,
  editOperationSchema,
} from './schemas'
import { svgToPng } from './png'
import { renderAvatarSvg, renderContactSheetSvg, type SvgBackground } from './svg'
import { baseBehaviorDefinition } from './templates'
import { AVATAR_MCP_VERSION } from './version'
import {
  createWorkspaceAvatarDocument,
  unwrapWorkspaceDocument,
  WORKSPACE_CAPABILITIES,
  WORKSPACE_COLLECTIONS,
  WORKSPACE_VIEW_DOC,
  workspaceAvatarKey,
} from './workspace'

export { AVATAR_MCP_VERSION }

const MAX_SET_SIZE = 64
const PREVIEW_SIZE = 256

export type AvatarMcpServerOptions = {
  /** Directory that every file read or write must stay inside. Defaults to `process.cwd()`. */
  root?: string
  /** Directory holding the workspace artifact (`index.html` and `avatar-lab.js`). */
  workspaceDir?: string
}

type Content = CallToolResult['content'][number]

const text = (value: string): Content => ({ type: 'text', text: value })
const json = (value: unknown): Content => text(JSON.stringify(value, null, 2))

const errorResult = (
  message: string,
  errors?: readonly AvatarDefinitionError[]
): CallToolResult => ({
  isError: true,
  content: [text(errors?.length ? `${message}\n${JSON.stringify(errors, null, 2)}` : message)],
})

const pngContent = async (svg: string, width: number): Promise<Content> => {
  const png = await svgToPng(svg, width)
  return png
    ? { type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' }
    : text(svg)
}

export const createAvatarMcpServer = ({
  root = process.cwd(),
  workspaceDir,
}: AvatarMcpServerOptions = {}) => {
  const workspaceRoot = path.resolve(root)
  const server = new McpServer(
    { name: 'bible-strong-avatar-lab', version: AVATAR_MCP_VERSION },
    {
      instructions:
        'Design procedural SVG avatars and avatar sets. Start with list_templates, create with ' +
        'create_avatar or create_avatar_set, refine with edit_avatar and preview with render_avatar. ' +
        'Read get_authoring_guide for the coordinate system and expression semantics. ' +
        'To show avatars in a live workspace artifact, call prepare_workspace, publish it, and ' +
        'sync avatars with export_workspace_docs and the ArtifactData tool.',
    }
  )

  const resolvePath = (requested: string) => {
    const resolved = path.resolve(workspaceRoot, requested)
    const relative = path.relative(workspaceRoot, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path '${requested}' is outside the workspace root '${workspaceRoot}'`)
    }
    return resolved
  }

  const writeWorkspaceFile = async (requested: string, contents: string | Uint8Array) => {
    const target = resolvePath(requested)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
    return path.relative(workspaceRoot, target) || '.'
  }

  const loadDefinition = async ({
    definition,
    path: definitionPath,
  }: {
    definition?: string | Record<string, unknown>
    path?: string
  }): Promise<ValidationResult<AvatarDefinition>> => {
    if (definitionPath !== undefined) {
      const source = await readFile(resolvePath(definitionPath), 'utf8')
      // Workspace documents saved from the artifact database wrap the definition.
      let parsed: unknown
      try {
        parsed = JSON.parse(source)
      } catch {
        return parseAvatarDefinition(source)
      }
      const unwrapped = unwrapWorkspaceDocument(parsed)
      return unwrapped === parsed
        ? parseAvatarDefinition(source)
        : validateAvatarDefinition(unwrapped)
    }
    if (definition === undefined) {
      return {
        ok: false,
        errors: [
          { path: '', code: 'missing_definition', message: "Provide 'definition' or 'path'" },
        ],
      }
    }
    return typeof definition === 'string'
      ? parseAvatarDefinition(definition)
      : validateAvatarDefinition(unwrapWorkspaceDocument(definition))
  }

  const serialize = (definition: Readonly<AvatarDefinition>) =>
    `${JSON.stringify(definition, null, 2)}\n`

  /** Runs a tool body and converts thrown errors into MCP tool errors the agent can act on. */
  const guarded = async (run: () => Promise<CallToolResult>): Promise<CallToolResult> => {
    try {
      return await run()
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error))
    }
  }

  server.registerTool(
    'get_authoring_guide',
    {
      title: 'Avatar authoring guide',
      description:
        'Explains the avatar model: coordinate system, surfaces, eyes, expressions, animations, limits and app integration. Read this first.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({ content: [text(authoringGuide())] })
  )

  server.registerTool(
    'list_templates',
    {
      title: 'List templates and building blocks',
      description:
        'Lists character templates (body, colors and eyes to start from), surface presets, and the bundled expressions and animations every avatar can inherit.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({ content: [json(templateCatalog())] })
  )

  server.registerTool(
    'get_avatar_schema',
    {
      title: 'Avatar definition JSON Schema',
      description: 'Returns the JSON Schema (Draft 2020-12) for .avatar.json definition files.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({ content: [json(avatarDefinitionSchema)] })
  )

  server.registerTool(
    'create_avatar',
    {
      title: 'Create an avatar',
      description:
        'Builds one validated avatar definition from a compact spec. Omitted values come from the character template; behavior inherits the bundled expressions and animations unless narrowed. Returns the definition and a preview image.',
      inputSchema: {
        spec: avatarSpecSchema,
        outputPath: z
          .string()
          .optional()
          .describe('Write the .avatar.json here (relative to the workspace root)'),
        previewPath: z.string().optional().describe('Also write an SVG preview here'),
        preview: z.boolean().optional().describe('Include a PNG preview image (default true)'),
        includeDefinition: z
          .boolean()
          .optional()
          .describe('Return the full definition JSON (default true; false returns a summary)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ spec, outputPath, previewPath, preview = true, includeDefinition = true }) =>
      guarded(async () => {
        const result = createAvatarFromSpec(spec as AvatarSpec)
        if (!result.ok) return errorResult('The avatar spec is invalid.', result.errors)
        const definition = result.value
        const svg = renderAvatarSvg(definition, { size: PREVIEW_SIZE })
        const written = [
          ...(outputPath ? [await writeWorkspaceFile(outputPath, serialize(definition))] : []),
          ...(previewPath ? [await writeWorkspaceFile(previewPath, svg)] : []),
        ]
        return {
          content: [
            json({ summary: describeAvatar(definition), written }),
            ...(includeDefinition ? [text(serialize(definition))] : []),
            ...(preview ? [await pngContent(svg, PREVIEW_SIZE)] : []),
          ],
        }
      })
  )

  server.registerTool(
    'create_avatar_set',
    {
      title: 'Create an avatar set',
      description:
        'Creates many avatars at once, from explicit specs and/or generated variations of the character templates. Writes one .avatar.json (plus an SVG preview) per avatar and an index.json manifest when outputDir is given, and returns a contact sheet of the whole set.',
      inputSchema: {
        avatars: z.array(avatarSpecSchema).max(MAX_SET_SIZE).optional(),
        variations: z
          .object({
            count: z.number().int().min(1).max(MAX_SET_SIZE),
            seed: z.number().int().optional().describe('Same seed, same set (default 1)'),
            templates: z.array(z.string()).optional().describe('Template keys to draw from'),
            namePrefix: z.string().max(100).optional(),
            palette: z.array(z.string()).optional().describe('Body colors to cycle through'),
          })
          .optional()
          .describe('Generate varied avatars automatically'),
        shared: z
          .object({
            colors: avatarSpecSchema.shape.colors,
            neutralEyes: avatarSpecSchema.shape.neutralEyes,
            behavior: behaviorSpecSchema.optional(),
          })
          .optional()
          .describe('Defaults applied to every avatar unless that avatar overrides them'),
        outputDir: z.string().optional().describe('Directory for the set files (relative to root)'),
        previewExpression: z
          .string()
          .optional()
          .describe('Expression shown in previews and the contact sheet (default neutral)'),
        includeDefinitions: z
          .boolean()
          .optional()
          .describe('Return every definition inline (default: only when outputDir is omitted)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ avatars = [], variations, shared, outputDir, previewExpression, includeDefinitions }) =>
      guarded(async () => {
        const specs: AvatarSpec[] = [
          ...(avatars as AvatarSpec[]),
          ...(variations ? generateAvatarVariations(variations) : []),
        ].map(spec => ({
          ...spec,
          ...(shared?.behavior && !spec.behavior ? { behavior: shared.behavior } : {}),
          ...(shared?.colors ? { colors: { ...shared.colors, ...spec.colors } } : {}),
          ...(shared?.neutralEyes && !spec.neutralEyes ? { neutralEyes: shared.neutralEyes } : {}),
        }))
        if (!specs.length) return errorResult("Provide 'avatars', 'variations' or both.")
        if (specs.length > MAX_SET_SIZE) {
          return errorResult(`A set can contain at most ${MAX_SET_SIZE} avatars.`)
        }

        const created: { definition: Readonly<AvatarDefinition>; fileName: string }[] = []
        const failures: {
          index: number
          name?: string
          errors: readonly AvatarDefinitionError[]
        }[] = []
        const usedNames = new Set<string>()
        specs.forEach((spec, index) => {
          const result = createAvatarFromSpec({ ...spec, name: spec.name ?? `Avatar ${index + 1}` })
          if (!result.ok) {
            failures.push({
              index,
              ...(spec.name ? { name: spec.name } : {}),
              errors: result.errors,
            })
            return
          }
          const base = avatarDefinitionFileName(result.value.name ?? `avatar-${index + 1}`).replace(
            /\.avatar\.json$/,
            ''
          )
          let fileName = base
          for (let suffix = 2; usedNames.has(fileName); suffix += 1) fileName = `${base}-${suffix}`
          usedNames.add(fileName)
          created.push({ definition: result.value, fileName })
        })
        if (failures.length) {
          return errorResult(
            `${failures.length} of ${specs.length} avatar specs are invalid; nothing was written.`,
            failures.flatMap(failure =>
              failure.errors.map(error => ({
                ...error,
                path: `/avatars/${failure.index}${error.path}`,
              }))
            )
          )
        }

        const expressionFor = (definition: Readonly<AvatarDefinition>) =>
          previewExpression && definition.expressions[previewExpression]
            ? previewExpression
            : 'neutral'
        const written: string[] = []
        if (outputDir) {
          for (const { definition, fileName } of created) {
            written.push(
              await writeWorkspaceFile(
                path.join(outputDir, `${fileName}.avatar.json`),
                serialize(definition)
              ),
              await writeWorkspaceFile(
                path.join(outputDir, `${fileName}.svg`),
                renderAvatarSvg(definition, {
                  size: PREVIEW_SIZE,
                  expression: expressionFor(definition),
                })
              )
            )
          }
          written.push(
            await writeWorkspaceFile(
              path.join(outputDir, 'index.json'),
              `${JSON.stringify(
                {
                  schema: 'bible-strong/avatar-set',
                  avatars: created.map(({ definition, fileName }) => ({
                    name: definition.name,
                    definition: `${fileName}.avatar.json`,
                    preview: `${fileName}.svg`,
                    colors: definition.colors,
                    expressions: definition.expressionOrder.length,
                    animations: definition.animationOrder,
                  })),
                },
                null,
                2
              )}\n`
            )
          )
        }
        const sheet = renderContactSheetSvg(
          created.map(({ definition }) => ({
            definition,
            options: { expression: expressionFor(definition) },
          }))
        )
        if (outputDir)
          written.push(await writeWorkspaceFile(path.join(outputDir, 'contact-sheet.svg'), sheet))

        const inline = includeDefinitions ?? !outputDir
        return {
          content: [
            json({
              created: created.map(({ definition, fileName }) => ({
                fileName: `${fileName}.avatar.json`,
                ...describeAvatar(definition),
                expressions: definition.expressionOrder.length,
              })),
              written,
            }),
            ...(inline ? created.map(({ definition }) => text(serialize(definition))) : []),
            await pngContent(
              sheet,
              Math.min(1600, Number(/width="(\d+)"/.exec(sheet)?.[1] ?? 800))
            ),
          ],
        }
      })
  )

  server.registerTool(
    'edit_avatar',
    {
      title: 'Edit an avatar',
      description:
        'Applies an ordered list of edit operations atomically (all succeed and validate, or nothing changes): rename, recolor, change body surfaces and nodes, move neutral eyes, add, change or remove the mouth and whiskers, add/update/remove expressions and animations, reorder.',
      inputSchema: {
        ...definitionInputSchema,
        operations: z.array(editOperationSchema).min(1).max(200),
        outputPath: z
          .string()
          .optional()
          .describe('Where to save the result; defaults to the input path when one was given'),
        preview: z.boolean().optional().describe('Include a PNG preview image (default true)'),
        previewExpression: z.string().optional(),
        includeDefinition: z
          .boolean()
          .optional()
          .describe('Return the full definition (default true)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({
      definition,
      path: inputPath,
      operations,
      outputPath,
      preview = true,
      previewExpression,
      includeDefinition = true,
    }) =>
      guarded(async () => {
        const loaded = await loadDefinition({ definition, path: inputPath })
        if (!loaded.ok) return errorResult('The input definition is invalid.', loaded.errors)
        const result = editAvatarDefinition(loaded.value, operations)
        if (!result.ok)
          return errorResult('The edits were rejected; nothing changed.', result.errors)
        const edited = result.value
        const target = outputPath ?? inputPath
        const written = target ? [await writeWorkspaceFile(target, serialize(edited))] : []
        const expression =
          previewExpression && edited.expressions[previewExpression] ? previewExpression : 'neutral'
        return {
          content: [
            json({ summary: describeAvatar(edited), written }),
            ...(includeDefinition ? [text(serialize(edited))] : []),
            ...(preview
              ? [
                  await pngContent(
                    renderAvatarSvg(edited, { size: PREVIEW_SIZE, expression }),
                    PREVIEW_SIZE
                  ),
                ]
              : []),
          ],
        }
      })
  )

  server.registerTool(
    'validate_avatar',
    {
      title: 'Validate an avatar definition',
      description:
        'Validates a definition against the v1 schema and semantic rules, returning JSON Pointer errors or a summary of its expressions and animations.',
      inputSchema: definitionInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    input =>
      guarded(async () => {
        const loaded = await loadDefinition(input)
        if (!loaded.ok) return errorResult('Invalid avatar definition.', loaded.errors)
        return { content: [json({ valid: true, summary: describeAvatar(loaded.value) })] }
      })
  )

  server.registerTool(
    'render_avatar',
    {
      title: 'Render an avatar snapshot',
      description:
        'Renders an expression, or a frame of an animation, as SVG or PNG with an optional solid or gradient background.',
      inputSchema: {
        ...definitionInputSchema,
        expression: z.string().optional().describe('Expression key (default neutral)'),
        animation: z.string().optional().describe('Render a frame of this animation instead'),
        atMs: z.number().min(0).max(600000).optional().describe('Animation time in milliseconds'),
        size: z
          .number()
          .int()
          .min(16)
          .max(4096)
          .optional()
          .describe('Output size in pixels (default 512)'),
        scale: z.number().min(0.1).max(4).optional().describe('Zoom factor (default 1)'),
        background: backgroundSchema.optional(),
        format: z.enum(['png', 'svg']).optional().describe('Returned format (default png)'),
        outputPath: z.string().optional().describe('Write the snapshot (.svg or .png) here'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({
      definition,
      path: inputPath,
      expression,
      animation,
      atMs,
      size = 512,
      scale,
      background,
      format = 'png',
      outputPath,
    }) =>
      guarded(async () => {
        const loaded = await loadDefinition({ definition, path: inputPath })
        if (!loaded.ok) return errorResult('Invalid avatar definition.', loaded.errors)
        if (expression && !loaded.value.expressions[expression]) {
          return errorResult(
            `Unknown expression '${expression}'. Available: ${loaded.value.expressionOrder.join(', ')}`
          )
        }
        if (animation && !loaded.value.animations[animation]) {
          return errorResult(
            `Unknown animation '${animation}'. Available: ${loaded.value.animationOrder.join(', ') || 'none'}`
          )
        }
        const svg = renderAvatarSvg(loaded.value, {
          ...(expression ? { expression } : {}),
          ...(animation ? { animation } : {}),
          ...(atMs === undefined ? {} : { atMs }),
          ...(scale === undefined ? {} : { scale }),
          size,
          background: (background ?? { type: 'transparent' }) as SvgBackground,
        })
        const written: string[] = []
        if (outputPath) {
          if (outputPath.toLowerCase().endsWith('.png')) {
            const png = await svgToPng(svg, size)
            if (!png)
              return errorResult(
                'PNG rendering is unavailable; install @resvg/resvg-js or use .svg.'
              )
            written.push(await writeWorkspaceFile(outputPath, png))
          } else {
            written.push(await writeWorkspaceFile(outputPath, svg))
          }
        }
        return {
          content: [
            ...(written.length ? [json({ written })] : []),
            format === 'svg' ? text(svg) : await pngContent(svg, size),
          ],
        }
      })
  )

  server.registerTool(
    'prepare_workspace',
    {
      title: 'Prepare the workspace artifact',
      description:
        'Writes the Avatar Lab workspace page (index.html plus the avatar-lab.js runtime) into the workspace root and returns the exact Artifact publish parameters. The published page is a live studio: it renders every avatar stored in its database, plays expressions and animations, lets people edit and ask for changes, and follows the view Claude sets.',
      inputSchema: {
        dir: z
          .string()
          .optional()
          .describe('Where to write the page (relative to root, default .avatar-lab/workspace)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ dir = '.avatar-lab/workspace' }) =>
      guarded(async () => {
        if (!workspaceDir) {
          return errorResult('This server was started without a workspace directory (--workspace).')
        }
        const source = path.resolve(workspaceDir)
        const files = ['index.html', 'avatar-lab.js']
        for (const file of files) {
          try {
            await access(path.join(source, file))
          } catch {
            return errorResult(`Workspace file '${file}' is missing from ${source}.`)
          }
        }
        const target = resolvePath(dir)
        await mkdir(target, { recursive: true })
        for (const file of files) await copyFile(path.join(source, file), path.join(target, file))
        const page = path.join(target, 'index.html')
        const runtime = path.join(target, 'avatar-lab.js')
        return {
          content: [
            json({
              publish: {
                file_path: page,
                files: { 'avatar-lab.js': runtime },
                capabilities: WORKSPACE_CAPABILITIES,
                icon: 'avatar',
                description:
                  'Live Avatar Lab workspace: browse, play and edit procedural avatars with Claude.',
              },
              dataModel: {
                [`${WORKSPACE_COLLECTIONS.avatars}/<key>`]:
                  '{ name, definition, order, updatedAt, updatedBy } - one avatar; write with export_workspace_docs',
                [`${WORKSPACE_COLLECTIONS.workspace}/${WORKSPACE_VIEW_DOC}`]:
                  '{ selected, expression, animation, background, caption } - what the page shows',
                [`${WORKSPACE_COLLECTIONS.requests}/<id>`]:
                  '{ text, avatar, status: "open" | "done", reply, createdAt } - requests people left for Claude',
              },
              nextSteps: [
                'Publish with the Artifact tool using the publish parameters above (include icon only on the first publish; to update an existing workspace pass its url instead).',
                'Save the artifact URL in .avatar-lab/workspace.json so later sessions reuse it.',
                'Create avatars, then call export_workspace_docs and send the returned writes with ArtifactData action "batch".',
              ],
            }),
          ],
        }
      })
  )

  server.registerTool(
    'export_workspace_docs',
    {
      title: 'Export avatars as workspace documents',
      description:
        'Turns avatar definitions or .avatar.json files into workspace database documents. Writes one JSON file per document and returns ready-to-send ArtifactData batch writes that reference those files, so large definitions never pass through the conversation. Optionally also sets the view the page shows.',
      inputSchema: {
        avatars: z
          .array(
            z.object({
              ...definitionInputSchema,
              key: z
                .string()
                .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
                .optional()
                .describe('Document id (default: derived from the avatar name)'),
              order: z.number().optional().describe('Gallery position (default: list position)'),
            })
          )
          .max(50)
          .optional(),
        view: z
          .object({
            selected: z.string().optional().describe('Avatar key to show on the stage'),
            expression: z.string().optional(),
            animation: z.string().optional().describe('Animation to play on the stage'),
            background: backgroundSchema.optional(),
            caption: z.string().max(280).optional().describe('Short note shown above the stage'),
          })
          .optional()
          .describe('Also write workspace/view to steer what the page shows'),
        outDir: z
          .string()
          .optional()
          .describe('Where to write the document files (default .avatar-lab/db)'),
        orderOffset: z
          .number()
          .optional()
          .describe('Added to each default order, to append after existing avatars'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ avatars = [], view, outDir = '.avatar-lab/db', orderOffset = 0 }) =>
      guarded(async () => {
        if (!avatars.length && !view) return errorResult("Provide 'avatars', 'view' or both.")
        const writes: { op: 'set'; collection: string; doc_id: string; file_path: string }[] = []
        const keys = new Set<string>()
        for (const [index, input] of avatars.entries()) {
          const loaded = await loadDefinition(input)
          if (!loaded.ok) {
            return errorResult(
              `Avatar ${index} is invalid; nothing was written.`,
              loaded.errors.map(error => ({ ...error, path: `/avatars/${index}${error.path}` }))
            )
          }
          const key = input.key ?? workspaceAvatarKey(loaded.value.name ?? `avatar-${index + 1}`)
          if (keys.has(key)) return errorResult(`Duplicate workspace key '${key}'.`)
          keys.add(key)
          const document = createWorkspaceAvatarDocument(
            loaded.value,
            input.order ?? orderOffset + index
          )
          const relative = await writeWorkspaceFile(
            path.join(outDir, WORKSPACE_COLLECTIONS.avatars, `${key}.json`),
            `${JSON.stringify(document, null, 2)}\n`
          )
          writes.push({
            op: 'set',
            collection: WORKSPACE_COLLECTIONS.avatars,
            doc_id: key,
            file_path: path.join(workspaceRoot, relative),
          })
        }
        if (view) {
          const relative = await writeWorkspaceFile(
            path.join(outDir, WORKSPACE_COLLECTIONS.workspace, `${WORKSPACE_VIEW_DOC}.json`),
            `${JSON.stringify(view, null, 2)}\n`
          )
          writes.push({
            op: 'set',
            collection: WORKSPACE_COLLECTIONS.workspace,
            doc_id: WORKSPACE_VIEW_DOC,
            file_path: path.join(workspaceRoot, relative),
          })
        }
        return {
          content: [
            json({
              writes,
              howToSend:
                'Call ArtifactData with action "batch", the workspace url and these writes. Documents that already exist need if_version: list the collection first and add each current version.',
            }),
          ],
        }
      })
  )

  server.registerResource(
    'authoring-guide',
    'avatar://guide',
    { title: 'Avatar authoring guide', mimeType: 'text/markdown' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: authoringGuide() }],
    })
  )
  server.registerResource(
    'avatar-schema',
    'avatar://schema',
    { title: 'Avatar definition JSON Schema', mimeType: 'application/schema+json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/schema+json',
          text: JSON.stringify(avatarDefinitionSchema, null, 2),
        },
      ],
    })
  )
  server.registerResource(
    'base-behavior-library',
    'avatar://templates/base',
    {
      title: 'Base behavior library',
      description:
        'The bundled avatar definition whose expressions and animations every avatar inherits.',
      mimeType: 'application/json',
    },
    async uri => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: serialize(baseBehaviorDefinition) },
      ],
    })
  )

  server.registerPrompt(
    'design_avatar_set',
    {
      title: 'Design an avatar set',
      description: 'Guides the agent through designing a cohesive set of avatars for a theme.',
      argsSchema: {
        theme: z.string().describe('What the set is for, e.g. "five friendly support bots"'),
        count: z.string().optional().describe('How many avatars (default 6)'),
        outputDir: z.string().optional().describe('Where to save the set'),
      },
    },
    ({ theme, count, outputDir }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Design a cohesive set of ${count ?? '6'} procedural avatars for: ${theme}.`,
              '1. Call get_authoring_guide and list_templates.',
              '2. Choose a shared palette and give each avatar a distinct silhouette (template, primary surface, body nodes) and personality (neutral eyes, custom expressions).',
              `3. Call create_avatar_set with explicit specs${outputDir ? ` and outputDir "${outputDir}"` : ''}.`,
              '4. Inspect the contact sheet, then fix anything clipped, illegible or too similar with edit_avatar.',
            ].join('\n'),
          },
        },
      ],
    })
  )

  return server
}
