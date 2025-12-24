/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vscode-languageserver';
import { HCLNode, BlockNode, AttributeNode } from '../parser/astTypes';

export interface Symbol {
	name: string;
	type: 'local' | 'variable' | 'output' | 'resource' | 'data' | 'module' | 'dependency' | 'include';
	uri: string;
	range: Range;
	definition?: HCLNode;
}

export class WorkspaceIndex {
	private symbols = new Map<string, Symbol[]>();
	private reverseIndex = new Map<string, string[]>(); // uri -> symbol names
	private documentASTs = new Map<string, HCLNode[]>(); // uri -> AST

	indexDocument(uri: string, ast: HCLNode[]): void {
		console.log('[WorkspaceIndex] indexDocument called for:', uri);
		console.log('[WorkspaceIndex] AST has', ast.length, 'nodes');

		// Store AST
		this.documentASTs.set(uri, ast);
		console.log('[WorkspaceIndex] AST stored. Total documents indexed:', this.documentASTs.size);

		// Remove old symbols for this document
		const oldSymbols = this.reverseIndex.get(uri) || [];
		oldSymbols.forEach(symbolKey => {
			const symbols = this.symbols.get(symbolKey);
			if (symbols) {
				const filtered = symbols.filter(s => s.uri !== uri);
				if (filtered.length > 0) {
					this.symbols.set(symbolKey, filtered);
				} else {
					this.symbols.delete(symbolKey);
				}
			}
		});

		// Extract new symbols
		const newSymbols = this.extractSymbols(ast, uri);
		const newSymbolKeys: string[] = [];

		// Update indexes
		newSymbols.forEach(symbol => {
			const key = `${symbol.type}:${symbol.name}`;
			newSymbolKeys.push(key);

			if (!this.symbols.has(key)) {
				this.symbols.set(key, []);
			}
			this.symbols.get(key)!.push(symbol);
		});

		this.reverseIndex.set(uri, newSymbolKeys);
	}

	private extractSymbols(ast: HCLNode[], uri: string): Symbol[] {
		const symbols: Symbol[] = [];

		for (const node of ast) {
			if (node.type === 'block') {
				const block = node as BlockNode;
				const symbolType = this.mapBlockTypeToSymbolType(block.blockType);

				if (symbolType) {
					symbols.push({
						name: block.name,
						type: symbolType,
						uri,
						range: block.range,
						definition: block
					});
				}

				// Recursively extract from children
				if (block.children) {
					symbols.push(...this.extractSymbols(block.children, uri));
				}
			} else if (node.type === 'attribute') {
				const attr = node as AttributeNode;
				// Check if this is a locals block attribute
				// This would need context from parent blocks
			}
		}

		return symbols;
	}

	private mapBlockTypeToSymbolType(blockType: string): Symbol['type'] | null {
		switch (blockType) {
			case 'locals':
				return 'local';
			case 'variable':
				return 'variable';
			case 'output':
				return 'output';
			case 'resource':
				return 'resource';
			case 'data':
				return 'data';
			case 'module':
				return 'module';
			case 'dependency':
				return 'dependency';
			case 'include':
				return 'include';
			default:
				return null;
		}
	}

	findSymbol(type: string, name: string): Symbol[] {
		return this.symbols.get(`${type}:${name}`) || [];
	}

	getDocumentAST(uri: string): HCLNode[] | undefined {
		console.log('[WorkspaceIndex] getDocumentAST called for:', uri);
		console.log('[WorkspaceIndex] Available URIs:', Array.from(this.documentASTs.keys()));

		const ast = this.documentASTs.get(uri);
		if (ast) {
			console.log('[WorkspaceIndex] ✅ Found AST with', ast.length, 'nodes');
		} else {
			console.log('[WorkspaceIndex] ❌ No AST found for URI');
			// Try to find a matching URI (case-insensitive or path normalization)
			for (const [storedUri, storedAST] of this.documentASTs.entries()) {
				if (storedUri.toLowerCase() === uri.toLowerCase() ||
				    storedUri.replace(/\\/g, '/') === uri.replace(/\\/g, '/')) {
					console.log('[WorkspaceIndex] Found similar URI:', storedUri);
					return storedAST;
				}
			}
		}
		return ast;
	}

	findDependents(uri: string): string[] {
		// Find files that reference symbols from this file
		const dependents = new Set<string>();
		const symbolsInFile = this.reverseIndex.get(uri) || [];

		for (const symbolKey of symbolsInFile) {
			const symbols = this.symbols.get(symbolKey) || [];
			symbols.forEach(symbol => {
				if (symbol.uri !== uri) {
					dependents.add(symbol.uri);
				}
			});
		}

		return Array.from(dependents);
	}
}

