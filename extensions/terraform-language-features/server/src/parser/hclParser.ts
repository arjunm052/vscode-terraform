/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { HCLNode, BlockNode, AttributeNode, VariableReferenceNode, FunctionCallNode, createRange } from './astTypes';

export class HCLParser {
	private cache = new Map<string, HCLNode[]>();

	async parse(document: TextDocument): Promise<HCLNode[]> {
		const uri = document.uri;
		const content = document.getText();
		const contentHash = this.hashContent(content);

		// Check cache first
		const cacheKey = `${uri}:${contentHash}`;
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!;
		}

		// Parse content
		const ast = this.parseContent(content, uri);

		// Post-process for Terragrunt constructs
		const enhancedAST = this.enhanceForTerragrunt(ast);

		this.cache.set(cacheKey, enhancedAST);
		return enhancedAST;
	}

	private hashContent(content: string): string {
		// Simple hash function for content
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return hash.toString();
	}

	private parseContent(content: string, uri: string): HCLNode[] {
		const ast: HCLNode[] = [];
		const lines = content.split('\n');
		let currentBlock: BlockNode | null = null;
		let blockStack: BlockNode[] = [];

		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum];
			const trimmed = line.trim();

			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			// Match block definitions: resource "type" "name" { or locals {
			const blockMatch = trimmed.match(/^\s*(resource|data|module|variable|output|locals|provider|terraform|dependency|include|terraform|inputs|generate|remote_state|moved|import|check|dynamic|for_each|count|lifecycle|provisioner|connection)\s+(?:"([^"]+)"\s+)?(?:"([^"]+)"\s*)?\{/);
			if (blockMatch) {
				const blockType = blockMatch[1];
				const typeName = blockMatch[2] || '';
				const name = blockMatch[3] || '';

				const block: BlockNode = {
					type: 'block',
					blockType,
					name: name || typeName,
					range: createRange(lineNum, 0, lineNum, line.length),
					children: []
				};

				if (currentBlock) {
					currentBlock.children.push(block);
					blockStack.push(currentBlock);
				} else {
					ast.push(block);
				}

				currentBlock = block;
				continue;
			}

			// Match closing brace
			if (trimmed === '}') {
				if (currentBlock) {
					currentBlock.range.end = Position.create(lineNum, line.length);
					currentBlock = blockStack.pop() || null;
				}
				continue;
			}

			// Match attributes: key = value
			const attrMatch = trimmed.match(/^\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(.+)$/);
			if (attrMatch && currentBlock) {
				const attrName = attrMatch[1];
				const attrValue = attrMatch[2].trim();

				// Check if value starts with { (multi-line map/object)
				if (attrValue.startsWith('{')) {
					// Parse multi-line map
					const mapResult = this.parseMapValue(lines, lineNum, line.indexOf(attrValue));
					if (mapResult) {
						const attr: AttributeNode = {
							type: 'attribute',
							attributeName: attrName,
							range: createRange(lineNum, 0, mapResult.endLine, lines[mapResult.endLine].length),
							value: mapResult.node
						};
						currentBlock.children.push(attr);
						// Skip lines that were part of the map
						lineNum = mapResult.endLine;
						continue;
					}
				}

				const valueNode = this.parseValue(attrValue, lineNum, line.indexOf(attrValue));

				const attr: AttributeNode = {
					type: 'attribute',
					attributeName: attrName,
					range: createRange(lineNum, 0, lineNum, line.length),
					value: valueNode
				};

				currentBlock.children.push(attr);
				continue;
			}

			// Match variable references: var.name, local.name, module.name.output, etc.
			const varRefMatch = trimmed.match(/\b(var|local|module|data|dependency|include|path|self|count|each|terraform)\.([a-zA-Z0-9_.-]+)/);
			if (varRefMatch) {
				const prefix = varRefMatch[1];
				const path = varRefMatch[2].split('.');

				const varRef: VariableReferenceNode = {
					type: 'variable_reference',
					name: varRefMatch[0],
					prefix,
					path,
					range: createRange(lineNum, line.indexOf(varRefMatch[0]), lineNum, line.indexOf(varRefMatch[0]) + varRefMatch[0].length)
				};

				if (currentBlock) {
					currentBlock.children.push(varRef);
				} else {
					ast.push(varRef);
				}
			}
		}

		return ast;
	}

	private parseValue(value: string, lineNum: number, charOffset: number): HCLNode {
		const trimmed = value.trim();

		// Parse variable references FIRST (before string literals)
		// This handles cases like: Account = local.account_name (unquoted variable reference)
		const varRefMatch = trimmed.match(/^(var|local|module|data|dependency|include|path|self|count|each|terraform)\.([a-zA-Z0-9_.-]+)$/);
		if (varRefMatch) {
			const prefix = varRefMatch[1];
			const path = varRefMatch[2].split('.');
			return {
				type: 'variable_reference',
				name: trimmed,
				prefix: prefix,
				path: path,
				range: createRange(lineNum, charOffset, lineNum, charOffset + value.length)
			} as VariableReferenceNode;
		}

		// Parse string literals
		if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
			return {
				type: 'literal',
				value: trimmed.slice(1, -1),
				range: createRange(lineNum, charOffset, lineNum, charOffset + value.length)
			};
		}

		// Parse numbers
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			return {
				type: 'literal',
				value: parseFloat(trimmed),
				range: createRange(lineNum, charOffset, lineNum, charOffset + value.length)
			};
		}

		// Parse booleans
		if (trimmed === 'true' || trimmed === 'false') {
			return {
				type: 'literal',
				value: trimmed === 'true',
				range: createRange(lineNum, charOffset, lineNum, charOffset + value.length)
			};
		}

		// Parse function calls: find_in_parent_folders("filename.hcl") or read_terragrunt_config(find_in_parent_folders("filename.hcl"))
		const funcMatch = value.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
		if (funcMatch) {
			const funcName = funcMatch[1];
			const args: HCLNode[] = [];

			// Extract arguments from the function call, handling nested parentheses
			// Find the matching closing parenthesis by counting parentheses
			let parenCount = 0;
			let argStart = funcMatch[0].length - 1; // Position after opening paren
			let argEnd = argStart;

			for (let i = argStart; i < value.length; i++) {
				if (value[i] === '(') parenCount++;
				if (value[i] === ')') {
					parenCount--;
					if (parenCount === 0) {
						argEnd = i;
						break;
					}
				}
			}

			const argStr = value.substring(argStart + 1, argEnd).trim();

			if (argStr) {
				// Check if argument is a nested function call (e.g., find_in_parent_folders("filename.hcl"))
				const nestedFuncMatch = argStr.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
				if (nestedFuncMatch) {
					// Parse nested function call - find its closing paren
					const nestedFuncName = nestedFuncMatch[1];
					let nestedParenCount = 0;
					let nestedArgStart = nestedFuncMatch[0].length - 1;
					let nestedArgEnd = nestedArgStart;

					for (let i = nestedArgStart; i < argStr.length; i++) {
						if (argStr[i] === '(') nestedParenCount++;
						if (argStr[i] === ')') {
							nestedParenCount--;
							if (nestedParenCount === 0) {
								nestedArgEnd = i;
								break;
							}
						}
					}

					const nestedArgStr = argStr.substring(nestedArgStart + 1, nestedArgEnd);
					const nestedArgs: HCLNode[] = [];

					// Extract string argument from nested function
					const nestedStringArgMatch = nestedArgStr.match(/["']([^"']+)["']/);
					if (nestedStringArgMatch) {
						nestedArgs.push({
							type: 'literal',
							value: nestedStringArgMatch[1],
							range: createRange(lineNum, charOffset + argStart + nestedArgStart + nestedStringArgMatch.index! + 1, lineNum, charOffset + argStart + nestedArgStart + nestedStringArgMatch.index! + nestedStringArgMatch[0].length)
						});
					}

					// Create nested function call node
					args.push({
						type: 'function_call',
						name: nestedFuncName,
						functionName: nestedFuncName,
						arguments: nestedArgs,
						range: createRange(lineNum, charOffset + argStart + 1, lineNum, charOffset + argStart + argStr.length + 1)
					} as FunctionCallNode);
				} else {
					// Parse string arguments (simple case: single quoted string)
					const stringArgMatch = argStr.match(/["']([^"']+)["']/);
					if (stringArgMatch) {
						args.push({
							type: 'literal',
							value: stringArgMatch[1],
							range: createRange(lineNum, charOffset + argStart + stringArgMatch.index! + 1, lineNum, charOffset + argStart + stringArgMatch.index! + stringArgMatch[0].length)
						});
					}
				}
			}

			return {
				type: 'function_call',
				name: funcName,
				functionName: funcName,
				arguments: args,
				range: createRange(lineNum, charOffset, lineNum, charOffset + value.length)
			} as FunctionCallNode;
		}

		// Default: treat as literal string
		return {
			type: 'literal',
			value: value,
			range: createRange(lineNum, charOffset, lineNum, charOffset + value.length)
		};
	}

	private enhanceForTerragrunt(ast: HCLNode[]): HCLNode[] {
		// Add Terragrunt-specific processing
		// This can identify dependency blocks, include blocks, etc.
		return ast;
	}

	/**
	 * Parse a multi-line map/object value: { key = value, key2 = value2 }
	 * Returns the parsed block node and the end line number
	 */
	private parseMapValue(lines: string[], startLine: number, charOffset: number): { node: BlockNode; endLine: number } | null {
		let braceCount = 0;
		let inString = false;
		let stringChar = '';
		let endLine = startLine;

		const mapBlock: BlockNode = {
			type: 'block',
			blockType: 'map',
			name: '',
			range: createRange(startLine, charOffset, startLine, lines[startLine].length),
			children: []
		};

		// Find the closing brace
		for (let i = startLine; i < lines.length; i++) {
			const line = lines[i];
			endLine = i;

			for (let j = (i === startLine ? charOffset : 0); j < line.length; j++) {
				const char = line[j];
				const prevChar = j > 0 ? line[j - 1] : '';

				// Handle string literals
				if ((char === '"' || char === "'") && prevChar !== '\\') {
					if (!inString) {
						inString = true;
						stringChar = char;
					} else if (char === stringChar) {
						inString = false;
						stringChar = '';
					}
					continue;
				}

				if (inString) continue;

				// Count braces
				if (char === '{') {
					braceCount++;
				} else if (char === '}') {
					braceCount--;
					if (braceCount === 0) {
						// End of map - parse contents
						mapBlock.range.end = Position.create(i, j + 1);
						this.parseMapContents(lines, startLine + 1, i - 1, mapBlock);
						return { node: mapBlock, endLine: i };
					}
				}
			}
		}

		return null;
	}

	/**
	 * Parse the contents of a map block
	 */
	private parseMapContents(lines: string[], startLine: number, endLine: number, mapBlock: BlockNode): void {
		for (let i = startLine; i <= endLine; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			// Match key = value pairs
			const keyValueMatch = trimmed.match(/^\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(.+)$/);
			if (keyValueMatch) {
				const key = keyValueMatch[1];
				const value = keyValueMatch[2].trim();

				// Check if value is a nested map
				if (value.startsWith('{')) {
					const nestedMapResult = this.parseMapValue(lines, i, line.indexOf(value));
					if (nestedMapResult) {
						const attr: AttributeNode = {
							type: 'attribute',
							attributeName: key,
							range: createRange(i, 0, nestedMapResult.endLine, lines[nestedMapResult.endLine].length),
							value: nestedMapResult.node
						};
						mapBlock.children.push(attr);
						i = nestedMapResult.endLine;
						continue;
					}
				}

				const valueNode = this.parseValue(value, i, line.indexOf(value));

				const attr: AttributeNode = {
					type: 'attribute',
					attributeName: key,
					range: createRange(i, 0, i, line.length),
					value: valueNode
				};

				mapBlock.children.push(attr);
			}
		}
	}

	invalidateCache(uri: string): void {
		const keysToDelete: string[] = [];
		for (const key of this.cache.keys()) {
			if (key.startsWith(uri)) {
				keysToDelete.push(key);
			}
		}
		keysToDelete.forEach(key => this.cache.delete(key));
	}
}

