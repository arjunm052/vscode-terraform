/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Position, CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { WorkspaceManager } from '../workspace/workspaceManager';

export class CompletionProvider {
	constructor(private workspace: WorkspaceManager) {}

	provideCompletionItems(document: TextDocument, position: Position): CompletionItem[] {
		const items: CompletionItem[] = [];
		const text = document.getText();
		const offset = document.offsetAt(position);
		const lineText = document.getText({
			start: { line: position.line, character: 0 },
			end: position
		});

		// Check if we're in a variable reference context
		if (lineText.match(/\b(var|local|module|data|dependency|include)\.$/)) {
			// Provide completions for variable names
			const index = this.workspace.getIndex();
			const prefix = lineText.match(/\b(var|local|module|data|dependency|include)\.$/)?.[1];

			if (prefix) {
				const symbolType = this.mapPrefixToSymbolType(prefix);
				if (symbolType) {
					const symbols = this.getSymbolsByType(index, symbolType);
					symbols.forEach(symbol => {
						items.push({
							label: symbol.name,
							kind: CompletionItemKind.Variable,
							detail: `${symbolType}: ${symbol.name}`,
							documentation: `Defined in ${symbol.uri}`
						});
					});
				}
			}
		}

		// Provide keyword completions
		const keywords = [
			'resource', 'data', 'module', 'variable', 'output', 'locals',
			'provider', 'terraform', 'dependency', 'include', 'inputs',
			'generate', 'remote_state'
		];

		keywords.forEach(keyword => {
			items.push({
				label: keyword,
				kind: CompletionItemKind.Keyword,
				detail: 'Terraform/Terragrunt keyword'
			});
		});

		return items;
	}

	private mapPrefixToSymbolType(prefix: string): string | null {
		switch (prefix) {
			case 'var':
				return 'variable';
			case 'local':
				return 'local';
			case 'module':
				return 'module';
			case 'data':
				return 'data';
			case 'dependency':
				return 'dependency';
			case 'include':
				return 'include';
			default:
				return null;
		}
	}

	private getSymbolsByType(index: any, type: string): any[] {
		const symbols: any[] = [];
		for (const [key, symbolList] of index['symbols'].entries()) {
			if (key.startsWith(`${type}:`)) {
				symbols.push(...symbolList);
			}
		}
		return symbols;
	}
}

