import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as vscode from 'vscode'
import { findEntryPointCandidates } from './entryPointResolver'

vi.mock('node:fs')
vi.mock('vscode', () => ({
  Uri: {
    parse: (uri: string) => ({ fsPath: uri.replace('file://', '') }),
  },
}))

describe('findEntryPointCandidates', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('includes candidate when file contains both "new Hono" and ".route"', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      const app = new Hono()
      app.route('/api', apiRoutes)
      export default app
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).toContain('src/index.ts')
  })

  it('excludes candidate when file contains only "new Hono"', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      const app = new Hono()
      app.get('/', (c) => c.text('Hello'))
      export default app
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).not.toContain('src/index.ts')
  })

  it('excludes candidate when file contains only ".route"', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      app.route('/api', apiRoutes)
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).not.toContain('src/index.ts')
  })

  it('excludes candidate when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).not.toContain('src/index.ts')
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })

  it('adds currently editing file at the beginning if not in candidates', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/src/routes/user.ts')

    expect(result[0]).toBe('src/routes/user.ts')
  })

  it('does not duplicate currently editing file if already in candidates', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      const app = new Hono()
      app.route('/api', apiRoutes)
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/src/index.ts')

    expect(result.filter((c) => c === 'src/index.ts')).toHaveLength(1)
  })

  it('excludes candidate when "new Hono" is in a line comment', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      // const app = new Hono()
      app.route('/api', apiRoutes)
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).not.toContain('src/index.ts')
  })

  it('excludes candidate when ".route" is in a block comment', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      const app = new Hono()
      /* app.route('/api', apiRoutes) */
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).not.toContain('src/index.ts')
  })

  it('includes candidate when both are outside comments', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/workspace/src/index.ts')
    vi.mocked(fs.readFileSync).mockReturnValue(`
      // This is a comment about new Hono
      const app = new Hono()
      /* route setup below */
      app.route('/api', apiRoutes)
    `)

    const result = findEntryPointCandidates('/workspace', 'file:///workspace/other.ts')

    expect(result).toContain('src/index.ts')
  })
})
