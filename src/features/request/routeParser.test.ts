import { describe, expect, it } from 'vitest'
import { parseJSDocExamplesFromText, parseRoutesFromText } from './routeParser'

describe('parseRoutesFromText', () => {
  it('parses route method, path, and callStartIndex', () => {
    const text = [
      "import { Hono } from 'hono';",
      'const app = new Hono();',
      "app.get('/hello', (c) => c.text('ok'));",
    ].join('\n')

    const routes = parseRoutesFromText(text)
    expect(routes).toHaveLength(1)
    expect(routes[0]?.method).toBe('get')
    expect(routes[0]?.path).toBe('/hello')

    const idx = routes[0]!.callStartIndex
    expect(text.slice(idx, idx + 7)).toBe('app.get')
  })

  it('does not shift index to previous line when the call is at the beginning of a line', () => {
    const text = 'const app = new Hono();\napp.post("/posts", () => {});\n'
    const routes = parseRoutesFromText(text)
    expect(routes).toHaveLength(1)
    expect(text.slice(routes[0]!.callStartIndex, routes[0]!.callStartIndex + 8)).toBe('app.post')
  })

  it('ignores route-like calls inside comments', () => {
    const text = [
      'const app = new Hono();',
      '// app.get("/nope", () => {})',
      '/* app.post("/nope2", () => {}) */',
      'app.get("/ok", () => {})',
    ].join('\n')

    const routes = parseRoutesFromText(text, { excludeComments: true })
    expect(routes).toHaveLength(1)
    expect(routes[0]?.path).toBe('/ok')
  })
})

describe('parseJSDocExamplesFromText', () => {
  it('parses single-line JSON from @example', () => {
    const text = [
      '/**',
      ' * @example',
      ' * POST { "name": "John" }',
      ' */',
      'app.post("/users", (c) => c.text("ok"));',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(1)
    expect(examples[0]?.method).toBe('post')
    expect(examples[0]?.jsonBody).toBe('{ "name": "John" }')
    expect(examples[0]?.routePath).toBe('/users')
    expect(examples[0]?.routeMethod).toBe('post')
  })

  it('parses multiline JSON from @example', () => {
    const text = [
      '/**',
      ' * @example',
      ' * POST {',
      ' *   "name": "John",',
      ' *   "age": 30',
      ' * }',
      ' */',
      'app.post("/users", (c) => c.text("ok"));',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(1)
    expect(examples[0]?.method).toBe('post')
    expect(examples[0]?.jsonBody).toContain('"name": "John"')
    expect(examples[0]?.jsonBody).toContain('"age": 30')
    expect(examples[0]?.routePath).toBe('/users')
  })

  it('ignores @example when method does not match route', () => {
    const text = [
      '/**',
      ' * @example',
      ' * GET { "query": "test" }',
      ' */',
      'app.post("/users", (c) => c.text("ok"));',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(0)
  })

  it('parses multiple @examples in one JSDoc', () => {
    const text = [
      '/**',
      ' * @example',
      ' * POST { "name": "John" }',
      ' * @example',
      ' * POST { "name": "Jane" }',
      ' */',
      'app.post("/users", (c) => c.text("ok"));',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(2)
    expect(examples[0]?.jsonBody).toBe('{ "name": "John" }')
    expect(examples[1]?.jsonBody).toBe('{ "name": "Jane" }')
  })

  it('returns empty array when no @example found', () => {
    const text = [
      '/**',
      ' * Some description',
      ' */',
      'app.post("/users", (c) => c.text("ok"));',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(0)
  })

  it('returns empty array when no route follows JSDoc', () => {
    const text = [
      '/**',
      ' * @example',
      ' * POST { "name": "John" }',
      ' */',
      'const foo = "bar";',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(0)
  })

  it('captures methodStartIndex correctly', () => {
    const text = [
      '/**',
      ' * @example',
      ' * POST { "name": "John" }',
      ' */',
      'app.post("/users", (c) => c.text("ok"));',
    ].join('\n')

    const examples = parseJSDocExamplesFromText(text)
    expect(examples).toHaveLength(1)
    const idx = examples[0]!.methodStartIndex
    expect(text.slice(idx, idx + 4)).toBe('POST')
  })
})
