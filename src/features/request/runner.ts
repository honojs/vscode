import * as vscode from 'vscode'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getRequestConfig } from '../../shared/config'
import { buildBundledHonoRequestArgv } from './argvBuilder'
import type { RequestInvocationInput } from './argvBuilder'
import { applyPathParams, extractPathParamNames } from './pathParams'
import type { RequestLensCommandArgs } from './types'
import { InputHistory, historyKey, workspaceKeyForUri } from '../../shared/inputHistory'

type FormFieldSpec = {
  name: string
  type: string
  isArrayLike: boolean
}

type RunnerDeps = {
  args: RequestLensCommandArgs
  output: vscode.OutputChannel
  extensionPath: string
  context: vscode.ExtensionContext
}

function getWorkspaceCwdForUri(uriString: string): string | undefined {
  const uri = vscode.Uri.parse(uriString)
  const folder = vscode.workspace.getWorkspaceFolder(uri)
  if (folder) return folder.uri.fsPath
  const folders = vscode.workspace.workspaceFolders
  return folders?.[0]?.uri.fsPath
}

function resolveBundledHonoCliEntry(extensionPath: string): string {
  // Try Node resolution first (works in extension host when dependencies are installed).
  try {
    const pkgJsonPath = require.resolve('@hono/cli/package.json', { paths: [extensionPath] })
    const pkgDir = path.dirname(pkgJsonPath)
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
      bin?: string | Record<string, string>
    }

    let relBin: string | undefined
    if (typeof pkg.bin === 'string') {
      relBin = pkg.bin
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      relBin = pkg.bin['hono'] ?? Object.values(pkg.bin)[0]
    }

    if (!relBin) {
      throw new Error('bin field not found in @hono/cli package.json')
    }

    return path.resolve(pkgDir, relBin)
  } catch (e) {
    // Fallback to node_modules location within the extension.
    const fallback = path.join(extensionPath, 'node_modules', '@hono', 'cli', 'dist', 'cli.js')
    if (fs.existsSync(fallback)) return fallback
    throw e
  }
}

function buildInvocation(
  extensionPath: string,
  watch: boolean,
  input: RequestInvocationInput
): { cmd: string; argv: string[] } {
  const cfg = getRequestConfig()

  // bundled: run "node <@hono/cli bin> request -P <path> ..."
  const entry = resolveBundledHonoCliEntry(extensionPath)
  const argv = buildBundledHonoRequestArgv({ entry, watch, input, extraArgs: cfg.extraArgs })
  return { cmd: cfg.nodePath || 'node', argv }
}

