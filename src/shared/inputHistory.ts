import * as vscode from 'vscode'

export class InputHistory {
  constructor(private readonly memento: vscode.Memento) {}

  get(key: string): string | undefined {
    const v = this.memento.get<string>(key)
    return typeof v === 'string' ? v : undefined
  }

  async set(key: string, value: string): Promise<void> {
    await this.memento.update(key, value)
  }
}

export function workspaceKeyForUri(uriString: string): string {
  try {
    const uri = vscode.Uri.parse(uriString)
    const folder =
      vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0]
    return folder?.uri.fsPath ?? 'global'
  } catch {
    return 'global'
  }
}

export function historyKey(prefix: string, workspaceKey: string, name: string): string {
  return `hono.history.${prefix}.${workspaceKey}.${name}`
}
