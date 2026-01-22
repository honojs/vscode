import ts from 'typescript'

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
  /(^|[^\w$])([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(/gm

export function parseRoutesFromText(
  text: string,
  opts?: { excludeComments?: boolean }
): ParsedRoute[] {
  // Try AST-based parsing first for better dynamic route support
  try {
    const astRoutes = parseRoutesWithAST(text, opts)
    if (astRoutes.length > 0) return astRoutes
  } catch {
    // Fall back to regex if AST parsing fails
  }

  // Fallback: regex-based parsing (original implementation)
  return parseRoutesWithRegex(text, opts)
}

function parseRoutesWithRegex(
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
    if (!method) continue

    const callStartIndex = match.index + prefix.length

    // Try to extract path from simple string literal after opening paren
    const afterParen = text.slice(match.index + match[0].length)
    const pathMatch = afterParen.match(/^\s*(['"`])([^'"`]+)\1/)
    if (!pathMatch) continue

    const routePath = pathMatch[2]
    if (!routePath) continue

    if (commentRanges.length > 0 && isInRanges(callStartIndex, commentRanges)) continue

    routes.push({
      method,
      path: routePath,
      callStartIndex,
    })
  }

  return routes
}

function parseRoutesWithAST(
  text: string,
  opts?: { excludeComments?: boolean }
): ParsedRoute[] {
  const sourceFile = ts.createSourceFile('temp.ts', text, ts.ScriptTarget.Latest, true)
  const routes: ParsedRoute[] = []
  const commentRanges = opts?.excludeComments === false ? [] : findCommentRanges(text)

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text
      const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']

      if (validMethods.includes(methodName)) {
        const firstArg = node.arguments[0]
        if (firstArg) {
          const resolvedPath = resolveRoutePathExpression(firstArg, sourceFile)
          if (resolvedPath) {
            const callStartIndex = node.expression.expression.getStart(sourceFile, false)

            if (commentRanges.length > 0 && isInRanges(callStartIndex, commentRanges)) {
              ts.forEachChild(node, visit)
              return
            }

            routes.push({
              method: methodName.toLowerCase(),
              path: resolvedPath,
              callStartIndex,
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routes
}

function resolveRoutePathExpression(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  // Direct string literal
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  // Template literal with substitutions: convert to pattern
  if (ts.isTemplateExpression(node)) {
    return stringifyTemplateExpression(node)
  }

  // Identifier: resolve to constant
  if (ts.isIdentifier(node)) {
    return evaluateConstantString(node, sourceFile)
  }

  // Binary expression: evaluate string concatenation
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveRoutePathExpression(node.left, sourceFile)
    const right = resolveRoutePathExpression(node.right, sourceFile)
    if (left !== null && right !== null) {
      return left + right
    }
  }

  return null
}

function evaluateConstantString(identifier: ts.Identifier, sourceFile: ts.SourceFile): string | null {
  const varName = identifier.text
  let result: string | null = null

  const visit = (node: ts.Node) => {
    if (result !== null) return // Already found

    // Variable declaration: const API_PATH = '/api'
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.name.text === varName && node.initializer) {
        const resolved = resolveRoutePathExpression(node.initializer, sourceFile)
        if (resolved !== null) {
          result = resolved
          return
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return result
}

function stringifyTemplateExpression(template: ts.TemplateExpression): string {
  let result = template.head.text

  for (const span of template.templateSpans) {
    // Add placeholder for the expression
    if (ts.isIdentifier(span.expression)) {
      result += `\${${span.expression.text}}`
    } else {
      result += '${...}'
    }
    result += span.literal.text
  }

  return result
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
