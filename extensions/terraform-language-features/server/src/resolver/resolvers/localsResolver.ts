/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseResolver } from './baseResolver';
import { ResolutionResult, ResolutionStep, ResolutionContext } from '../resolutionEngine';
import { HCLParser } from '../../parser/hclParser';
import { WorkspaceIndex } from '../../workspace/workspaceIndex';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { FileReader } from '../../utils/fileReader';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ValueExtractor } from '../../workspace/valueExtractor';

export class LocalsResolver extends BaseResolver {
	private parser: HCLParser;

	constructor(workspace: any, engine: any) {
		super(workspace, engine);
		this.parser = new HCLParser();
	}

	canResolve(expression: string): boolean {
		return expression.startsWith('local.');
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		console.log('[LocalsResolver] Resolving:', expression);
		const pathAfterLocal = expression.replace('local.', '');
		console.log('[LocalsResolver] Path after local.:', pathAfterLocal);

		const chain: ResolutionStep[] = [
			{ type: 'start', description: `Resolving ${expression}` }
		];

		// Check if this is a nested path like local.account_vars.locals.variable_name
		const pathParts = pathAfterLocal.split('.');
		if (pathParts.length > 1) {
			const firstPart = pathParts[0]; // e.g., "account_vars"
			const remainingPath = pathParts.slice(1).join('.'); // e.g., "locals.variable_name"

			console.log('[LocalsResolver] Detected nested path. First part:', firstPart, 'Remaining:', remainingPath);

			// Check if firstPart is a read_terragrunt_config result
			const includeCache = this.workspace.getIncludeCache();
			console.log('[LocalsResolver] Looking for read_terragrunt_config cache for:', firstPart, 'in file:', context.currentUri);
			const readConfigResult = includeCache.getReadTerragruntConfig(context.currentUri, firstPart);

			if (readConfigResult) {
				console.log('[LocalsResolver] ✅ Found read_terragrunt_config result for:', firstPart);
				console.log('[LocalsResolver] Cached config has:', {
					locals: Object.keys(readConfigResult.locals || {}),
					inputs: Object.keys(readConfigResult.inputs || {}),
					sourceUri: readConfigResult.sourceUri
				});
				console.log('[LocalsResolver] Resolving nested path:', remainingPath);

				// Resolve the nested path from the cached config
				const nestedValue = ValueExtractor.getNestedValue(readConfigResult, remainingPath);
				if (nestedValue !== null && nestedValue !== undefined) {
					console.log('[LocalsResolver] ✅ Found nested value:', JSON.stringify(nestedValue).substring(0, 200));
					console.log('[LocalsResolver] Value type:', typeof nestedValue, 'Is reference?', this.isReference(nestedValue));

					chain.push({
						type: 'found-in-read-config',
						description: `Found in read_terragrunt_config("${firstPart}") -> ${remainingPath}`,
						location: {
							uri: readConfigResult.sourceUri,
							line: 0,
							character: 0
						}
					});

					// Always try to resolve references, even if the value looks resolved
					// The value might be a string reference like "local.another_var" that needs resolution
					if (this.isReference(nestedValue)) {
						console.log('[LocalsResolver] Value is a reference, resolving chain:', nestedValue);

						// Create a context for resolving - use the read_terragrunt_config file as base
						// This allows resolving references within that file and its includes
						const nestedContext: ResolutionContext = {
							currentUri: readConfigResult.sourceUri,
							resolutionStack: context.resolutionStack || []
						};

						// Prevent infinite recursion
						const resolutionKey = `${readConfigResult.sourceUri}:${nestedValue}`;
						if (nestedContext.resolutionStack!.includes(resolutionKey)) {
							console.log('[LocalsResolver] ⚠️ Circular reference detected:', resolutionKey);
							return {
								value: `[Circular: ${nestedValue}]`,
								source: readConfigResult.sourceUri,
								chain,
								confidence: 'unknown',
								resolvedPath: readConfigResult.resolvedPath
							};
						}

						nestedContext.resolutionStack!.push(resolutionKey);

						// Recursively resolve the reference using the resolution engine
						// This will handle cross-file references, includes, etc.
						const nestedResult = await this.engine.resolve(nestedValue, nestedContext);

						console.log('[LocalsResolver] Resolved reference result:', JSON.stringify(nestedResult.value).substring(0, 200));

						// Merge chains - add the resolution steps
						chain.push({
							type: 'resolved-reference-chain',
							description: `Resolved reference chain: ${nestedValue}`,
							location: {
								uri: readConfigResult.sourceUri,
								line: 0,
								character: 0
							}
						});
						chain.push(...nestedResult.chain);

						return {
							value: nestedResult.value,
							source: nestedResult.source || readConfigResult.sourceUri,
							chain,
							confidence: nestedResult.confidence,
							resolvedPath: nestedResult.resolvedPath || readConfigResult.resolvedPath
						};
					}

					// Check if value is an object/array that might contain references
					if (typeof nestedValue === 'object' && nestedValue !== null) {
						// Check if any nested property is a reference
						const hasNestedReference = this.hasNestedReference(nestedValue);
						if (hasNestedReference) {
							console.log('[LocalsResolver] Value contains nested references, resolving recursively...');

							// Create proper context for resolving nested references
							// Use the read_terragrunt_config file as the base URI
							const nestedContext: ResolutionContext = {
								currentUri: readConfigResult.sourceUri,
								resolutionStack: context.resolutionStack || []
							};

							const resolvedValue = await this.resolveNestedReferences(nestedValue, readConfigResult.sourceUri, nestedContext);
							console.log('[LocalsResolver] Resolved nested references result:', JSON.stringify(resolvedValue).substring(0, 200));

							chain.push({
								type: 'resolved-nested-references',
								description: `Resolved nested references in ${remainingPath}`,
								location: {
									uri: readConfigResult.sourceUri,
									line: 0,
									character: 0
								}
							});

							return {
								value: resolvedValue,
								source: readConfigResult.sourceUri,
								chain,
								confidence: 'exact',
								resolvedPath: readConfigResult.resolvedPath
							};
						}
					}

					// Value is already resolved (no references found), return it
					console.log('[LocalsResolver] Value is fully resolved, returning:', JSON.stringify(nestedValue).substring(0, 200));
					return {
						value: nestedValue,
						source: readConfigResult.sourceUri,
						chain,
						confidence: 'exact',
						resolvedPath: readConfigResult.resolvedPath
					};
				} else {
					console.log('[LocalsResolver] ❌ Nested path not found in read_terragrunt_config result');
					console.log('[LocalsResolver] Available paths in cached config:', {
						locals: Object.keys(readConfigResult.locals || {}),
						inputs: Object.keys(readConfigResult.inputs || {})
					});
				}
			}
		}

		// If not a nested path or not found in read_terragrunt_config, treat as simple local name
		const localName = pathAfterLocal.split('.')[0];
		console.log('[LocalsResolver] Looking for local name:', localName);

		// 1. Check current file for locals {} block
		console.log('[LocalsResolver] Checking current file:', context.currentUri);
		const currentFileLocals = await this.findLocalsInFile(context.currentUri);
		console.log('[LocalsResolver] Found locals in current file:', Object.keys(currentFileLocals));

		if (currentFileLocals[localName]) {
			console.log('[LocalsResolver] ✅ Found in current file!', currentFileLocals[localName]);

			// Check if this local is a read_terragrunt_config result
			const includeCache = this.workspace.getIncludeCache();
			const readConfigResult = includeCache.getReadTerragruntConfig(context.currentUri, localName);

			if (readConfigResult) {
				console.log('[LocalsResolver] ✅ Local is a read_terragrunt_config result, returning cached config');
				chain.push({
					type: 'found-in-read-config',
					description: `Found read_terragrunt_config("${localName}")`,
					location: {
						uri: context.currentUri,
						line: currentFileLocals[localName].line || 0,
						character: 0
					}
				});
				// Return the entire config object (same structure as ExtractedValues)
				return {
					value: {
						locals: readConfigResult.locals || {},
						inputs: readConfigResult.inputs || {},
						variables: readConfigResult.variables || {},
						attributes: readConfigResult.attributes || {}
					},
					source: readConfigResult.sourceUri,
					chain,
					confidence: 'exact',
					resolvedPath: readConfigResult.resolvedPath
				};
			}

			// Not a read_terragrunt_config, return the value as-is
			chain.push({
				type: 'found-in-current-file',
				description: `Found in ${context.currentUri}`,
				location: {
					uri: context.currentUri,
					line: currentFileLocals[localName].line || 0,
					character: 0
				}
			});
			return {
				value: currentFileLocals[localName].value,
				source: context.currentUri,
				chain,
				confidence: 'exact'
			};
		}

		// 2. Check for locals.hcl in same directory
		const localsHclPath = this.findLocalsHcl(context.currentUri);
		if (localsHclPath) {
			const localValue = await this.findLocalInLocalsHcl(localsHclPath, localName);

			if (localValue) {
				chain.push({
					type: 'found-in-locals-hcl',
					description: `Found in ${localsHclPath}`,
					location: {
						uri: localsHclPath,
						line: localValue.line || 0,
						character: 0
					}
				});

				// Value might reference another local - recurse
				if (this.isReference(localValue.value)) {
					const nestedContext = { ...context, currentUri: localsHclPath };
					const nestedResult = await this.engine.resolve(
						localValue.value,
						nestedContext
					);
					chain.push(...nestedResult.chain);
					return { ...nestedResult, chain };
				}

				return {
					value: localValue.value,
					source: localsHclPath,
					chain,
					confidence: 'exact'
				};
			}
		}

		// 3. Check cached include values
		const includeCache = this.workspace.getIncludeCache();
		const allIncludes = includeCache.getAllIncludedValues(context.currentUri);
		console.log(`[LocalsResolver] Checking ${allIncludes.length} cached include(s)`);

		for (const cachedInclude of allIncludes) {
			const includeValue = ValueExtractor.getNestedValue(cachedInclude, `locals.${localName}`);
			if (includeValue !== null && includeValue !== undefined) {
				console.log(`[LocalsResolver] ✅ Found value in cached include from ${cachedInclude.sourceUri}:`, includeValue);
				chain.push({
					type: 'found-in-cached-include',
					description: `Found in cached include: ${cachedInclude.sourceUri}`,
					location: {
						uri: cachedInclude.sourceUri,
						line: 0,
						character: 0
					}
				});
				return {
					value: includeValue,
					source: cachedInclude.sourceUri,
					chain,
					confidence: 'exact'
				};
			}
		}

		// 4. Check parent directories (for Terragrunt)
		const parentLocals = await this.findInParentDirs(localName, context);
		if (parentLocals && parentLocals.confidence !== 'unknown') {
			chain.push(...parentLocals.chain);
			return { ...parentLocals, chain };
		}

		return {
			value: null,
			source: 'unknown',
			chain,
			confidence: 'unknown'
		};
	}

