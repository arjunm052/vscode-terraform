/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Position, Location, ReferenceParams } from 'vscode-languageserver';
import { WorkspaceManager } from '../workspace/workspaceManager';

export class ReferencesProvider {
	constructor(private workspace: WorkspaceManager) {}

	async provideReferences(
		document: TextDocument,
		position: Position,
		context: ReferenceParams['context']
	): Promise<Location[] | null> {
		const text = document.getText();
		const offset = document.offsetAt(position);

		// Find variable reference at position
		const varRefMatch = this.findVariableReferenceAtOffset(text, offset);
		if (!varRefMatch) {
			return null;
		}

		const { prefix, name } = varRefMatch;
		const symbolType = this.mapPrefixToSymbolType(prefix);
		if (!symbolType) {
			return null;
		}

		// Find all references to this symbol
		const index = this.workspace.getIndex();
		const symbols = index.findSymbol(symbolType, name);

		// For now, return definitions as references
		// In a full implementation, we'd scan all documents for references
		return symbols.map(symbol => Location.create(symbol.uri, symbol.range));
	}

	private findVariableReferenceAtOffset(text: string, offset: number): { prefix: string; name: string } | null {
		const regex = /\b(var|local|module|data|dependency|include|path|self|count|each|terraform)\.([a-zA-Z0-9_.-]+)/g;
		let match;

		while ((match = regex.exec(text)) !== null) {
			const startOffset = match.index;
			const endOffset = startOffset + match[0].length;

			if (offset >= startOffset && offset <= endOffset) {
				return {
					prefix: match[1],
					name: match[2]
				};
			}
		}

		return null;
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
}

