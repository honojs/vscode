import ts from 'typescript'
import * as vscode from 'vscode'
import * as path from 'node:path'

export type FormFieldSpec = {
  name: string
  type: string
  isArrayLike: boolean
}

export async function inferFormFieldsFromHonoSchema(params: {
  uri: string
  line?: number
  method: string // lower-case
  routePathLiteral: string // e.g. "/posts/page/:page"
}): Promise<FormFieldSpec[] | undefined> {
  const fileUri = vscode.Uri.parse(params.uri)
  const filePath = fileUri.fsPath

  const folder =
    vscode.workspace.getWorkspaceFolder(fileUri) ?? vscode.workspace.workspaceFolders?.[0]
  const cwd = folder?.uri.fsPath
  if (!cwd) return undefined

  const program = createProgramForWorkspace(cwd, filePath)
  const sourceFile = program.getSourceFile(filePath)
  if (!sourceFile) return undefined

  const checker = program.getTypeChecker()

  const call = findRouteCallExpression(sourceFile, {
    method: params.method,
    routePathLiteral: params.routePathLiteral,
    line: params.line,
  })
  if (!call) return undefined

  if (!ts.isPropertyAccessExpression(call.expression)) return undefined
  const appExpr = call.expression.expression
  const appType = checker.getTypeAtLocation(appExpr)
  // In many Hono typings, the route schema is reflected on the *return type* of `app.post(...)`,
  // not on the base `app` variable type. Prefer the call expression type when available.
  const callType = checker.getTypeAtLocation(call)

  const schemaType = findHonoSchemaType(callType, checker) ?? findHonoSchemaType(appType, checker)
  if (!schemaType) return undefined

  const pathEntryTypes = getPropTypes(schemaType, params.routePathLiteral, checker, call)
  if (pathEntryTypes.length === 0) return undefined

  const methodKey = `$${params.method}`
  const formTypes: ts.Type[] = []

  for (const pathEntryType of pathEntryTypes) {
    const methodTypes = getPropTypes(pathEntryType, methodKey, checker, call)
    for (const methodType of methodTypes) {
      const inputTypes = getPropTypes(methodType, 'input', checker, call)
      for (const inputType of inputTypes) {
        const ft = getPropTypes(inputType, 'form', checker, call)
        formTypes.push(...ft)
      }
    }
  }

  if (formTypes.length === 0) return undefined

  const fields = new Map<string, FormFieldSpec>()
  for (const formType of formTypes) {
    for (const sym of checker.getPropertiesOfType(formType)) {
      const name = sym.getName()
      const t = checker.getTypeOfSymbolAtLocation(sym, call)
      const typeStr = checker.typeToString(t, call, ts.TypeFormatFlags.NoTruncation)
      fields.set(name, {
        name,
        type: typeStr,
        isArrayLike: /\[\]|\bArray\s*<|\bReadonlyArray\s*</.test(typeStr),
      })
    }
  }

  return [...fields.values()]
}

function createProgramForWorkspace(workspaceCwd: string, preferredFile: string): ts.Program {
  const configPath = ts.findConfigFile(workspaceCwd, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) {
    return ts.createProgram([preferredFile], {
      allowJs: true,
      checkJs: false,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    })
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))

  // If the current file is not included (e.g. excluded by glob), force-include it.
  const rootNames = parsed.fileNames.includes(preferredFile)
    ? parsed.fileNames
    : [...parsed.fileNames, preferredFile]

  return ts.createProgram({
    rootNames,
    options: parsed.options,
  })
}

function findRouteCallExpression(
  sf: ts.SourceFile,
  params: { method: string; routePathLiteral: string; line?: number }
): ts.CallExpression | undefined {
  const matches: Array<{ call: ts.CallExpression; line: number }> = []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const prop = node.expression.name.text
      if (prop === params.method) {
        const firstArg = node.arguments[0]
        if (firstArg) {
          // Resolve the route path (supports literals, constants, concatenation, templates)
          const resolvedPath = resolveRoutePathExpression(firstArg, sf)
          if (resolvedPath === params.routePathLiteral) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf, false))
            matches.push({ call: node, line })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)

  if (matches.length === 0) return undefined
  if (params.line === undefined) return matches[0]?.call

  matches.sort((a, b) => Math.abs(a.line - params.line!) - Math.abs(b.line - params.line!))
  return matches[0]?.call
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

function findHonoSchemaType(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  const seen = new Set<ts.Type>()

  const walk = (t: ts.Type): ts.Type | undefined => {
    if (seen.has(t)) return undefined
    seen.add(t)

    const asRef = t as ts.TypeReference
    const typeArgs = tryGetTypeArgs(asRef, checker)
    if (typeArgs && typeArgs.length >= 2) {
      // Hono<Env, Schema, ...> (we only care about Schema at index 1)
      const symName = t.symbol?.getName() ?? t.aliasSymbol?.getName()
      if (symName === 'Hono') return typeArgs[1]
    }

    if ((t.flags & ts.TypeFlags.Intersection) !== 0 || (t.flags & ts.TypeFlags.Union) !== 0) {
      const ut = t as ts.UnionOrIntersectionType
      for (const ct of ut.types) {
        const found = walk(ct)
        if (found) return found
      }
    }

    return undefined
  }

  return walk(type)
}

function tryGetTypeArgs(typeRef: ts.TypeReference, checker: ts.TypeChecker): ts.Type[] | undefined {
  try {
    // Public in recent TS, but keep compatibility.
    const anyChecker = checker as unknown as {
      getTypeArguments?: (t: ts.TypeReference) => ts.Type[]
    }
    if (anyChecker.getTypeArguments) return anyChecker.getTypeArguments(typeRef)
  } catch {
    // ignore
  }
  return typeRef.typeArguments ? [...typeRef.typeArguments] : undefined
}

function getPropTypes(
  type: ts.Type,
  propName: string,
  checker: ts.TypeChecker,
  location: ts.Node
): ts.Type[] {
  const out: ts.Type[] = []

  const visit = (t: ts.Type) => {
    if ((t.flags & ts.TypeFlags.Union) !== 0 || (t.flags & ts.TypeFlags.Intersection) !== 0) {
      for (const ct of (t as ts.UnionOrIntersectionType).types) visit(ct)
      return
    }

    const sym = checker.getPropertyOfType(t, propName)
    if (!sym) return
    out.push(checker.getTypeOfSymbolAtLocation(sym, location))
  }

  visit(type)
  return out
}
