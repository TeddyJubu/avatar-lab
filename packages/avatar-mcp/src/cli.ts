#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { AVATAR_MCP_VERSION, createAvatarMcpServer } from './server'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`avatar-mcp ${AVATAR_MCP_VERSION}

Model Context Protocol server (stdio) for designing Bible Strong procedural avatars.

Usage: avatar-mcp [--root <directory>]

  --root <directory>  Directory that file reads and writes must stay inside.
                      Defaults to AVATAR_MCP_ROOT or the current directory.
`)
  process.exit(0)
}
if (args.includes('--version')) {
  process.stdout.write(`${AVATAR_MCP_VERSION}\n`)
  process.exit(0)
}

const rootFlag = args.indexOf('--root')
const root = (rootFlag >= 0 ? args[rootFlag + 1] : undefined) ?? process.env.AVATAR_MCP_ROOT

const server = createAvatarMcpServer(root ? { root } : {})
await server.connect(new StdioServerTransport())
