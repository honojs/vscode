import * as vscode from 'vscode'

export type RequestConfig = {
  enableCodeLens: boolean
  nodePath: string
  extraArgs: string[]
}

function getRequestSection() {
  // Settings keys are under `hono.request.*`
  return vscode.workspace.getConfiguration('hono.request')
}

export function getRequestConfig(): RequestConfig {
  const cfg = getRequestSection()

  return {
    enableCodeLens: cfg.get<boolean>('enableCodeLens', true),
    nodePath: (cfg.get<string>('nodePath', 'node') || 'node').trim(),
    extraArgs: cfg.get<string[]>('extraArgs', []),
  }
}
