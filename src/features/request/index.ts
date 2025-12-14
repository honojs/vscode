import * as vscode from "vscode";
import type { RequestLensCommandArgs } from "./types";
import { RequestCodeLensProvider } from "./codeLensProvider";
import { runRequestDebug, runRequestOnce, runRequestWatchInTerminal } from "./runner";

export function registerRequestFeature(params: {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  selector: vscode.DocumentSelector;
}) {
  const { context, output, selector } = params;

  const provider = new RequestCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, provider),
    provider,
    vscode.commands.registerCommand("hono.request.run", async (args: RequestLensCommandArgs) => {
      await runRequestOnce({ args, output, extensionPath: context.extensionPath });
    }),
    vscode.commands.registerCommand("hono.request.watch", async (args: RequestLensCommandArgs) => {
      await runRequestWatchInTerminal({ args, output, extensionPath: context.extensionPath });
    }),
    vscode.commands.registerCommand("hono.request.debug", async (args: RequestLensCommandArgs) => {
      await runRequestDebug({ args, output, extensionPath: context.extensionPath });
    })
  );
}


