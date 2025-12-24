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
		const localName = expression.replace('local.', '');
		console.log('[LocalsResolver] Looking for local name:', localName);

		const chain: ResolutionStep[] = [
			{ type: 'start', description: `Resolving ${expression}` }
		];

		// 1. Check current file for locals {} block
		console.log('[LocalsResolver] Checking current file:', context.currentUri);
		const currentFileLocals = await this.findLocalsInFile(context.currentUri);
		console.log('[LocalsResolver] Found locals in current file:', Object.keys(currentFileLocals));

		if (currentFileLocals[localName]) {
			console.log('[LocalsResolver] ✅ Found in current file!', currentFileLocals[localName]);
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

