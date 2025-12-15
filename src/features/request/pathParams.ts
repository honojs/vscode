const PATH_PARAM_RE = /:([A-Za-z_]\w*)/g

export function extractPathParamNames(routePath: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const m of routePath.matchAll(PATH_PARAM_RE)) {
    const name = m[1]
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export function applyPathParams(routePath: string, values: Record<string, string>): string {
  let resolved = routePath
  for (const name of extractPathParamNames(routePath)) {
    const v = values[name] ?? ''
    resolved = resolved.replace(new RegExp(`:${escapeRegex(name)}`, 'g'), encodeURIComponent(v))
  }
  return resolved
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
