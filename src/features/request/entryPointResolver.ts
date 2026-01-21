import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { InputHistory } from '../../shared/inputHistory'
import { historyKey, workspaceKeyForUri } from '../../shared/inputHistory'

const ENTRY_CANDIDATES = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx'] as const

/**
 * Find entry point candidates in the workspace.
 * Checks for standard entry files and includes the currently editing file.
 */
export function findEntryPointCandidates(workspaceRoot: string, currentFileUri: string): string[] {
  const candidates: string[] = []

  // Check standard entry candidates
  for (const candidate of ENTRY_CANDIDATES) {
    const fullPath = path.join(workspaceRoot, candidate)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8')
      if (content.includes('new Hono') && content.includes('.route')) {
        candidates.push(candidate)
      }
    }
  }

  // Add the currently editing file (if not already included)
  const currentFilePath = vscode.Uri.parse(currentFileUri).fsPath
  const relativeCurrent = path.relative(workspaceRoot, currentFilePath)

  if (!candidates.includes(relativeCurrent)) {
    candidates.unshift(relativeCurrent)
  }

  return candidates
}

/**
 * Resolve the entry point for hono request.
 * If only one candidate exists, use it automatically.
 * If multiple candidates exist, show QuickPick and remember the selection.
 */
export async function resolveEntryPoint(
  workspaceRoot: string,
  currentFileUri: string,
  history: InputHistory
): Promise<string | undefined> {
  const candidates = findEntryPointCandidates(workspaceRoot, currentFileUri)

  if (candidates.length === 0) {
    void vscode.window.showErrorMessage(
      'No entry point found. Expected src/index.ts, src/index.tsx, src/index.js, or src/index.jsx'
    )
    return undefined
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  // Multiple candidates: show QuickPick
  const wsKey = workspaceKeyForUri(currentFileUri)
  const currentFilePath = vscode.Uri.parse(currentFileUri).fsPath
  const currentFileRelative = path.relative(workspaceRoot, currentFilePath)
  const histKey = historyKey('entryPoint', wsKey, currentFileRelative)
  const previousSelection = history.get(histKey)

  // Sort candidates: previous selection first, then standard candidates, then current file
  const sortedCandidates = [...candidates]
  if (previousSelection && sortedCandidates.includes(previousSelection)) {
    sortedCandidates.splice(sortedCandidates.indexOf(previousSelection), 1)
    sortedCandidates.unshift(previousSelection)
  }

  const items: vscode.QuickPickItem[] = sortedCandidates.map((c, i) => ({
    label: c,
    description: i === 0 && c === previousSelection ? '(last used)' : undefined,
  }))

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select entry point for hono request',
    ignoreFocusOut: true,
  })

  if (!selected) return undefined // canceled

  // Save selection
  await history.set(histKey, selected.label)

  return selected.label
}
