#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { AVATAR_MCP_VERSION, createAvatarMcpServer } from './server'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`avatar-mcp ${AVATAR_MCP_VERSION}

Model Context Protocol server (stdio) for designing Bible Strong procedural avatars.

Usage: avatar-mcp [--root <directory>] [--workspace <directory>]

  --root <directory>       Directory that file reads and writes must stay inside.
                           Defaults to AVATAR_MCP_ROOT or the current directory.
  --workspace <directory>  Directory holding the workspace artifact page and runtime.
                           Defaults to the workspace folder shipped with this package.
`)
  process.exit(0)
}
if (args.includes('--version')) {
  process.stdout.write(`${AVATAR_MCP_VERSION}\n`)
  process.exit(0)
}

const flag = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const root = flag('--root') ?? process.env.AVATAR_MCP_ROOT
const workspaceDir = flag('--workspace') ?? fileURLToPath(new URL('./workspace/', import.meta.url))

const server = createAvatarMcpServer({ ...(root ? { root } : {}), workspaceDir })
await server.connect(new StdioServerTransport())
