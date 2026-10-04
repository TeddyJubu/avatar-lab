import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

import packageJson from './package.json' with { type: 'json' }

const dependencies = [
  ...Object.keys(packageJson.dependencies),
  ...Object.keys(packageJson.optionalDependencies),
]

export default defineConfig({
  build: {
    target: 'node22',
    ssr: true,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        cli: fileURLToPath(new URL('./src/cli.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    sourcemap: true,
    rollupOptions: {
      // The schema JSON is inlined because Node requires import attributes for JSON modules.
      external: id =>
        id !== '@bible-strong/avatar-core/schema' &&
        (builtinModules.includes(id.replace(/^node:/, '')) ||
          dependencies.some(name => id === name || id.startsWith(`${name}/`))),
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
})
