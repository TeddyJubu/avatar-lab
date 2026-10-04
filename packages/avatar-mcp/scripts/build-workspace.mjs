import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'rolldown'

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = path.dirname(path.dirname(packageRoot))

export const workspacePagePath = path.join(packageRoot, 'workspace', 'index.html')

/** Bundles `src/browser.ts` into the `AvatarLab` global loaded by the workspace page. */
export const buildWorkspaceRuntime = async () => {
  const result = await build({
    input: path.join(packageRoot, 'src/browser.ts'),
    platform: 'browser',
    logLevel: 'silent',
    write: false,
    resolve: {
      alias: {
        '@bible-strong/avatar-core': path.join(repositoryRoot, 'packages/avatar-core/src/index.ts'),
        '@bible-strong/avatar-web': path.join(repositoryRoot, 'packages/avatar-web/src/index.ts'),
      },
    },
    output: { format: 'iife', name: 'AvatarLab', minify: true, codeSplitting: false },
  })
  const chunk = result.output.find(item => item.type === 'chunk')
  if (!chunk) throw new Error('Avatar Lab workspace runtime was not generated.')
  return `/*! Avatar Lab workspace runtime - AGPL-3.0-only - https://github.com/TeddyJubu/avatar-lab */\n${chunk.code}`
}

/** Writes the workspace page and runtime into `directory`. */
export const writeWorkspace = async directory => {
  await mkdir(directory, { recursive: true })
  await copyFile(workspacePagePath, path.join(directory, 'index.html'))
  await writeFile(path.join(directory, 'avatar-lab.js'), await buildWorkspaceRuntime())
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeWorkspace(path.resolve(process.argv[2] ?? path.join(packageRoot, 'dist/workspace')))
}
