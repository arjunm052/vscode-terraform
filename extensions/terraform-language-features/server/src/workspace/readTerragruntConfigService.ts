/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HCLNode, BlockNode, AttributeNode, FunctionCallNode } from '../parser/astTypes';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { FileReader } from '../utils/fileReader';
import { IncludeService, PathType } from './includeService';

export interface ReadTerragruntConfigCall {
	localName: string; // "account_vars" from local { account_vars = read_terragrunt_config(...) }
	pathValue: HCLNode; // Raw AST node for path argument
	pathType: PathType;
	filename?: string; // Extracted filename
	line: number;
	range: any;
}

export interface PathResolutionResult {
	uri: string | null;
	source: string; // How it was resolved
}

export class ReadTerragruntConfigService {
	/**
	 * Find all read_terragrunt_config() calls in locals blocks
	 */
	static findReadTerragruntConfigCalls(ast: HCLNode[]): ReadTerragruntConfigCall[] {
		const calls: ReadTerragruntConfigCall[] = [];

		for (const node of ast) {
			if (node.type === 'block' && (node as BlockNode).blockType === 'locals') {
				const localsBlock = node as BlockNode;
				if (localsBlock.children) {
					for (const child of localsBlock.children) {
						if (child.type === 'attribute') {
							const attr = child as AttributeNode;
							const localName = attr.attributeName;

							// Check if the value is a read_terragrunt_config() call
							if (attr.value && attr.value.type === 'function_call') {
								const funcCall = attr.value as FunctionCallNode;
								if (funcCall.functionName === 'read_terragrunt_config') {
									// Extract path argument
									const pathNode = funcCall.arguments && funcCall.arguments.length > 0
										? funcCall.arguments[0]
										: null;

									if (pathNode) {
										const pathType = this.detectPathType(pathNode);
										const filename = this.extractFilename(pathNode);

										console.log(`[ReadTerragruntConfigService] Found read_terragrunt_config call: localName="${localName}", pathType="${pathType}", filename="${filename}"`);
										console.log(`[ReadTerragruntConfigService] Path node type: ${pathNode.type}, value:`, pathNode);

										calls.push({
											localName,
											pathValue: pathNode,
											pathType,
											filename,
											line: attr.range.start.line,
											range: attr.range
										});
									} else {
										console.log(`[ReadTerragruntConfigService] ⚠️ No path node found for read_terragrunt_config call: ${localName}`);
									}
								}
							}
						}
					}
				}
			}
		}

		return calls;
	}

	/**
	 * Detect the type of path (find_in_parent_folders, current_dir, relative, absolute, variable)
	 */
	private static detectPathType(pathNode: HCLNode): PathType {
		if (pathNode.type === 'function_call') {
			const funcNode = pathNode as FunctionCallNode;
			if (funcNode.functionName === 'find_in_parent_folders') {
				return 'find_in_parent_folders';
			}
		}

		if (pathNode.type === 'literal' && typeof pathNode.value === 'string') {
			const pathStr = pathNode.value;
			if (path.isAbsolute(pathStr)) {
				return 'absolute';
			}
			if (!pathStr.includes('/') && !pathStr.includes('\\')) {
				return 'current_dir';
			}
			return 'relative';
		}

		if (pathNode.type === 'variable_reference') {
			return 'variable';
		}

		return 'unknown';
	}

	/**
	 * Extract filename from path node
	 */
	private static extractFilename(pathNode: HCLNode): string | undefined {
		if (pathNode.type === 'function_call') {
			const funcNode = pathNode as FunctionCallNode;
			if (funcNode.functionName === 'find_in_parent_folders') {
				// Extract argument from find_in_parent_folders("filename.hcl")
				if (funcNode.arguments && funcNode.arguments.length > 0) {
					const arg = funcNode.arguments[0];
					if (arg.type === 'literal' && typeof arg.value === 'string') {
						return arg.value;
					}
				}
			}
		}

		if (pathNode.type === 'literal' && typeof pathNode.value === 'string') {
			const pathStr = pathNode.value;
			// Extract filename from path
			return path.basename(pathStr);
		}

		return undefined;
	}

	/**
	 * Resolve the file path for a read_terragrunt_config call
	 */
	static async resolvePath(
		call: ReadTerragruntConfigCall,
		currentFileUri: string
	): Promise<PathResolutionResult> {
		const currentPath = URI.parse(currentFileUri).fsPath;
		const currentDir = path.dirname(currentPath);

		switch (call.pathType) {
			case 'find_in_parent_folders':
				if (call.filename) {
					console.log(`[ReadTerragruntConfigService] Searching for "${call.filename}" in parent directories from: ${currentPath}`);
					const foundFile = await FileReader.findInParentDirs(currentPath, call.filename);
					if (foundFile) {
						console.log(`[ReadTerragruntConfigService] ✅ Found file: ${foundFile}`);
						return {
							uri: foundFile,
							source: `find_in_parent_folders("${call.filename}")`
						};
					} else {
						console.log(`[ReadTerragruntConfigService] ❌ File "${call.filename}" not found in parent directories`);
					}
				} else {
					console.log(`[ReadTerragruntConfigService] ❌ No filename extracted from path node`);
				}
				return { uri: null, source: 'not found' };

			case 'current_dir':
				if (call.filename) {
					const filePath = path.join(currentDir, call.filename);
					return {
						uri: URI.file(filePath).toString(),
						source: `current directory: ${call.filename}`
					};
				}
				return { uri: null, source: 'no filename' };

			case 'relative':
				if (call.pathValue.type === 'literal' && typeof call.pathValue.value === 'string') {
					const resolvedPath = path.resolve(currentDir, call.pathValue.value);
					return {
						uri: URI.file(resolvedPath).toString(),
						source: `relative path: ${call.pathValue.value}`
					};
				}
				return { uri: null, source: 'invalid relative path' };

			case 'absolute':
				if (call.pathValue.type === 'literal' && typeof call.pathValue.value === 'string') {
					return {
						uri: URI.file(call.pathValue.value).toString(),
						source: `absolute path: ${call.pathValue.value}`
					};
				}
				return { uri: null, source: 'invalid absolute path' };

			default:
				return { uri: null, source: 'unknown path type' };
		}
	}
}

