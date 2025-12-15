import * as vscode from 'vscode'

export type EnableCodeLensMode = 'auto' | 'always' | 'disabled'

export type RequestConfig = {
  enableCodeLens: EnableCodeLensMode
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
    enableCodeLens: cfg.get<EnableCodeLensMode>('enableCodeLens', 'auto'),
    nodePath: (cfg.get<string>('nodePath', 'node') || 'node').trim(),
    extraArgs: cfg.get<string[]>('extraArgs', []),
  }
}
