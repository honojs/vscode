import { describe, expect, it } from 'vitest'
import { buildBundledHonoRequestArgv } from './argvBuilder'

describe('buildBundledHonoRequestArgv', () => {
  it('builds argv for bundled @hono/cli request', () => {
    const argv = buildBundledHonoRequestArgv({
      entry: '/ext/node_modules/@hono/cli/dist/cli.js',
      watch: true,
      input: {
        method: 'post',
        path: '/posts',
        data: 'body=hello',
        headers: ['Content-Type: application/x-www-form-urlencoded', 'X-Test: 1'],
      },
      extraArgs: ['--foo'],
    })

    expect(argv).toEqual([
      '/ext/node_modules/@hono/cli/dist/cli.js',
      'request',
      '-P',
      '/posts',
      '-X',
      'POST',
      '-d',
      'body=hello',
      '-H',
      'Content-Type: application/x-www-form-urlencoded',
      '-H',
      'X-Test: 1',
      '--watch',
      '--foo',
    ])
  })
})
