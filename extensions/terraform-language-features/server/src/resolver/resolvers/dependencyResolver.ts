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

export class DependencyResolver extends BaseResolver {
	private parser: HCLParser;

	constructor(workspace: any, engine: any) {
		super(workspace, engine);
		this.parser = new HCLParser();
	}

	canResolve(expression: string): boolean {
		return /^dependency\.\w+\.outputs\.\w+/.test(expression);
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		console.log('[DependencyResolver] Resolving:', expression);
		// Parse: dependency.<name>.outputs.<output>
		const match = expression.match(/^dependency\.(\w+)\.outputs\.(\w+)/);
		if (!match) {
			console.log('[DependencyResolver] Expression does not match pattern');
			return this.unknownResult();
		}

		const [, dependencyName, outputName] = match;
		console.log('[DependencyResolver] Dependency name:', dependencyName, 'Output:', outputName);
		const chain: ResolutionStep[] = [
			{ type: 'start', description: `Resolving dependency ${dependencyName}` }
		];

		// 1. Find dependency block in terragrunt.hcl
		console.log('[DependencyResolver] Looking for dependency block in:', context.currentUri);
		const dependencyBlock = await this.findDependencyBlock(
			context.currentUri,
			dependencyName
		);

		if (!dependencyBlock) {
			console.log('[DependencyResolver] ❌ Dependency block not found');
			return this.unknownResult();
		}

		console.log('[DependencyResolver] ✅ Found dependency block, config_path:', dependencyBlock.configPath);

		chain.push({
			type: 'found-dependency-block',
			description: `Found dependency block for ${dependencyName}`,
			location: {
				uri: context.currentUri,
				line: dependencyBlock.line || 0,
				character: 0
			}
		});

		// 2. Get config_path from dependency block
		const configPath = dependencyBlock.configPath;
		if (!configPath) {
			return this.unknownResult();
		}

		const absolutePath = this.resolvePath(context.currentUri, configPath);
		chain.push({
			type: 'resolved-dependency-path',
			description: `Dependency module at ${absolutePath}`
		});

		// 3. Load Terraform state (mocked for now)
		const stateOutputs = await this.loadMockState(absolutePath);
		const outputValue = stateOutputs[outputName];

		if (outputValue !== undefined) {
			chain.push({
				type: 'found-in-state',
				description: `Found output ${outputName} in state`
			});
			return {
				value: outputValue,
				source: `${absolutePath}/terraform.tfstate`,
				chain,
				confidence: 'exact'
			};
		}

		// 4. Fallback: Parse outputs.tf in dependency module
		const outputsFile = `${absolutePath}/outputs.tf`;
		const outputDefinition = await this.findOutputDefinition(
			outputsFile,
			outputName
		);

		if (outputDefinition) {
			chain.push({
				type: 'found-output-definition',
				description: `Found output definition in ${outputsFile}`,
				location: {
					uri: outputsFile,
					line: outputDefinition.line || 0,
					character: 0
				}
			});

			return {
				value: outputDefinition.value,
				source: outputsFile,
				chain,
				confidence: 'inferred'
			};
		}

		return this.unknownResult();
	}

	private async findDependencyBlock(uri: string, dependencyName: string): Promise<{ configPath?: string; line?: number } | null> {
		console.log('[DependencyResolver] findDependencyBlock: looking for', dependencyName, 'in', uri);
		const index = this.workspace.getIndex();
		let ast = index.getDocumentAST(uri);

		// If AST not in cache, read from disk
		if (!ast) {
			console.log('[DependencyResolver] AST not in cache, reading from disk');
			const content = await FileReader.readFile(uri);
			if (content) {
				const document = TextDocument.create(uri, 'terragrunt', 1, content);
				ast = await this.parser.parse(document);
				this.workspace.updateDocument(uri, ast);
				console.log('[DependencyResolver] Parsed file, nodes:', ast.length);
			} else {
				console.log('[DependencyResolver] File not found');
				return null;
			}
		}

		// Find dependency block with matching name
		// In Terragrunt, dependency blocks have labels: dependency "vpc" {}
		for (const node of ast) {
			console.log('[DependencyResolver] Checking node:', node.type, 'blockType:', (node as any).blockType, 'name:', (node as any).name);

			if (node.type === 'block' && (node as any).blockType === 'dependency') {
				// Check if the block label matches dependencyName
				const blockName = (node as any).name || (node as any).labels?.[0];
				console.log('[DependencyResolver] Dependency block found, name:', blockName, 'looking for:', dependencyName);

				if (blockName === dependencyName) {
					let configPath: string | undefined;
					let line: number | undefined;

					if ((node as any).children) {
						for (const child of (node as any).children) {
							if (child.type === 'attribute' && (child as any).attributeName === 'config_path') {
								configPath = (child as any).value?.value;
								line = (child as any).range?.start?.line;
								console.log('[DependencyResolver] Found config_path:', configPath);
							}
						}
					}

					return { configPath, line };
				}
			}
		}

		console.log('[DependencyResolver] ❌ Dependency block not found');
		return null;
	}

	private resolvePath(currentUri: string, relativePath: string): string {
		const currentFileUri = URI.parse(currentUri);
		const currentDirPath = path.dirname(currentFileUri.fsPath);
		const resolvedPath = path.resolve(currentDirPath, relativePath);
		return URI.file(resolvedPath).toString();
	}

	private async loadMockState(modulePath: string): Promise<Record<string, any>> {
		// Phase 4: Return mock data
		// Future: Parse actual terraform.tfstate or use terraform show -json
		return {
			vpc_id: 'vpc-123456',
			subnet_ids: ['subnet-1', 'subnet-2'],
			instance_id: 'i-1234567890abcdef0'
		};
	}

	private async findOutputDefinition(outputsFile: string, outputName: string): Promise<{ value: any; line?: number } | null> {
		const index = this.workspace.getIndex();
		const ast = index.getDocumentAST(outputsFile);

		if (!ast) {
			return null;
		}

		// Find output block with matching name
		for (const node of ast) {
			if (node.type === 'block' && node.blockType === 'output' && node.name === outputName) {
				let value: any;
				let line: number | undefined;

				if (node.children) {
					for (const child of node.children) {
						if (child.type === 'attribute' && child.attributeName === 'value') {
							value = child.value?.value;
							line = child.range.start.line;
						}
					}
				}

				return { value, line };
			}
		}

		return null;
	}
}

