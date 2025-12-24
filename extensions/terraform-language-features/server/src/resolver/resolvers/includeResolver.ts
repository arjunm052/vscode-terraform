/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseResolver } from './baseResolver';
import { ResolutionResult, ResolutionStep, ResolutionContext } from '../resolutionEngine';
import { WorkspaceIndex } from '../../workspace/workspaceIndex';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { FileReader } from '../../utils/fileReader';
import { HCLParser } from '../../parser/hclParser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ValueExtractor } from '../../workspace/valueExtractor';

export class IncludeResolver extends BaseResolver {
	private parser: HCLParser;

	constructor(workspace: any, engine: any) {
		super(workspace, engine);
		this.parser = new HCLParser();
	}

	canResolve(expression: string): boolean {
		return expression.startsWith('include.');
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		console.log('[IncludeResolver] Resolving:', expression);
		console.log('[IncludeResolver] Full expression:', JSON.stringify(expression));

		// Parse: include.<block_name>.<block_type>.<attribute_path>
		// Example: include.account_vars.locals.account_tags
		const match = expression.match(/^include\.(\w+)\.(\w+)\.(.+)/);
		if (!match) {
			console.log('[IncludeResolver] Expression does not match pattern include.name.type.path');
			console.log('[IncludeResolver] Expected format: include.<block_name>.<block_type>.<attribute_path>');
			console.log('[IncludeResolver] Got:', expression);
			return this.unknownResult();
		}

		const [, blockName, blockType, attributePath] = match;
		console.log('[IncludeResolver] Block name:', blockName, 'Block type:', blockType, 'Attribute path:', attributePath);

		const chain: ResolutionStep[] = [];

		// 1. Get cached include values
		const includeCache = this.workspace.getIncludeCache();
		const cachedValues = includeCache.getIncludeValues(context.currentUri, blockName);

		if (!cachedValues) {
			console.log(`[IncludeResolver] ❌ No cached values found for include "${blockName}"`);
			return this.unknownResult();
		}

		console.log(`[IncludeResolver] ✅ Found cached values for include "${blockName}" from ${cachedValues.sourceUri}`);
		console.log(`[IncludeResolver] Cached values structure:`, JSON.stringify({
			locals: Object.keys(cachedValues.locals || {}),
			inputs: Object.keys(cachedValues.inputs || {}),
			variables: Object.keys(cachedValues.variables || {}),
			attributes: Object.keys(cachedValues.attributes || {})
		}));

		chain.push({
			type: 'found-cached-include',
			description: `Found cached include "${blockName}"`,
			location: {
				uri: cachedValues.sourceUri,
				line: 0,
				character: 0
			}
		});

		// 2. Navigate to the value using blockType and attributePath
		// e.g., cachedValues.locals.account_tags or cachedValues.inputs.region
		const fullPath = `${blockType}.${attributePath}`;
		console.log(`[IncludeResolver] Looking for path: ${fullPath}`);
		console.log(`[IncludeResolver] Available in ${blockType}:`, Object.keys(cachedValues[blockType] || {}));

		const value = ValueExtractor.getNestedValue(cachedValues, fullPath);

		if (value === null || value === undefined) {
			console.log(`[IncludeResolver] ❌ Could not find value at path: ${fullPath}`);
			console.log(`[IncludeResolver] Full cached values:`, JSON.stringify(cachedValues, null, 2).substring(0, 500));
			return this.unknownResult();
		}

		console.log(`[IncludeResolver] ✅ Resolved value:`, JSON.stringify(value).substring(0, 100));

		chain.push({
			type: 'resolved-value',
			description: `Resolved ${fullPath} from ${cachedValues.sourceUri}`,
			location: {
				uri: cachedValues.sourceUri,
				line: 0,
				character: 0
			}
		});

		return {
			value,
			source: cachedValues.sourceUri,
			resolvedPath: cachedValues.resolvedPath,
			chain,
			confidence: 'exact'
		};
	}

	private async findIncludeBlock(uri: string, includeName: string): Promise<{ path?: string; line?: number } | null> {
		const index = this.workspace.getIndex();
		let ast = index.getDocumentAST(uri);

		// If AST not in cache, read from disk
		if (!ast) {
			const content = await FileReader.readFile(uri);
			if (content) {
				const document = TextDocument.create(uri, 'terragrunt', 1, content);
				ast = await this.parser.parse(document);
				this.workspace.updateDocument(uri, ast);
			} else {
				return null;
			}
		}

		// Find include block with matching name (or default "root")
		for (const node of ast) {
			if (node.type === 'block' && node.blockType === 'include') {
				// Check if this is the right include block
				// In Terragrunt, includes are usually unnamed, so we check by position or use "root" as default
				let path: string | undefined;
				let line: number | undefined;

				if (node.children) {
					for (const child of node.children) {
						if (child.type === 'attribute' && child.attributeName === 'path') {
							path = child.value?.value;
							line = child.range.start.line;
						}
					}
				}

				// For now, return first include block found
				// In real implementation, would match by name or position
				return { path, line };
			}
		}

		return null;
	}

	private async resolveParentPath(includeBlock: { path?: string }, context: ResolutionContext): Promise<string> {
		const currentPath = URI.parse(context.currentUri).fsPath;

		if (includeBlock.path) {
			// Use explicit path from include block (e.g., path = find_in_parent_folders())
			// For now, resolve relative to current file's directory
			const currentDir = path.dirname(currentPath);
			const resolvedPath = path.resolve(currentDir, includeBlock.path);
			return URI.file(resolvedPath).toString();
		}

		// Default: use find_in_parent_folders() logic
		// Find terragrunt.hcl in parent directories
		const parentTerragrunt = await FileReader.findInParentDirs(currentPath, 'terragrunt.hcl');

		if (parentTerragrunt) {
			return parentTerragrunt;
		}

		// Fallback: return current file's parent directory
		return URI.file(path.dirname(currentPath)).toString();
	}
}

