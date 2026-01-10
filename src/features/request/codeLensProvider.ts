import * as vscode from 'vscode'
import { getRequestConfig } from '../../shared/config'
import { parseRoutesFromText } from './routeParser'
import type { RequestLensCommandArgs } from './types'

type ParsedRoute = {
  path: string
  method: string
  range: vscode.Range
}

export class RequestCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event
  private _disposables: vscode.Disposable[] = []

  constructor() {
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('hono.request.enableCodeLens')) {
          this._onDidChangeCodeLenses.fire()
        }
      })
    )
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const cfg = getRequestConfig()
    if (cfg.enableCodeLens === 'disabled') return []

    // Do not show CodeLens in test files.
    if (isTestFile(document.uri.fsPath)) return []

    const text = document.getText()
    // Only enable this feature for files that appear to define a Hono app.
    if (cfg.enableCodeLens === 'auto' && !/\bnew\s+Hono\b/.test(text)) return []

    const routes = parseRoutes(text, document)
    if (routes.length === 0) return []

    const lenses: vscode.CodeLens[] = []
    for (const r of routes) {
      const args: RequestLensCommandArgs = {
        path: r.path,
        method: r.method,
        uri: document.uri.toString(),
        line: r.range.start.line,
      }

      lenses.push(
        new vscode.CodeLens(r.range, {
          title: `$(play)  ${r.method.toUpperCase()} ${r.path}`,
          command: 'hono.request.run',
          arguments: [args],
        })
      )

      lenses.push(
        new vscode.CodeLens(r.range, {
          title: `$(sync) Watch`,
          command: 'hono.request.watch',
          arguments: [args],
        })
      )

      lenses.push(
        new vscode.CodeLens(r.range, {
          title: `$(bug) Debug`,
          command: 'hono.request.debug',
          arguments: [args],
        })
      )
    }

    return lenses
  }

  dispose() {
    for (const d of this._disposables) d.dispose()
    this._disposables = []
    this._onDidChangeCodeLenses.dispose()
  }
}

function parseRoutes(text: string, document: vscode.TextDocument): ParsedRoute[] {
  return parseRoutesFromText(text, { excludeComments: true }).map((r) => {
    const pos = document.positionAt(r.callStartIndex)
    return { method: r.method, path: r.path, range: new vscode.Range(pos, pos) }
  })
}

function isTestFile(fsPath: string): boolean {
  return (
    fsPath.endsWith('.test.ts') ||
    fsPath.endsWith('.test.tsx') ||
    fsPath.endsWith('.test.js') ||
    fsPath.endsWith('.test.jsx') ||
    fsPath.endsWith('.spec.ts') ||
    fsPath.endsWith('.spec.tsx') ||
    fsPath.endsWith('.spec.js') ||
    fsPath.endsWith('.spec.jsx')
  )
}
