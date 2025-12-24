/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HCLNode, BlockNode, AttributeNode, FunctionCallNode } from '../parser/astTypes';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { FileReader } from '../utils/fileReader';
import { Range } from 'vscode-languageserver';

export type PathType = 'find_in_parent_folders' | 'current_dir' | 'relative' | 'absolute' | 'variable' | 'unknown';

export interface IncludeBlock {
	name: string; // "account_vars" from include "account_vars" {}
	pathValue: HCLNode; // Raw AST node for path attribute
	pathType: PathType;
	filename?: string; // Extracted filename
	line: number;
	range: Range;
}

export interface PathResolutionResult {
	uri: string | null;
	source: string; // How it was resolved
}

export class IncludeService {
	/**
	 * Find all named include blocks in the AST
	 */
	static findIncludeBlocks(ast: HCLNode[]): IncludeBlock[] {
		const includeBlocks: IncludeBlock[] = [];

		for (const node of ast) {
			if (node.type === 'block' && node.blockType === 'include') {
				const blockNode = node as BlockNode;
				const blockName = blockNode.name || 'root'; // Default to 'root' if unnamed

				// Find the 'path' attribute
				let pathAttribute: AttributeNode | undefined;
				if (blockNode.children) {
					for (const child of blockNode.children) {
						if (child.type === 'attribute' && child.attributeName === 'path') {
							pathAttribute = child as AttributeNode;
							break;
						}
					}
				}

				if (pathAttribute) {
					const pathValue = pathAttribute.value;
					const pathType = this.detectPathType(pathValue);
					const filename = this.extractFilename(pathValue, pathType);

					includeBlocks.push({
						name: blockName,
						pathValue,
						pathType,
						filename,
						line: pathAttribute.range.start.line,
						range: pathAttribute.range
					});
				}
			}

			// Recursively search in nested blocks
			if (node.children) {
				includeBlocks.push(...this.findIncludeBlocks(node.children));
			}
		}

		return includeBlocks;
	}

	/**
	 * Detect the type of path expression
	 */
	static detectPathType(pathNode: HCLNode): PathType {
		// 1. Check if it's a function call
		if (pathNode.type === 'function_call') {
			const funcNode = pathNode as FunctionCallNode;
			if (funcNode.functionName === 'find_in_parent_folders' || funcNode.name === 'find_in_parent_folders') {
				return 'find_in_parent_folders';
			}
		}

		// 2. Check if it's a variable reference
		if (pathNode.type === 'variable_reference') {
			return 'variable';
		}

		// 3. Check if it's a string literal
		if (pathNode.type === 'literal' && typeof pathNode.value === 'string') {
			const pathStr = pathNode.value;

			// Absolute path
			if (pathStr.startsWith('/')) {
				return 'absolute';
			}

			// Relative path (parent directory)
			if (pathStr.startsWith('../')) {
				return 'relative';
			}

			// Current directory (explicit)
			if (pathStr.startsWith('./')) {
				return 'current_dir';
			}

			// Current directory (implicit - no path separators or Windows separators)
			if (!pathStr.includes('/') && !pathStr.includes('\\')) {
				return 'current_dir';
			}

			// Relative path (has path separators but not absolute)
			if (pathStr.includes('/') || pathStr.includes('\\')) {
				return 'relative';
			}

			// Default to current directory for simple filenames
			return 'current_dir';
		}

		return 'unknown';
	}

