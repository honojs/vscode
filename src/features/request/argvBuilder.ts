export type RequestInvocationInput = {
  method: string
  path: string
  data?: string
  headers?: string[]
  appEntryFile?: string
}

export function buildBundledHonoRequestArgv(params: {
  entry: string
  watch: boolean
  input: RequestInvocationInput
  extraArgs: string[]
}): string[] {
  const { entry, watch, input, extraArgs } = params
  return [
    entry,
    'request',
    ...(input.appEntryFile ? [input.appEntryFile] : []),
    '-P',
    input.path,
    '-X',
    input.method.toUpperCase(),
    ...(input.data ? ['-d', input.data] : []),
    ...(input.headers ?? []).flatMap((h) => ['-H', h]),
    ...(watch ? ['--watch'] : []),
    ...extraArgs,
  ]
}
