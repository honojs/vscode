import { describe, expect, it } from 'vitest'
import { parseRoutesFromText } from './routeParser'

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

  describe('dynamic route patterns', () => {
    it('parses routes with constant references', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        "const API_PATH = '/api';",
        "const USERS_PATH = '/users';",
        'app.get(API_PATH, (c) => c.text("api"));',
        'app.post(USERS_PATH, (c) => c.text("users"));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(2)
      expect(routes[0]?.method).toBe('get')
      expect(routes[0]?.path).toBe('/api')
      expect(routes[1]?.method).toBe('post')
      expect(routes[1]?.path).toBe('/users')
    })

    it('parses routes with string concatenation', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        "app.get('/api' + '/users', (c) => c.json([]));",
        'app.post("/posts" + "/create", (c) => c.text("created"));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(2)
      expect(routes[0]?.method).toBe('get')
      expect(routes[0]?.path).toBe('/api/users')
      expect(routes[1]?.method).toBe('post')
      expect(routes[1]?.path).toBe('/posts/create')
    })

    it('parses routes with constant concatenation', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        "const BASE = '/api';",
        "app.get(BASE + '/users', (c) => c.json([]));",
        'app.post("/v1" + BASE, (c) => c.text("ok"));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(2)
      expect(routes[0]?.method).toBe('get')
      expect(routes[0]?.path).toBe('/api/users')
      expect(routes[1]?.method).toBe('post')
      expect(routes[1]?.path).toBe('/v1/api')
    })

    it('parses routes with template literals containing variables', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        'const version = "v1";',
        'const resource = "users";',
        'app.get(`/api/${version}/users`, (c) => c.json([]));',
        'app.post(`/api/${version}/${resource}`, (c) => c.text("ok"));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(2)
      expect(routes[0]?.method).toBe('get')
      expect(routes[0]?.path).toBe('/api/${version}/users')
      expect(routes[1]?.method).toBe('post')
      expect(routes[1]?.path).toBe('/api/${version}/${resource}')
    })

    it('parses routes with no-substitution template literals', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        'app.get(`/api/users`, (c) => c.json([]));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(1)
      expect(routes[0]?.method).toBe('get')
      expect(routes[0]?.path).toBe('/api/users')
    })

    it('parses routes with mixed constant and template literals', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        "const BASE_PATH = '/api';",
        'const version = "v2";',
        'app.get(`${BASE_PATH}/${version}/users`, (c) => c.json([]));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(1)
      expect(routes[0]?.method).toBe('get')
      expect(routes[0]?.path).toBe('${BASE_PATH}/${version}/users')
    })

    it('handles multiple route methods', () => {
      const text = [
        "import { Hono } from 'hono';",
        'const app = new Hono();',
        "const API = '/api';",
        'app.get(API, (c) => c.text("get"));',
        'app.post(API, (c) => c.text("post"));',
        'app.put(API, (c) => c.text("put"));',
        'app.delete(API, (c) => c.text("delete"));',
        'app.patch(API, (c) => c.text("patch"));',
      ].join('\n')

      const routes = parseRoutesFromText(text)
      expect(routes).toHaveLength(5)
      expect(routes.map((r) => r.method)).toEqual(['get', 'post', 'put', 'delete', 'patch'])
      expect(routes.every((r) => r.path === '/api')).toBe(true)
    })

    it('ignores dynamic routes in comments', () => {
      const text = [
        'const app = new Hono();',
        'const API_PATH = "/api";',
        '// app.get(API_PATH, () => {})',
        '/* app.post(API_PATH, () => {}) */',
        'app.get(API_PATH, () => {})',
      ].join('\n')

      const routes = parseRoutesFromText(text, { excludeComments: true })
      expect(routes).toHaveLength(1)
      expect(routes[0]?.path).toBe('/api')
    })
  })
})

