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

/**
 * Represents a parsed @example HTTP request from JSDoc comments.
 */
export type ParsedJSDocExample = {
  /** HTTP method (lowercase, e.g. "post") */
  method: string
  /** JSON body string extracted from @example */
  jsonBody: string
  /** Character index where the METHOD keyword starts in the source text */
  methodStartIndex: number
  /** Path from the associated route definition */
  routePath: string
  /** Method from the associated route definition */
  routeMethod: string
}

/**
 * Parses JSDoc @example blocks that contain HTTP request examples.
 *
 * Example pattern:
 * ```
 * /**
 *  * @example
 *  * POST { "name": "John" }
 *  *\/
 * app.post("/users", ...)
 * ```
 *
 * This function finds such patterns and associates them with the route definition
 * that immediately follows the JSDoc comment.
 */
export function parseJSDocExamplesFromText(text: string): ParsedJSDocExample[] {
  const results: ParsedJSDocExample[] = []

  // Find all JSDoc blocks: /** ... */
  const jsdocRe = /\/\*\*[\s\S]*?\*\//g
  let jsdocMatch: RegExpExecArray | null

  while ((jsdocMatch = jsdocRe.exec(text))) {
    const jsdocContent = jsdocMatch[0]
    const jsdocStartIndex = jsdocMatch.index
    const jsdocEndIndex = jsdocStartIndex + jsdocContent.length

    // Find @example sections within this JSDoc block
    const examples = parseExamplesFromJSDoc(jsdocContent, jsdocStartIndex)
    if (examples.length === 0) continue

    // Find the route definition that follows this JSDoc block
    const followingRoute = findFollowingRoute(text, jsdocEndIndex)
    if (!followingRoute) continue

    // Associate each @example with the route (if methods match)
    for (const example of examples) {
      if (example.method === followingRoute.method) {
        results.push({
          method: example.method,
          jsonBody: example.jsonBody,
          methodStartIndex: example.methodStartIndex,
          routePath: followingRoute.path,
          routeMethod: followingRoute.method,
        })
      }
    }
  }

  return results
}

type ParsedExampleInJSDoc = {
  method: string
  jsonBody: string
  methodStartIndex: number
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']

/**
 * Parses @example sections from a JSDoc comment block and extracts HTTP request examples.
 */
function parseExamplesFromJSDoc(
  jsdocContent: string,
  jsdocStartIndex: number
): ParsedExampleInJSDoc[] {
  const results: ParsedExampleInJSDoc[] = []

  // Split into lines for easier processing
  const lines = jsdocContent.split('\n')
  let currentLineOffset = 0
  let inExample = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const trimmedLine = stripJSDocLinePrefix(line)

    // Check if this line starts an @example section
    if (trimmedLine.startsWith('@example')) {
      inExample = true
      currentLineOffset += line.length + 1 // +1 for newline
      i++
      continue
    }

    // Check if this line starts a new @ tag (exits @example)
    if (trimmedLine.startsWith('@') && !trimmedLine.startsWith('@example')) {
      inExample = false
      currentLineOffset += line.length + 1
      i++
      continue
    }

    // If we're in an @example section, look for HTTP METHOD {json} pattern
    if (inExample) {
      const methodMatch = findHttpMethodInLine(trimmedLine)
      if (methodMatch) {
        // Find the position of METHOD in the original line
        const methodPosInLine = line.indexOf(methodMatch.method)
        const methodStartIndex = jsdocStartIndex + currentLineOffset + methodPosInLine

        // Extract JSON body (may span multiple lines)
        const jsonResult = extractJsonBody(lines, i, trimmedLine, methodMatch.jsonStartInTrimmed)
        if (jsonResult) {
          results.push({
            method: methodMatch.method.toLowerCase(),
            jsonBody: jsonResult.jsonBody,
            methodStartIndex,
          })
          // Skip the lines consumed by JSON extraction
          currentLineOffset += jsonResult.consumedChars
          i += jsonResult.consumedLines
          continue
        }
      }
    }

    currentLineOffset += line.length + 1 // +1 for newline
    i++
  }

  return results
}

/**
 * Strips the JSDoc line prefix (leading whitespace and asterisk).
 * e.g., " * POST {...}" -> "POST {...}"
 */
function stripJSDocLinePrefix(line: string): string {
  return line.replace(/^\s*\*?\s?/, '')
}

/**
 * Finds an HTTP method at the start of a line and returns info about it.
 */
function findHttpMethodInLine(
  trimmedLine: string
): { method: string; jsonStartInTrimmed: number } | null {
  for (const method of HTTP_METHODS) {
    if (trimmedLine.startsWith(method)) {
      const afterMethod = trimmedLine.slice(method.length)
      // Ensure there's whitespace or { after the method
      if (/^\s*\{/.test(afterMethod) || /^\s+/.test(afterMethod)) {
        const jsonStart = trimmedLine.indexOf('{')
        if (jsonStart !== -1) {
          return { method, jsonStartInTrimmed: jsonStart }
        }
      }
    }
  }
  return null
}

/**
 * Extracts a JSON body starting from a given position, handling multiline JSON.
 */
function extractJsonBody(
  lines: string[],
  startLineIndex: number,
  startTrimmedLine: string,
  jsonStartInTrimmed: number
): { jsonBody: string; consumedLines: number; consumedChars: number } | null {
  let jsonStr = ''
  let braceCount = 0
  let started = false
  let consumedLines = 0
  let consumedChars = 0

  // Start from the current line at the JSON start position
  let content = startTrimmedLine.slice(jsonStartInTrimmed)

  for (let lineIdx = startLineIndex; lineIdx < lines.length; lineIdx++) {
    if (lineIdx > startLineIndex) {
      content = stripJSDocLinePrefix(lines[lineIdx]!)
    }

    for (const ch of content) {
      if (ch === '{') {
        started = true
        braceCount++
        jsonStr += ch
      } else if (ch === '}') {
        braceCount--
        jsonStr += ch
        if (braceCount === 0 && started) {
          // Completed JSON extraction
          consumedLines = lineIdx - startLineIndex + 1
          for (let j = startLineIndex; j <= lineIdx; j++) {
            consumedChars += lines[j]!.length + 1
          }
          return { jsonBody: jsonStr.trim(), consumedLines, consumedChars }
        }
      } else if (started) {
        jsonStr += ch
      }
    }

    // Add newline between lines if continuing
    if (started && braceCount > 0) {
      jsonStr += '\n'
    }

    // Check if we've hit a new @ tag or end of JSDoc
    if (lineIdx > startLineIndex) {
      const trimmed = stripJSDocLinePrefix(lines[lineIdx]!)
      if (trimmed.startsWith('@') || trimmed === '*/') {
        break
      }
    }
  }

  return null
}

/**
 * Finds the first route definition after the given index in the text.
 */
function findFollowingRoute(
  text: string,
  startIndex: number
): { method: string; path: string } | null {
  const searchText = text.slice(startIndex)
  ROUTE_CALL_RE.lastIndex = 0

  const match = ROUTE_CALL_RE.exec(searchText)
  if (!match) return null

  const method = match[3]?.toLowerCase()
  const path = match[5]
  if (!method || !path) return null

  return { method, path }
}