	/**
	 * Extract filename from path expression
	 */
	static extractFilename(pathNode: HCLNode, pathType: PathType): string | null {
		if (pathType === 'find_in_parent_folders') {
			// Extract from function call arguments
			if (pathNode.type === 'function_call') {
				const funcNode = pathNode as FunctionCallNode;
				// Check both functionName and name properties (parser uses both)
				const funcName = (funcNode as any).functionName || (funcNode as any).name;
				console.log(`[IncludeService] Function name: ${funcName}, arguments: ${funcNode.arguments?.length || 0}`);

				if (funcName === 'find_in_parent_folders') {
					if (funcNode.arguments && funcNode.arguments.length > 0) {
						const firstArg = funcNode.arguments[0];
						console.log(`[IncludeService] First argument:`, firstArg.type, firstArg.value);
						if (firstArg.type === 'literal' && typeof firstArg.value === 'string') {
							console.log(`[IncludeService] ✅ Extracted filename: ${firstArg.value}`);
							return firstArg.value;
						}
					}
					console.log(`[IncludeService] ⚠️ No arguments found, defaulting to terragrunt.hcl`);
					// Default to terragrunt.hcl if no argument
					return 'terragrunt.hcl';
				}
			}
			// Also try to extract from the raw value if it's a string (fallback)
			if (pathNode.type === 'literal' && typeof pathNode.value === 'string') {
				// Try to parse function call from string: find_in_parent_folders("filename.hcl")
				const funcMatch = pathNode.value.match(/find_in_parent_folders\s*\(["']([^"']+)["']\)/);
				if (funcMatch) {
					console.log(`[IncludeService] ✅ Extracted filename from string: ${funcMatch[1]}`);
					return funcMatch[1];
				}
			}
			console.log(`[IncludeService] ⚠️ Could not extract filename, defaulting to terragrunt.hcl`);
			// Default to terragrunt.hcl if not a function call
			return 'terragrunt.hcl';
		}

		if (pathType === 'current_dir' || pathType === 'relative' || pathType === 'absolute') {
			if (pathNode.type === 'literal' && typeof pathNode.value === 'string') {
				// Extract just the filename if it's a path
				const pathStr = pathNode.value;
				return path.basename(pathStr);
			}
		}

		return null;
	}

	/**
	 * Resolve the file path for an include block
	 */
	static async resolveIncludePath(
		includeBlock: IncludeBlock,
		currentUri: string
	): Promise<PathResolutionResult> {
		const currentPath = URI.parse(currentUri).fsPath;
		const currentDir = path.dirname(currentPath);

		console.log(`[IncludeService] Resolving include "${includeBlock.name}" with path type: ${includeBlock.pathType}`);

		switch (includeBlock.pathType) {
			case 'find_in_parent_folders': {
				const filename = includeBlock.filename || 'terragrunt.hcl';
				console.log(`[IncludeService] Searching for "${filename}" in parent directories`);
				const foundUri = await FileReader.findInParentDirs(currentPath, filename);
				if (foundUri) {
					return {
						uri: foundUri,
						source: `find_in_parent_folders("${filename}")`
					};
				}
				return {
					uri: null,
					source: `find_in_parent_folders("${filename}") - not found`
				};
			}

			case 'current_dir': {
				if (includeBlock.pathValue.type === 'literal' && typeof includeBlock.pathValue.value === 'string') {
					const filename = includeBlock.pathValue.value;
					const filePath = path.join(currentDir, filename);
					const fileUri = URI.file(filePath).toString();
					const exists = await FileReader.fileExists(fileUri);
					if (exists) {
						return {
							uri: fileUri,
							source: `current directory: ${filename}`
						};
					}
				}
				return {
					uri: null,
					source: 'current directory - file not found'
				};
			}

			case 'relative': {
				if (includeBlock.pathValue.type === 'literal' && typeof includeBlock.pathValue.value === 'string') {
					const relativePath = includeBlock.pathValue.value;
					const resolvedPath = path.resolve(currentDir, relativePath);
					const fileUri = URI.file(resolvedPath).toString();
					const exists = await FileReader.fileExists(fileUri);
					if (exists) {
						return {
							uri: fileUri,
							source: `relative path: ${relativePath}`
						};
					}
				}
				return {
					uri: null,
					source: 'relative path - file not found'
				};
			}

			case 'absolute': {
				if (includeBlock.pathValue.type === 'literal' && typeof includeBlock.pathValue.value === 'string') {
					const absolutePath = includeBlock.pathValue.value;
					const normalizedPath = path.normalize(absolutePath);
					const fileUri = URI.file(normalizedPath).toString();
					const exists = await FileReader.fileExists(fileUri);
					if (exists) {
						return {
							uri: fileUri,
							source: `absolute path: ${absolutePath}`
						};
					}
				}
				return {
					uri: null,
					source: 'absolute path - file not found'
				};
			}

			case 'variable': {
				// TODO: Resolve variable first, then apply path detection
				console.log('[IncludeService] Variable path resolution not yet implemented');
				return {
					uri: null,
					source: 'variable path - not yet implemented'
				};
			}

			default:
				return {
					uri: null,
					source: 'unknown path type'
				};
		}
	}
}