	private async findLocalsInFile(uri: string): Promise<Record<string, { value: any; line?: number }>> {
		console.log('[LocalsResolver] findLocalsInFile called for:', uri);
		const index = this.workspace.getIndex();
		const ast = index.getDocumentAST(uri);

		if (!ast) {
			console.log('[LocalsResolver] No AST found for file');
			return {};
		}

		console.log('[LocalsResolver] AST has', ast.length, 'nodes');
		const locals: Record<string, { value: any; line?: number }> = {};

		// Find locals blocks in AST
		for (const node of ast) {
			console.log('[LocalsResolver] Checking node type:', node.type, 'blockType:', (node as any).blockType);

			if (node.type === 'block' && (node as any).blockType === 'locals') {
				console.log('[LocalsResolver] Found locals block!');
				// Extract attributes from locals block
				if ((node as any).children) {
					console.log('[LocalsResolver] Block has', (node as any).children.length, 'children');
					for (const child of (node as any).children) {
						console.log('[LocalsResolver] Child type:', child.type, 'name:', (child as any).attributeName);
						if (child.type === 'attribute') {
							const attrName = (child as any).attributeName || '';
							locals[attrName] = {
								value: (child as any).value?.value,
								line: (child as any).range?.start?.line
							};
							console.log('[LocalsResolver] Added local:', attrName, '=', locals[attrName].value);
						}
					}
				}
			}
		}

		console.log('[LocalsResolver] Total locals found:', Object.keys(locals));
		return locals;
	}

