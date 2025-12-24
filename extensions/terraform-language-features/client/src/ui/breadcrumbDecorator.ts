/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ResolutionResult } from '../types';

export class BreadcrumbDecorator {
	private decorationType: vscode.TextEditorDecorationType;
	private disposables: vscode.Disposable[] = [];

	constructor(private client: LanguageClient) {
		this.decorationType = vscode.window.createTextEditorDecorationType({
			after: {
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
				margin: '0 0 0 1em'
			}
		});

		// Update decorations when active editor changes
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => {
				this.updateDecorations();
			})
		);

		// Update decorations when document changes (debounced)
		let timeout: NodeJS.Timeout | undefined;
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(() => {
				if (timeout) {
					clearTimeout(timeout);
				}
				timeout = setTimeout(() => {
					this.updateDecorations();
				}, 500);
			})
		);
	}

	async updateDecorations(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const document = editor.document;
		if (document.languageId !== 'terraform' && document.languageId !== 'terragrunt') {
			return;
		}

		const decorations: vscode.DecorationOptions[] = [];
		const text = document.getText();
		const visibleRange = editor.visibleRanges[0];
		if (!visibleRange) {
			return;
		}

		// Find all variable references in visible range
		const regex = /\b(local|dependency|include)\.\w+(\.\w+)*/g;
		let match;

		while ((match = regex.exec(text)) !== null) {
			const expression = match[0];
			const startOffset = match.index;
			const endOffset = startOffset + expression.length;
			const startPos = document.positionAt(startOffset);
			const endPos = document.positionAt(endOffset);

			// Only process if in visible range
			if (visibleRange.contains(startPos) || visibleRange.contains(endPos)) {
				// Resolve value
				const result = await this.client.sendRequest<ResolutionResult>('terraform/resolve', {
					uri: document.uri.toString(),
					expression
				});

				if (result && result.confidence !== 'unknown') {
					const sourceFile = result.source.split('/').pop() || result.source;
					const hintText = ` → ${sourceFile} → ${JSON.stringify(result.value)}`;
					decorations.push({
						range: new vscode.Range(endPos, endPos),
						renderOptions: {
							after: { contentText: hintText }
						}
					});
				}
			}
		}

		editor.setDecorations(this.decorationType, decorations);
	}

	dispose(): void {
		this.decorationType.dispose();
		this.disposables.forEach(d => d.dispose());
	}
}

