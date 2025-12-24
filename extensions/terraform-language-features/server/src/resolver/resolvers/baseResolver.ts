/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceManager } from '../../workspace/workspaceManager';
import { ResolutionEngine, ResolutionResult, ResolutionContext } from '../resolutionEngine';

export abstract class BaseResolver {
	protected workspace: WorkspaceManager;
	protected engine: ResolutionEngine;

	constructor(workspace: WorkspaceManager, engine: ResolutionEngine) {
		this.workspace = workspace;
		this.engine = engine;
	}

	abstract canResolve(expression: string): boolean;
	abstract resolve(expression: string, context: ResolutionContext): Promise<ResolutionResult>;

	protected unknownResult(): ResolutionResult {
		return {
			value: null,
			source: 'unknown',
			chain: [],
			confidence: 'unknown'
		};
	}
}

