/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseResolver } from './baseResolver';
import { ResolutionResult, ResolutionStep, ResolutionContext } from '../resolutionEngine';
import { WorkspaceIndex } from '../../workspace/workspaceIndex';
import { FileReader } from '../../utils/fileReader';
import { HCLParser } from '../../parser/hclParser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ValueExtractor } from '../../workspace/valueExtractor';

export class InputsResolver extends BaseResolver {
	private parser: HCLParser;

	constructor(workspace: any, engine: any) {
		super(workspace, engine);
		this.parser = new HCLParser();
	}

	canResolve(expression: string): boolean {
		// Handle inputs.* expressions (from terragrunt.hcl inputs blocks)
		return expression.startsWith('inputs.');
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		console.log('[InputsResolver] Resolving:', expression);
		const inputPath = expression.replace('inputs.', '');
		console.log('[InputsResolver] Looking for input path:', inputPath);

		const chain: ResolutionStep[] = [
			{ type: 'start', description: `Resolving ${expression}` }
		];

		// 1. Check current file first
		const inputs = await this.findInputsInFile(context.currentUri);
		console.log('[InputsResolver] Found inputs in current file:', Object.keys(inputs));

		const value = this.getNestedValue(inputs, inputPath);
		if (value !== undefined) {
			console.log('[InputsResolver] ✅ Found value in current file:', value);
			return {
				value: value,
				source: context.currentUri,
				chain: [{
					type: 'found-in-inputs',
					description: `Found in inputs block: ${context.currentUri}`,
					location: {
						uri: context.currentUri,
						line: 0,
						character: 0
					}
				}],
				confidence: 'exact'
			};
		}

		// 2. Check cached include values
		const includeCache = this.workspace.getIncludeCache();
		const allIncludes = includeCache.getAllIncludedValues(context.currentUri);
		console.log(`[InputsResolver] Checking ${allIncludes.length} cached include(s)`);

		for (const cachedInclude of allIncludes) {
			const includeValue = ValueExtractor.getNestedValue(cachedInclude, `inputs.${inputPath}`);
			if (includeValue !== null && includeValue !== undefined) {
				console.log(`[InputsResolver] ✅ Found value in cached include from ${cachedInclude.sourceUri}:`, includeValue);
				return {
					value: includeValue,
					source: cachedInclude.sourceUri,
					chain: [{
						type: 'found-in-cached-include',
						description: `Found in cached include: ${cachedInclude.sourceUri}`,
						location: {
							uri: cachedInclude.sourceUri,
							line: 0,
							character: 0
						}
					}],
					confidence: 'exact'
				};
			}
		}

		console.log('[InputsResolver] ❌ Input not found in current file or cached includes');
		return this.unknownResult();
	}

	private async findInputsInFile(uri: string): Promise<Record<string, any>> {
		console.log('[InputsResolver] findInputsInFile called for:', uri);
		const index = this.workspace.getIndex();
		let ast = index.getDocumentAST(uri);

		// If AST not in cache, read from disk
		if (!ast) {
			console.log('[InputsResolver] AST not in cache, reading from disk');
			const content = await FileReader.readFile(uri);
			if (content) {
				const document = TextDocument.create(uri, 'terragrunt', 1, content);
				ast = await this.parser.parse(document);
				this.workspace.updateDocument(uri, ast);
				console.log('[InputsResolver] Parsed file, nodes:', ast.length);
			} else {
				console.log('[InputsResolver] File not found');
				return {};
			}
		}

		const inputs: Record<string, any> = {};

		// Find inputs block in AST
		for (const node of ast) {
			if (node.type === 'block' && (node as any).blockType === 'inputs') {
				console.log('[InputsResolver] Found inputs block');
				if ((node as any).children) {
					for (const child of (node as any).children) {
						if (child.type === 'attribute') {
							const attrName = (child as any).attributeName || '';
							const attrValue = (child as any).value?.value;
							inputs[attrName] = attrValue;
							console.log('[InputsResolver] Added input:', attrName, '=', attrValue);
						}
					}
				}
			}
		}

		return inputs;
	}

	private getNestedValue(obj: Record<string, any>, path: string): any {
		const parts = path.split('.');
		let current = obj;

		for (const part of parts) {
			if (current && typeof current === 'object' && part in current) {
				current = current[part];
			} else {
				return undefined;
			}
		}

		return current;
	}
}

