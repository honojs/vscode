import * as vscode from 'vscode'
import * as path from 'node:path'
import { getRequestConfig } from '../../shared/config'
import { resolveBundledHonoCliEntry } from '../../shared/honoCli'

export async function runHonoDebugServe(params: {
  context: vscode.ExtensionContext
  output: vscode.OutputChannel
}): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showErrorMessage('No active editor.')
    return
  }

  const doc = editor.document
  const uri = doc.uri

  if (uri.scheme !== 'file') {
    void vscode.window.showErrorMessage('Active document is not a file.')
    return
  }

  const folder = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0]
  const cwd = folder?.uri.fsPath
  if (!cwd) {
    void vscode.window.showErrorMessage('Workspace folder not found.')
    return
  }

  const cfg = getRequestConfig()

  let honoCliEntry: string
  try {
    honoCliEntry = resolveBundledHonoCliEntry(params.context.extensionPath)
  } catch (e) {
    params.output.appendLine(`[error] ${String(e)}`)
    params.output.show(true)
    void vscode.window.showErrorMessage('Failed to resolve bundled Hono CLI. See Output: Hono')
    return
  }

  const filePath = uri.fsPath
  const debugName = `Hono Debug: ${path.basename(filePath)}`

  params.output.appendLine('')
  params.output.appendLine(`[debug] ${cfg.nodePath} --inspect-brk=0 ${honoCliEntry} serve ${filePath}`)
  params.output.show(true)

  const launchConfig: vscode.DebugConfiguration = {
    type: 'node',
    request: 'launch',
    name: debugName,
    cwd,
    runtimeExecutable: cfg.nodePath || 'node',
    runtimeArgs: ['--inspect-brk=0'],
    program: honoCliEntry,
    args: ['serve', filePath, ...cfg.extraArgs],
    console: 'integratedTerminal',
    internalConsoleOptions: 'neverOpen',
    sourceMaps: true,
    autoAttachChildProcesses: true,
    skipFiles: ['<node_internals>/**'],
  }

  const ok = await vscode.debug.startDebugging(undefined, launchConfig)
  if (!ok) {
    void vscode.window.showErrorMessage('Failed to start debug session.')
  }
}

