/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Position, Hover, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { ResolutionEngine } from '../resolver/resolutionEngine';
import { WorkspaceManager } from '../workspace/workspaceManager';
import { URI } from 'vscode-uri';
import * as path from 'path';

export class HoverProvider {
	constructor(
		private resolutionEngine: ResolutionEngine,
		private workspace: WorkspaceManager
	) {}

	async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
		console.log('[HoverProvider] provideHover called at position:', position);

		// Get word at position
		const wordRange = this.getWordRangeAtPosition(document, position);
		if (!wordRange) {
			console.log('[HoverProvider] No word range found at position');
			return null;
		}

		const expression = document.getText(wordRange);
		console.log('[HoverProvider] Found expression:', expression);

		// Skip dependency expressions - they are not supported for resolution
		if (expression.startsWith('dependency.')) {
			console.log('[HoverProvider] Skipping dependency expression (not supported)');
			return null;
		}

		// Request resolution from resolution engine
		console.log('[HoverProvider] Calling resolution engine...');
		const result = await this.resolutionEngine.resolve(expression, {
			currentUri: document.uri
		});

		console.log('[HoverProvider] Resolution result:', JSON.stringify(result).substring(0, 200));

		if (result.confidence === 'unknown') {
			console.log('[HoverProvider] Confidence is unknown, returning null');
			return null;
		}

		// Format hover content
		console.log('[HoverProvider] Formatting hover content...');
		const markdown: MarkupContent = {
			kind: MarkupKind.Markdown,
			value: this.formatHoverContent(result)
		};

		console.log('[HoverProvider] ✅ Returning hover result');
		return {
			contents: markdown,
			range: wordRange
		};
	}

	private getWordRangeAtPosition(document: TextDocument, position: Position) {
		const text = document.getText();
		const offset = document.offsetAt(position);

		// Match variable references: local.*, dependency.*, include.*, var.*, etc.
		const regex = /\b(var|local|module|data|dependency|include|path|self|count|each|terraform)\.[a-zA-Z0-9_.-]+/g;
		let match;

		while ((match = regex.exec(text)) !== null) {
			const startOffset = match.index;
			const endOffset = startOffset + match[0].length;

			if (offset >= startOffset && offset <= endOffset) {
				return {
					start: document.positionAt(startOffset),
					end: document.positionAt(endOffset)
				};
			}
		}

		return null;
	}

	private formatHoverContent(result: any): string {
		let content = '';

		// Format value display
		if (result.value !== null && result.value !== undefined) {
			if (typeof result.value === 'object' && !Array.isArray(result.value)) {
				// For objects, show a summary and formatted version
				const keys = Object.keys(result.value);
				if (keys.length > 0) {
					// Show summary: "{ key1, key2, ... }"
					content += `**Value:** \`{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? `, ...` : ''} }\`\n\n`;

					// Show formatted object
					const formatted = this.formatObject(result.value, 0);
					content += '```json\n';
					content += formatted;
					content += '\n```\n\n';
				} else {
					content += '```json\n{}\n```\n\n';
				}
			} else if (Array.isArray(result.value)) {
				// For arrays, show formatted version
				const formatted = this.formatObject(result.value, 0);
				content += '```json\n';
				content += formatted;
				content += '\n```\n\n';
			} else {
				// For primitives, show directly
				content += '```\n';
				content += String(result.value);
				content += '\n```\n\n';
			}
		} else {
			content += '*Value: null*\n\n';
		}

		// Show source file with friendly path
		if (result.source && result.source !== 'unknown') {
			const sourcePath = this.formatFilePath(result.source);
			content += `**Source:** \`${sourcePath}\`\n\n`;
		}

		// Show resolution method if available (from cached include)
		if (result.resolvedPath) {
			content += `**Resolved via:** ${result.resolvedPath}\n\n`;
		}

		// Show resolution chain
		if (result.chain && result.chain.length > 0) {
			content += '**Resolution Chain:**\n\n';
			result.chain.forEach((step: any, i: number) => {
				content += `${i + 1}. ${step.description}\n`;
				if (step.location) {
					const locationPath = this.formatFilePath(step.location.uri);
					content += `   📍 *${locationPath}*`;
					if (step.location.line !== undefined) {
						content += `:${step.location.line + 1}`;
					}
					content += '\n';
				}
			});
			content += '\n';
		}

		// Show confidence level
		if (result.confidence) {
			const confidenceEmoji = result.confidence === 'exact' ? '✅' : result.confidence === 'inferred' ? '⚠️' : '❓';
			content += `${confidenceEmoji} **Confidence:** ${result.confidence}\n`;
		}

		return content;
	}

	private formatFilePath(uri: string): string {
		try {
			const filePath = URI.parse(uri).fsPath;
			// Show just filename if it's in workspace, otherwise show relative path
			return path.basename(filePath);
		} catch {
			return uri;
		}
	}

	/**
	 * Format an object with proper indentation for better readability
	 */
	private formatObject(obj: any, indent: number = 0): string {
		const indentStr = '  '.repeat(indent);
		const nextIndent = indent + 1;
		const nextIndentStr = '  '.repeat(nextIndent);

		if (obj === null) {
			return 'null';
		}

		if (obj === undefined) {
			return 'undefined';
		}

		if (Array.isArray(obj)) {
			if (obj.length === 0) {
				return '[]';
			}
			const items = obj.map(item => {
				if (typeof item === 'object' && item !== null) {
					return `${nextIndentStr}${this.formatObject(item, nextIndent)}`;
				}
				return `${nextIndentStr}${JSON.stringify(item)}`;
			}).join(',\n');
			return `[\n${items}\n${indentStr}]`;
		}

		if (typeof obj === 'object') {
			const keys = Object.keys(obj);
			if (keys.length === 0) {
				return '{}';
			}

			const items = keys.map(key => {
				const value = obj[key];
				if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
					return `${nextIndentStr}"${key}": ${this.formatObject(value, nextIndent)}`;
				}
				if (Array.isArray(value)) {
					return `${nextIndentStr}"${key}": ${this.formatObject(value, nextIndent)}`;
				}
				return `${nextIndentStr}"${key}": ${JSON.stringify(value)}`;
			}).join(',\n');

			return `{\n${items}\n${indentStr}}`;
		}

		return JSON.stringify(obj);
	}
}

