/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ResolutionResult } from '../types';

export function registerShowResolutionChainCommand(context: vscode.ExtensionContext, client: LanguageClient): void {
	const disposable = vscode.commands.registerCommand('terraform.showResolutionChain', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const document = editor.document;
		const position = editor.selection.active;
		const wordRange = document.getWordRangeAtPosition(position, /\b(local|dependency|include)\.\w+(\.\w+)*/);

		if (!wordRange) {
			vscode.window.showWarningMessage('No variable reference at cursor');
			return;
		}

		const expression = document.getText(wordRange);
		const result = await client.sendRequest<ResolutionResult>('terraform/resolve', {
			uri: document.uri.toString(),
			expression
		});

		if (result && result.confidence !== 'unknown') {
			const chainText = result.chain.map((step: any, i: number) =>
				`${i + 1}. ${step.description}`
			).join('\n');

			const panel = vscode.window.createWebviewPanel(
				'terraformResolutionChain',
				`Resolution Chain: ${expression}`,
				vscode.ViewColumn.Beside,
				{}
			);

			panel.webview.html = `
				<!DOCTYPE html>
				<html>
				<head>
					<style>
						body { font-family: var(--vscode-font-family); padding: 20px; }
						pre { background: var(--vscode-textCodeBlock-background); padding: 10px; }
						.chain { margin-top: 20px; }
						.step { margin: 10px 0; padding: 5px; background: var(--vscode-editor-background); }
					</style>
				</head>
				<body>
					<h2>Value: ${JSON.stringify(result.value)}</h2>
					<p><strong>Source:</strong> ${result.source}</p>
					<div class="chain">
						<h3>Resolution Chain:</h3>
						${result.chain.map((step: any, i: number) =>
				`<div class="step">${i + 1}. ${step.description}</div>`
			).join('')}
					</div>
				</body>
				</html>
			`;
		} else {
			vscode.window.showWarningMessage(`Could not resolve: ${expression}`);
		}
	});

	context.subscriptions.push(disposable);
}

