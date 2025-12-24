/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceManager } from '../workspace/workspaceManager';
import { BaseResolver } from './resolvers/baseResolver';
import { LocalsResolver } from './resolvers/localsResolver';
import { IncludeResolver } from './resolvers/includeResolver';
import { EnvVarsResolver } from './resolvers/envVarsResolver';
import { FunctionResolver } from './resolvers/functionResolver';
import { InputsResolver } from './resolvers/inputsResolver';
import { ResolutionCache } from './resolutionCache';
import { CircularDependencyDetector } from './circularDependencyDetector';

export interface ResolutionResult {
	value: any;
	source: string;
	chain: ResolutionStep[];
	confidence: 'exact' | 'inferred' | 'unknown';
	resolvedPath?: string; // How the path was resolved (e.g., "find_in_parent_folders()")
}

export interface ResolutionStep {
	type: string;
	description: string;
	location?: {
		uri: string;
		line: number;
		character: number;
	};
}

export interface ResolutionContext {
	currentUri: string;
	resolutionStack?: string[];
}

export class ResolutionEngine {
	private resolvers: BaseResolver[];
	private cache: ResolutionCache;
	private circularDetector: CircularDependencyDetector;
	private workspace: WorkspaceManager;

	constructor(workspace: WorkspaceManager) {
		this.workspace = workspace;
		this.resolvers = [
			new LocalsResolver(workspace, this),
			new IncludeResolver(workspace, this),
			new InputsResolver(workspace, this),
			new EnvVarsResolver(workspace, this),
			new FunctionResolver(workspace, this)
		];
		this.cache = new ResolutionCache();
		this.circularDetector = new CircularDependencyDetector();
		console.log('[ResolutionEngine] Initialized with', this.resolvers.length, 'resolvers');
	}

	async resolve(
		expression: string,
		context: ResolutionContext
	): Promise<ResolutionResult> {
		// Skip dependency expressions early - they are not supported for resolution
		if (expression.startsWith('dependency.')) {
			return {
				value: null,
				source: 'unsupported',
				chain: [],
				confidence: 'unknown'
			};
		}

		console.log('[ResolutionEngine] Resolving expression:', expression);
		console.log('[ResolutionEngine] Context:', context);

		// Check cache
		const cached = this.cache.get(expression, context);
		if (cached) {
			console.log('[ResolutionEngine] Found in cache');
			return cached;
		}

		// Detect circular dependencies
		if (this.circularDetector.hasCircular(expression, context)) {
			console.log('[ResolutionEngine] Circular dependency detected');
			return {
				value: null,
				source: 'circular-dependency',
				chain: [{ type: 'error', description: 'Circular dependency detected' }],
				confidence: 'unknown'
			};
		}

		// Push to resolution stack
		this.circularDetector.push(expression, context);
		console.log('[ResolutionEngine] Trying', this.resolvers.length, 'resolvers...');

		try {
			// Try each resolver in order
			for (const resolver of this.resolvers) {
				const resolverName = resolver.constructor.name;
				console.log('[ResolutionEngine] Trying resolver:', resolverName);

				if (resolver.canResolve(expression)) {
					console.log('[ResolutionEngine] ✓', resolverName, 'can resolve, calling...');
					const result = await resolver.resolve(expression, context);
					console.log('[ResolutionEngine] Result from', resolverName, ':', JSON.stringify(result).substring(0, 150));

					if (result.confidence !== 'unknown') {
						console.log('[ResolutionEngine] ✅ Successfully resolved with confidence:', result.confidence);
						this.cache.set(expression, context, result);
						return result;
					} else {
						console.log('[ResolutionEngine] ⚠️ Resolver returned unknown confidence');
					}
				} else {
					console.log('[ResolutionEngine] ✗', resolverName, 'cannot resolve this expression');
				}
			}

			// Fallback
			console.log('[ResolutionEngine] ❌ No resolver could handle expression, returning unknown');
			return {
				value: null,
				source: 'unknown',
				chain: [{ type: 'error', description: 'Unable to resolve expression' }],
				confidence: 'unknown'
			};
		} finally {
			// Pop from resolution stack
			this.circularDetector.pop();
		}
	}

	async listVariables(category: string, uri?: string): Promise<any[]> {
		const variables: any[] = [];
		const index = this.workspace.getIndex();

		// Get all symbols of the requested category
		const symbolType = this.mapCategoryToSymbolType(category);
		if (!symbolType) {
			return variables;
		}

		// Find all symbols of this type
		for (const [key, symbols] of index['symbols'].entries()) {
			if (key.startsWith(`${symbolType}:`)) {
				for (const symbol of symbols) {
					if (!uri || symbol.uri === uri) {
						// Try to resolve the value
						const expression = this.buildExpression(symbolType, symbol.name);
						const result = await this.resolve(expression, { currentUri: symbol.uri });

						variables.push({
							name: symbol.name,
							value: result.value,
							source: result.source,
							confidence: result.confidence
						});
					}
				}
			}
		}

		return variables;
	}

	private mapCategoryToSymbolType(category: string): string | null {
		switch (category.toLowerCase()) {
			case 'locals':
				return 'local';
			case 'includes':
				return 'include';
			case 'env vars':
				return 'env';
			default:
				return null;
		}
	}

	private buildExpression(type: string, name: string): string {
		switch (type) {
			case 'local':
				return `local.${name}`;
			case 'include':
				return `include.${name}`;
			default:
				return name;
		}
	}

	getCache(): ResolutionCache {
		return this.cache;
	}
}

