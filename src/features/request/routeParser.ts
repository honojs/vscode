export type ParsedRoute = {
  method: string
  path: string
  callStartIndex: number
}

type Range = {
  start: number
  end: number
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

export function parseRoutesFromText(
  text: string,
  opts?: { excludeComments?: boolean }
): ParsedRoute[] {
  const routes: ParsedRoute[] = []
  ROUTE_CALL_RE.lastIndex = 0

  const commentRanges = opts?.excludeComments === false ? [] : findCommentRanges(text)

  let match: RegExpExecArray | null
  while ((match = ROUTE_CALL_RE.exec(text))) {
    const prefix = match[1] ?? ''
    const method = match[3]?.toLowerCase()
    const routePath = match[5]
    if (!method || !routePath) continue

    const callStartIndex = match.index + prefix.length
    if (commentRanges.length > 0 && isInRanges(callStartIndex, commentRanges)) continue

    routes.push({
      method,
      path: routePath,
      callStartIndex,
    })
  }

  return routes
}

function isInRanges(pos: number, ranges: Range[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true
  }
  return false
}

function findCommentRanges(text: string): Range[] {
  // English comment: lightweight lexer to detect // and /* */ while respecting strings.
  const ranges: Range[] = []
  let i = 0

  let inLine = false
  let inBlock = false
  let inString: "'" | '"' | '`' | null = null
  let escape = false
  let start = 0

  while (i < text.length) {
    const ch = text[i]!
    const next = i + 1 < text.length ? text[i + 1]! : ''

    if (inString) {
      if (escape) {
        escape = false
        i++
        continue
      }
      if (ch === '\\') {
        escape = true
        i++
        continue
      }
      if (ch === inString) {
        inString = null
      }
      i++
      continue
    }

    if (inLine) {
      if (ch === '\n') {
        ranges.push({ start, end: i })
        inLine = false
      }
      i++
      continue
    }

    if (inBlock) {
      if (ch === '*' && next === '/') {
        ranges.push({ start, end: i + 2 })
        inBlock = false
        i += 2
        continue
      }
      i++
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      inLine = true
      start = i
      i += 2
      continue
    }

    if (ch === '/' && next === '*') {
      inBlock = true
      start = i
      i += 2
      continue
    }

    i++
  }

  if (inLine) ranges.push({ start, end: text.length })
  if (inBlock) ranges.push({ start, end: text.length })

  return ranges
}
