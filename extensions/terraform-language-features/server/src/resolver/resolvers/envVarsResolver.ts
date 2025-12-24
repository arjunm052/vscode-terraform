/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseResolver } from './baseResolver';
import { ResolutionResult, ResolutionStep, ResolutionContext } from '../resolutionEngine';
import { URI } from 'vscode-uri';
import * as path from 'path';

export class EnvVarsResolver extends BaseResolver {
	canResolve(expression: string): boolean {
		return /^local\.env_vars\./.test(expression);
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		// Parse: local.env_vars.<key>
		const match = expression.match(/^local\.env_vars\.(.+)/);
		if (!match) {
			return this.unknownResult();
		}

		const envKey = match[1];
		const chain: ResolutionStep[] = [
			{ type: 'start', description: `Resolving env var ${envKey}` }
		];

		// Look for env.yaml or env.json in same directory or parent directories
		const envFile = await this.findEnvFile(context.currentUri);
		if (envFile) {
			const envValue = await this.loadEnvValue(envFile, envKey);
			if (envValue !== null) {
				chain.push({
					type: 'found-in-env-file',
					description: `Found in ${envFile}`,
					location: {
						uri: envFile,
						line: 0,
						character: 0
					}
				});
				return {
					value: envValue,
					source: envFile,
					chain,
					confidence: 'exact'
				};
			}
		}

		// Fallback: check actual environment variables
		const envValue = process.env[envKey];
		if (envValue !== undefined) {
			chain.push({
				type: 'found-in-environment',
				description: `Found in process environment`
			});
			return {
				value: envValue,
				source: 'process.env',
				chain,
				confidence: 'exact'
			};
		}

		return {
			value: null,
			source: 'unknown',
			chain,
			confidence: 'unknown'
		};
	}

	private async findEnvFile(currentUri: string): Promise<string | null> {
		const uri = URI.parse(currentUri);
		const dirPath = path.dirname(uri.fsPath);

		// Check for env.yaml or env.json in same directory
		const envYamlPath = path.join(dirPath, 'env.yaml');
		const envJsonPath = path.join(dirPath, 'env.json');

		// In real implementation, check if files exist
		// For now, return env.yaml as default
		return URI.file(envYamlPath).toString();
	}

	private async loadEnvValue(envFile: string, key: string): Promise<any> {
		// In real implementation, parse YAML/JSON file and return value
		// For now, return mock data
		const mockEnv: Record<string, any> = {
			environment: 'production',
			region: 'us-east-1',
			instance_type: 't3.medium'
		};

		return mockEnv[key] || null;
	}
}