export async function runRequestOnce({ args, output, extensionPath, context }: RunnerDeps): Promise<void> {
  const cwd = getWorkspaceCwdForUri(args.uri)
  if (!cwd) {
    void vscode.window.showErrorMessage('Workspace folder not found.')
    return
  }

  const resolved = await resolveInvocationInput(args, new InputHistory(context.globalState))
  if (!resolved) return

  let cmd: string
  let fullArgs: string[]
  try {
    const inv = buildInvocation(extensionPath, false, resolved)
    cmd = inv.cmd
    fullArgs = inv.argv
  } catch (e) {
    output.appendLine(`[error] ${String(e)}`)
    output.show(true)
    void vscode.window.showErrorMessage('Failed to resolve Hono CLI. See Output: Hono')
    return
  }

  output.clear()
  output.appendLine(`[cmd] ${cmd} ${fullArgs.join(' ')}`)
  output.appendLine(`[cwd] ${cwd}`)
  output.appendLine('')

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Hono request: ${args.path}`,
      cancellable: false,
    },
    async () =>
      new Promise<void>((resolve) => {
        const child = spawn(cmd, fullArgs, { cwd, shell: false, env: process.env })

        child.stdout.on('data', (d) => output.append(d.toString()))
        child.stderr.on('data', (d) => output.append(d.toString()))

        child.on('error', (err) => {
          output.appendLine('')
          output.appendLine(`[error] ${String(err)}`)
          void vscode.window.showErrorMessage('Failed to run Hono CLI (see Output: Hono)')
          output.show(true)
          resolve()
        })

        child.on('close', (code, signal) => {
          output.appendLine('')
          output.appendLine(`[exit] code=${code ?? 'null'} signal=${signal ?? 'null'}`)

          if (code === 0) {
            output.show(true)
          } else {
            output.show(true)
            void vscode.window.showErrorMessage(
              `Hono request failed (exit ${code ?? 'null'}). See Output: Hono`
            )
          }
          resolve()
        })
      })
  )
}

export async function runRequestWatchInTerminal({
  args,
  output,
  extensionPath,
  context,
}: RunnerDeps): Promise<void> {
  const cwd = getWorkspaceCwdForUri(args.uri)
  if (!cwd) {
    void vscode.window.showErrorMessage('Workspace folder not found.')
    return
  }

  const resolved = await resolveInvocationInput(args, new InputHistory(context.globalState))
  if (!resolved) return

  let cmd: string
  let fullArgs: string[]
  try {
    const inv = buildInvocation(extensionPath, true, resolved)
    cmd = inv.cmd
    fullArgs = inv.argv
  } catch (e) {
    output.appendLine(`[error] ${String(e)}`)
    output.show(true)
    void vscode.window.showErrorMessage('Failed to resolve Hono CLI. See Output: Hono')
    return
  }

  output.appendLine('')
  output.appendLine(`[watch] ${cmd} ${fullArgs.join(' ')}`)
  output.appendLine(`[cwd] ${cwd}`)

  const termName = `Hono Watch: ${args.path}`
  // Restart behavior: stop any existing watch terminal first, then create a fresh one.
  // English comment: This avoids stale processes/session state and is more reliable than reusing a running terminal.
  const existing = vscode.window.terminals.find((t) => t.name.startsWith('Hono Watch: '))
  if (existing) {
    try {
      // Try to stop the running process (Ctrl+C), then close the terminal.
      existing.sendText('\u0003', false)
    } catch {
      // ignore
    }
    // Closing the terminal is often more reliable than attempting to reuse it.
    existing.dispose()
  }

  const terminal = vscode.window.createTerminal({
    name: termName,
    cwd,
  })

  const commandLine = [cmd, ...fullArgs].map(quoteForShell).join(' ')
  terminal.show(true)
  terminal.sendText(commandLine, true)
}

export async function runRequestDebug({ args, output, extensionPath, context }: RunnerDeps): Promise<void> {
  const cwd = getWorkspaceCwdForUri(args.uri)
  if (!cwd) {
    void vscode.window.showErrorMessage('Workspace folder not found.')
    return
  }

  const cfg = getRequestConfig()

  const resolved = await resolveInvocationInput(args, new InputHistory(context.globalState))
  if (!resolved) return

  let entry: string
  try {
    entry = resolveBundledHonoCliEntry(extensionPath)
  } catch (e) {
    output.appendLine(`[error] ${String(e)}`)
    output.show(true)
    void vscode.window.showErrorMessage('Failed to resolve bundled Hono CLI. See Output: Hono')
    return
  }

  const debugName = `Hono Request Debug: ${resolved.method.toUpperCase()} ${resolved.path}`

  output.appendLine('')
  output.appendLine(
    `[debug] launching with inspector: ${cfg.nodePath} --inspect=0 ${entry} request -P ${resolved.path}`
  )
  output.show(true)

  const launchConfig: vscode.DebugConfiguration = {
    // Use the modern Node debugger for better sourcemap support.
    type: 'node',
    request: 'launch',
    name: debugName,
    cwd,
    runtimeExecutable: cfg.nodePath || 'node',
    runtimeArgs: ['--inspect=0'],
    program: entry,
    args: [
      'request',
      '-P',
      resolved.path,
      '-X',
      resolved.method.toUpperCase(),
      ...(resolved.data ? ['-d', resolved.data] : []),
      ...(resolved.headers ?? []).flatMap((h) => ['-H', h]),
      ...cfg.extraArgs,
    ],
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

function quoteForShell(s: string): string {
  // Simple cross-shell quoting for typical args/paths.
  if (/^[A-Za-z0-9_\-./:@]+$/.test(s)) return s
  return `"${s.replace(/"/g, '\\"')}"`
}

