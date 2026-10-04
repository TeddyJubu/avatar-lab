import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      '@bible-strong/avatar-core/schema': path.join(
        root,
        'packages/avatar-core/src/avatarDefinition.schema.json'
      ),
      '@bible-strong/avatar-core': path.join(root, 'packages/avatar-core/src/index.ts'),
      '@bible-strong/avatar-web': path.join(root, 'packages/avatar-web/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*-test.{ts,tsx}', 'packages/**/__tests__/**/*-test.{ts,tsx}'],
  },
})
