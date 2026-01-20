# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VS Code extension for Hono development. Shows CodeLens on route definitions and runs `hono request`/`hono serve` via bundled `@hono/cli`.

## Common Commands

```bash
# Install dependencies
npm install

# Build (compile TypeScript)
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Run all tests
npm test

# Run tests once (no watch)
npm run test:run

# Run a single test file
npx vitest run src/features/request/routeParser.test.ts

# Lint
npm run lint

# Format check
npm run format

# Package VSIX for local install
npm run package
```

## Architecture

### Entry Point
- `src/extension.ts` - Extension activation, registers features and commands

### Features Structure
- `src/features/request/` - CodeLens for route detection and request execution
  - `codeLensProvider.ts` - Provides Run/Watch/Debug CodeLens for detected routes
  - `routeParser.ts` - Parses route definitions from source text
  - `runner.ts` - Executes `hono request` commands (once, watch, debug modes)
  - `argvBuilder.ts` - Builds CLI arguments for hono request
  - `pathParams.ts` - Handles path parameter substitution
  - `typeInference.ts` - Infers form input types from TypeScript
- `src/features/serve/` - Debug command for `hono serve`
  - `debugCommand.ts` - Runs `hono serve` in debug mode from active file

### Shared Utilities
- `src/shared/config.ts` - VS Code configuration access
- `src/shared/honoCli.ts` - Resolves bundled `@hono/cli` path
- `src/shared/commentRanges.ts` - Detects comment ranges (to exclude from route parsing)
- `src/shared/inputHistory.ts` - Persists user input values via `globalState`

## Key Implementation Details

### Route Detection (`routeParser.ts`)
- Detects methods: `.get`, `.post`, `.put`, `.delete`, `.patch`, `.options`, `.head`
- Only **string literal** paths supported: `'...'`, `"..."`, `` `...` ``
- Route calls inside comments (`//`, `/* */`) are excluded
- Test files (`*.test.ts`, `*.spec.ts`, etc.) are excluded from CodeLens

### CodeLens Behavior (`codeLensProvider.ts`)
- `enableCodeLens` setting controls visibility:
  - `auto` (default): show only when file contains `new Hono`
  - `always`: show for all route calls
  - `disabled`: never show
- Three actions per route: Run, Watch, Debug

### Path Parameters (`pathParams.ts`)
- Placeholders like `:id` in `/posts/:id` prompt user for values
- Values are URL-encoded before substitution
- Input history persisted per workspace via `globalState`

### Body Input for POST/PUT/PATCH/DELETE (`typeInference.ts`, `runner.ts`)
- Attempts to infer `input.form` from TypeScript type information
- If inference succeeds: shows form input, sends as `application/x-www-form-urlencoded`
- If inference fails: falls back to raw body input
- Array fields accept comma-separated values (e.g., `a,b,c`)

### Watch Terminal Behavior (`runner.ts`)
- When starting Watch, if terminal named `Hono Watch:*` exists:
  1. Send Ctrl+C to stop running process
  2. Dispose the terminal
  3. Create new terminal
- Prevents duplicate watch processes

### Debug Mode
- Uses `--inspect=0` (no break on start, only user breakpoints stop)
- `hono.debug` command: runs `hono serve <activeFile>` in debug mode

### CLI Resolution (`honoCli.ts`)
- Uses bundled `@hono/cli` from extension's node_modules (no npx)
- Node path configurable via `hono.request.nodePath` setting

## Testing

Tests are colocated with source files (e.g., `routeParser.test.ts`). Uses Vitest.