async function resolveInvocationInput(
  args: RequestLensCommandArgs,
  history: InputHistory
): Promise<RequestInvocationInput | undefined> {
  const wsKey = workspaceKeyForUri(args.uri)
  const resolvedPath = await promptPathParams(args.path, wsKey, history)
  if (!resolvedPath) return

  const method = args.method.toLowerCase()

  // For non-body methods, we just run.
  if (!['post', 'put', 'patch', 'delete'].includes(method)) {
    return { method, path: resolvedPath }
  }

  const inferred = await inferFormFieldsFromHonoSchema({
    uri: args.uri,
    line: args.line,
    method,
    routePathLiteral: args.path,
  })

  if (!inferred || inferred.length === 0) {
    const raw = await promptRawBody(wsKey, history)
    return raw === undefined ? undefined : { method, path: resolvedPath, ...raw }
  }

  const prompted = await promptFormBodyFromTypes(inferred, wsKey, history)
  if (!prompted) return // canceled
  return { method, path: resolvedPath, ...prompted }
}

async function promptPathParams(
  routePath: string,
  wsKey: string,
  history: InputHistory
): Promise<string | undefined> {
  const names = extractPathParamNames(routePath)
  if (names.length === 0) return routePath

  const values: Record<string, string> = {}
  for (const name of names) {
    const key = historyKey('pathParam', wsKey, name)
    const prev = history.get(key)
    const v = await vscode.window.showInputBox({
      prompt: `Enter value for :${name}`,
      placeHolder: name,
      ignoreFocusOut: true,
      value: prev,
    })
    if (v === undefined) return // canceled
    values[name] = v
    await history.set(key, v)
  }

  return applyPathParams(routePath, values)
}

async function promptFormBodyFromTypes(
  fields: FormFieldSpec[],
  wsKey: string,
  history: InputHistory
): Promise<{ data?: string; headers?: string[] } | undefined> {
  const params = new URLSearchParams()

  for (const f of fields) {
    const key = historyKey('formField', wsKey, f.name)
    const prev = history.get(key)
    const v = await vscode.window.showInputBox({
      prompt: `form.${f.name}`,
      placeHolder: f.name,
      ignoreFocusOut: true,
      value: prev,
    })
    if (v === undefined) return // canceled

    if (f.isArrayLike && v.includes(',')) {
      for (const item of v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)) {
        params.append(f.name, item)
      }
      await history.set(key, v)
      continue
    }
    params.append(f.name, v)
    await history.set(key, v)
  }

  return { data: params.toString(), headers: ['Content-Type: application/x-www-form-urlencoded'] }
}

async function promptRawBody(
  wsKey: string,
  history: InputHistory
): Promise<{ data?: string; headers?: string[] } | undefined> {
  const key = historyKey('rawBody', wsKey, 'last')
  const prev = history.get(key)
  const raw = await vscode.window.showInputBox({
    prompt: 'Request body (raw)',
    placeHolder: 'e.g. {"body":"foo"}  or  body=foo',
    ignoreFocusOut: true,
    value: prev,
  })
  if (raw === undefined) return undefined // canceled
  if (raw.trim() === '') return {}
  await history.set(key, raw)
  return { data: raw }
}

async function inferFormFieldsFromHonoSchema(params: {
  uri: string
  line?: number
  method: string
  routePathLiteral: string
}): Promise<FormFieldSpec[] | undefined> {
  try {
    // Lazy-load to avoid breaking extension activation if `typescript` is not available in the installed package.
    const mod = await import('./typeInference')
    return (await mod.inferFormFieldsFromHonoSchema(params)) as FormFieldSpec[] | undefined
  } catch {
    return undefined
  }
}
