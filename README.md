# Hono

Run Hono CLI requests directly from your route definitions via CodeLens.

This extension ships with **bundled `@hono/cli`** and runs `hono request` for you.

## Features

- **CodeLens on routes**
  - Detects route definitions such as `app.get('/path', ...)` and `router.post("/path", ...)`
  - Shows CodeLens actions right above the route
- **Run requests**
  - Executes `hono request` for the selected route
  - Shows results in **Output** (`Hono`)
- **Watch mode**
  - Executes `hono request --watch` in an **integrated terminal**
- **Debug mode**
  - Launches `hono request` with Node inspector (`--inspect-brk`)
  - Lets you hit breakpoints in your Hono app code while running a request

## Usage

1. Open a Hono app file (TypeScript/JavaScript) that contains `new Hono`.
2. Hover around a route definition such as `app.get("/hello", ...)`.
3. Click a CodeLens action:
   - **Run**: runs a single request and prints output to the Output panel
   - **Watch**: runs in an integrated terminal; stop it with `Ctrl+C`
   - **Debug**: starts a debug session and breaks before running the request

### Path parameters

If your route path contains placeholders like `/posts/page/:page`, the extension will prompt you for values and then run the request with the resolved path.

## Configuration

You can configure the extension via VS Code Settings:

- `hono.request.enableCodeLens` (`"auto" | "always" | "disabled"`)
  - Default: `"auto"`
  - `"auto"`: only show CodeLens in files containing `new Hono`
  - `"always"`: show CodeLens for all supported route calls
  - `"disabled"`: never show CodeLens
- `hono.request.nodePath` (string)
  - Default: `"node"`
  - Node executable used to run the bundled `@hono/cli`
- `hono.request.extraArgs` (string[])
  - Extra arguments appended to `hono request`

## Supported route syntax (current)

- Route path must be a **string literal**:
  - `app.get('/path', ...)`
  - `app.get("/path", ...)`
  - ``app.get(`/path`, ...)``

## Troubleshooting

- **No CodeLens is shown**
  - Make sure the file contains `new Hono`
  - Ensure `hono.request.enableCodeLens` is enabled
  - Make sure the route path is a string literal (see supported syntax)

- **Watch mode breaks when passing request body**
  - Watch mode runs in a terminal, so shell quoting may matter depending on your environment.

## Developer

Build and install the VSIX locally:

```bash
npm install
npm run package
code --install-extension "hono-$(node -p \"require('./package.json').version\").vsix" --force
```