	private findLocalsHcl(currentUri: string): string | null {
		const currentPath = URI.parse(currentUri).fsPath;
		const dir = path.dirname(currentPath);
		const localsHclPath = path.join(dir, 'locals.hcl');
		// In real implementation, check if file exists
		return URI.file(localsHclPath).toString();
	}

	private async findLocalInLocalsHcl(localsHclPath: string, localName: string): Promise<{ value: any; line?: number } | null> {
		console.log('[LocalsResolver] findLocalInLocalsHcl called for:', localsHclPath, 'looking for:', localName);
		const index = this.workspace.getIndex();
		let ast = index.getDocumentAST(localsHclPath);

		// If AST not in cache, try to read file from disk
		if (!ast) {
			console.log('[LocalsResolver] AST not in cache, reading file from disk:', localsHclPath);
			const content = await FileReader.readFile(localsHclPath);
			if (content) {
				console.log('[LocalsResolver] File read successfully, length:', content.length);
				// Parse the file
				const document = TextDocument.create(localsHclPath, 'terragrunt', 1, content);
				ast = await this.parser.parse(document);
				// Store in index for future use
				this.workspace.updateDocument(localsHclPath, ast);
				console.log('[LocalsResolver] Parsed and cached file from disk, nodes:', ast.length);
			} else {
				console.log('[LocalsResolver] File does not exist or could not be read:', localsHclPath);
				return null;
			}
		} else {
			console.log('[LocalsResolver] AST found in cache, nodes:', ast.length);
		}

		// Find the local in locals.hcl
		for (const node of ast) {
			if (node.type === 'block' && node.blockType === 'locals') {
				if (node.children) {
					for (const child of node.children) {
						if (child.type === 'attribute' && child.attributeName === localName) {
							return {
								value: child.value?.value,
								line: child.range.start.line
							};
						}
					}
				}
			}
		}

		return null;
	}

