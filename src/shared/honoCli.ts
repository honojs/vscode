import * as fs from 'node:fs'
import * as path from 'node:path'

export function resolveBundledHonoCliEntry(extensionPath: string): string {
  // English comment: Resolve the bundled @hono/cli entry script shipped with this extension.
  try {
    const pkgJsonPath = require.resolve('@hono/cli/package.json', { paths: [extensionPath] })
    const pkgDir = path.dirname(pkgJsonPath)
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
      bin?: string | Record<string, string>
    }

    let relBin: string | undefined
    if (typeof pkg.bin === 'string') {
      relBin = pkg.bin
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      relBin = pkg.bin['hono'] ?? Object.values(pkg.bin)[0]
    }

    if (!relBin) throw new Error('bin field not found in @hono/cli package.json')
    return path.resolve(pkgDir, relBin)
  } catch (e) {
    const fallback = path.join(extensionPath, 'node_modules', '@hono', 'cli', 'dist', 'cli.js')
    if (fs.existsSync(fallback)) return fallback
    throw e
  }
}
