export type ParsedRoute = {
  method: string
  path: string
  callStartIndex: number
}

// Supports patterns like:
//   app.get("/path", ...)
//   router.post('/path', ...)
// Note: Only string literals are supported (', ", `).
//
// Important: We intentionally capture the "prefix" char (or start-of-line) so we can compute the
// actual start index of the route call. Without this, match.index can point at a newline at the
// end of the previous line, causing CodeLens to appear one line above.
const ROUTE_CALL_RE =
  /(^|[^\w$])([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*(['"`])([^'"`]+)\4/gm

export function parseRoutesFromText(text: string): ParsedRoute[] {
  const routes: ParsedRoute[] = []
  ROUTE_CALL_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = ROUTE_CALL_RE.exec(text))) {
    const prefix = match[1] ?? ''
    const method = match[3]?.toLowerCase()
    const routePath = match[5]
    if (!method || !routePath) continue

    routes.push({
      method,
      path: routePath,
      callStartIndex: match.index + prefix.length,
    })
  }

  return routes
}
