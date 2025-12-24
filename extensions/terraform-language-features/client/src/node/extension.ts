/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ExtensionContext, workspace, window } from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';
import { VariableInspectorProvider } from '../ui/variableTreeView';
import { BreadcrumbDecorator } from '../ui/breadcrumbDecorator';
import { registerRefreshWorkspaceCommand } from '../commands/refreshWorkspace';
import { registerShowResolutionChainCommand } from '../commands/showResolutionChain';

let client: LanguageClient;
let treeViewProvider: VariableInspectorProvider;
let breadcrumbDecorator: BreadcrumbDecorator;

export function activate(context: ExtensionContext): void {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'node', 'serverMain.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for Terraform and Terragrunt documents
		documentSelector: [
			{ scheme: 'file', language: 'terraform' },
			{ scheme: 'file', language: 'terragrunt' }
		],
		synchronize: {
			// Notify the server about file changes to .tf, .hcl, .tfvars files
			fileEvents: workspace.createFileSystemWatcher('**/*.{tf,hcl,tfvars}')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'terraformLanguageServer',
		'Terraform Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start().then(() => {
		// Initialize UI components after client is ready
		treeViewProvider = new VariableInspectorProvider(client);
		const treeView = window.createTreeView('terraformVariables', {
			treeDataProvider: treeViewProvider
		});

		breadcrumbDecorator = new BreadcrumbDecorator(client);

		// Register commands
		registerRefreshWorkspaceCommand(context, treeViewProvider);
		registerShowResolutionChainCommand(context, client);

		context.subscriptions.push(treeView);
		context.subscriptions.push(breadcrumbDecorator);
	}).catch((error) => {
		window.showErrorMessage(`Failed to start Terraform Language Server: ${error}`);
		console.error('Terraform extension activation error:', error);
	});
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	if (breadcrumbDecorator) {
		breadcrumbDecorator.dispose();
	}
	return client.stop();
}

