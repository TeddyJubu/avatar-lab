import { createRequire } from 'node:module'
import path from 'node:path'

type Resvg = new (
  svg: string,
  options?: { fitTo?: { mode: 'width'; value: number }; font?: { loadSystemFonts?: boolean } }
) => { render(): { asPng(): Uint8Array } }

let resvgLoader: Promise<Resvg | undefined> | undefined

/** npm's default global module folder, which ESM resolution never searches. */
const globalModulesDirectory = () => {
  const prefix = process.env.npm_config_prefix ?? path.dirname(path.dirname(process.execPath))
  return process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules')
    : path.join(prefix, 'lib', 'node_modules')
}

const loadResvg = async (): Promise<Resvg | undefined> => {
  try {
    return ((await import('@resvg/resvg-js')) as unknown as { Resvg: Resvg }).Resvg
  } catch {
    // The self-contained plugin bundle has no node_modules; accept a global installation.
    try {
      const require = createRequire(import.meta.url)
      const resolved = require.resolve('@resvg/resvg-js', { paths: [globalModulesDirectory()] })
      return (require(resolved) as { Resvg: Resvg }).Resvg
    } catch {
      return undefined
    }
  }
}

/**
 * Rasterizes SVG with the optional `@resvg/resvg-js` dependency. Returns undefined when the native
 * module is unavailable so callers can fall back to SVG output.
 */
export const svgToPng = async (svg: string, width?: number): Promise<Uint8Array | undefined> => {
  resvgLoader ??= loadResvg()
  const Resvg = await resvgLoader
  if (!Resvg) return undefined
  return new Resvg(svg, {
    ...(width ? { fitTo: { mode: 'width', value: width } } : {}),
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng()
}