	private isReference(value: any): boolean {
		if (typeof value === 'string') {
			return /^(var|local|module|data|dependency|include)\./.test(value);
		}
		return false;
	}

	/**
	 * Check if an object/array contains any nested references
	 */
	private hasNestedReference(obj: any, visited: Set<any> = new Set()): boolean {
		if (obj === null || obj === undefined) {
			return false;
		}

		// Prevent circular reference detection
		if (typeof obj === 'object' && visited.has(obj)) {
			return false;
		}
		visited.add(obj);

		if (Array.isArray(obj)) {
			return obj.some(item => this.isReference(item) || this.hasNestedReference(item, visited));
		}

		if (typeof obj === 'object') {
			for (const value of Object.values(obj)) {
				if (this.isReference(value)) {
					return true;
				}
				if (typeof value === 'object' && this.hasNestedReference(value, visited)) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Recursively resolve nested references in an object/array
	 */
	private async resolveNestedReferences(obj: any, sourceUri: string, context: ResolutionContext, visited: Set<any> = new Set()): Promise<any> {
		if (obj === null || obj === undefined) {
			return obj;
		}

		// Prevent circular reference
		if (typeof obj === 'object' && visited.has(obj)) {
			return obj;
		}
		visited.add(obj);

		if (this.isReference(obj)) {
			console.log('[LocalsResolver] Resolving nested reference:', obj, 'in context:', sourceUri);

			// Use the provided context, but ensure currentUri is set correctly
			const nestedContext: ResolutionContext = {
				currentUri: sourceUri,
				resolutionStack: context.resolutionStack || []
			};

			// Prevent infinite recursion
			const resolutionKey = `${sourceUri}:${obj}`;
			if (nestedContext.resolutionStack!.includes(resolutionKey)) {
				console.log('[LocalsResolver] ⚠️ Circular reference in nested resolution:', resolutionKey);
				return `[Circular: ${obj}]`;
			}

			nestedContext.resolutionStack!.push(resolutionKey);

			const result = await this.engine.resolve(obj, nestedContext);
			console.log('[LocalsResolver] Resolved nested reference result:', JSON.stringify(result.value).substring(0, 100));
			return result.value;
		}

		if (Array.isArray(obj)) {
			return Promise.all(obj.map(item => this.resolveNestedReferences(item, sourceUri, context, visited)));
		}

		if (typeof obj === 'object') {
			const resolved: Record<string, any> = {};
			for (const [key, value] of Object.entries(obj)) {
				resolved[key] = await this.resolveNestedReferences(value, sourceUri, context, visited);
			}
			return resolved;
		}

		return obj;
	}

	private async findInParentDirs(localName: string, context: ResolutionContext): Promise<ResolutionResult | null> {
		console.log('[LocalsResolver] Searching parent directories for:', localName);
		console.log('[LocalsResolver] Starting from:', context.currentUri);

		// For Terragrunt, check parent directories for locals.hcl and terragrunt.hcl
		const currentPath = URI.parse(context.currentUri).fsPath;
		console.log('[LocalsResolver] Current file path:', currentPath);

		// Also check terragrunt.hcl files in parent directories (they can have locals blocks)
		const filesToCheck = ['locals.hcl', 'terragrunt.hcl'];

		// Use FileReader to find files in parent directories
		for (const fileName of filesToCheck) {
			console.log('[LocalsResolver] Looking for', fileName, 'in parent directories...');
			const foundFile = await FileReader.findInParentDirs(currentPath, fileName);
			if (foundFile) {
				console.log('[LocalsResolver] ✅ Found file in parent:', foundFile);

				// Check locals.hcl first
				if (fileName === 'locals.hcl') {
					const localValue = await this.findLocalInLocalsHcl(foundFile, localName);
					if (localValue) {
						console.log('[LocalsResolver] ✅ Found local in locals.hcl:', localValue);
						return {
							value: localValue.value,
							source: foundFile,
							chain: [{
								type: 'found-in-parent',
								description: `Found in parent directory: ${foundFile}`,
								location: {
									uri: foundFile,
									line: localValue.line || 0,
									character: 0
								}
							}],
							confidence: 'exact'
						};
					} else {
						console.log('[LocalsResolver] Local not found in locals.hcl');
					}
				} else if (fileName === 'terragrunt.hcl') {
					// Check for locals block in terragrunt.hcl
					console.log('[LocalsResolver] Checking terragrunt.hcl for locals block...');
					const localsInFile = await this.findLocalsInFile(foundFile);
					console.log('[LocalsResolver] Found locals in terragrunt.hcl:', Object.keys(localsInFile));
					if (localsInFile[localName]) {
						console.log('[LocalsResolver] ✅ Found local in terragrunt.hcl:', localsInFile[localName]);
						return {
							value: localsInFile[localName].value,
							source: foundFile,
							chain: [{
								type: 'found-in-parent-terragrunt',
								description: `Found in parent terragrunt.hcl: ${foundFile}`,
								location: {
									uri: foundFile,
									line: localsInFile[localName].line || 0,
									character: 0
								}
							}],
							confidence: 'exact'
						};
					} else {
						console.log('[LocalsResolver] Local not found in terragrunt.hcl locals block');
					}
				}
			} else {
				console.log('[LocalsResolver] ❌', fileName, 'not found in parent directories');
			}
		}

		console.log('[LocalsResolver] ❌ Not found in any parent directories');
		return null;
	}
}

