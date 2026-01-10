import * as vscode from 'vscode'
import { registerRequestFeature } from './features/request'
import { runHonoDebugServe } from './features/serve/debugCommand'

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Hono')

  const selector: vscode.DocumentSelector = [
    { language: 'typescript', scheme: 'file' },
    { language: 'javascript', scheme: 'file' },
    { language: 'typescriptreact', scheme: 'file' },
    { language: 'javascriptreact', scheme: 'file' },
  ]

  registerRequestFeature({ context, output, selector })

  context.subscriptions.push(
    vscode.commands.registerCommand('hono.debug', async () => {
      await runHonoDebugServe({ context, output })
    }),
    output
  )
}
