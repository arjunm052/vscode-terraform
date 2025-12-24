/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseResolver } from './baseResolver';
import { ResolutionResult, ResolutionStep, ResolutionContext } from '../resolutionEngine';
import { URI } from 'vscode-uri';
import * as path from 'path';

export class FunctionResolver extends BaseResolver {
	canResolve(expression: string): boolean {
		// Check if expression contains Terragrunt function calls
		return /find_in_parent_folders|read_terragrunt_config/.test(expression);
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		const chain: ResolutionStep[] = [
			{ type: 'start', description: `Resolving function call: ${expression}` }
		];

		// Handle find_in_parent_folders()
		if (expression.includes('find_in_parent_folders')) {
			const parentPath = await this.findInParentFolders(context.currentUri);
			if (parentPath) {
				chain.push({
					type: 'found-parent-folder',
					description: `Found parent config at ${parentPath}`
				});
				return {
					value: parentPath,
					source: parentPath,
					chain,
					confidence: 'exact'
				};
			}
		}

		// Handle read_terragrunt_config()
		if (expression.includes('read_terragrunt_config')) {
			const configMatch = expression.match(/read_terragrunt_config\(["']([^"']+)["']\)/);
			if (configMatch) {
				const configPath = configMatch[1];
				const absolutePath = this.resolvePath(context.currentUri, configPath);
				chain.push({
					type: 'read-config',
					description: `Reading config from ${absolutePath}`
				});
				return {
					value: absolutePath,
					source: absolutePath,
					chain,
					confidence: 'exact'
				};
			}
		}

		return {
			value: null,
			source: 'unknown',
			chain,
			confidence: 'unknown'
		};
	}

	private async findInParentFolders(currentUri: string): Promise<string | null> {
		const uri = URI.parse(currentUri);
		let currentDirPath = path.dirname(uri.fsPath);

		// Traverse up to find terragrunt.hcl
		for (let i = 0; i < 10; i++) {
			const terragruntHclPath = path.join(currentDirPath, 'terragrunt.hcl');
			// In real implementation, check if file exists
			// For now, return first parent found
			return URI.file(terragruntHclPath).toString();

			// Move up one directory
			const parentDirPath = path.dirname(currentDirPath);
			if (parentDirPath === currentDirPath) {
				break; // Reached root
			}
			currentDirPath = parentDirPath;
		}

		return null;
	}

	private resolvePath(currentUri: string, relativePath: string): string {
		const currentFileUri = URI.parse(currentUri);
		const currentDirPath = path.dirname(currentFileUri.fsPath);
		const resolvedPath = path.resolve(currentDirPath, relativePath);
		return URI.file(resolvedPath).toString();
	}
}

