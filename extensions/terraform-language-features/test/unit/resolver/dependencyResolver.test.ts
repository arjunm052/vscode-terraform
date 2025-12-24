/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DependencyResolver } from '../../../server/src/resolver/resolvers/dependencyResolver';
import { WorkspaceManager } from '../../../server/src/workspace/workspaceManager';
import { ResolutionEngine } from '../../../server/src/resolver/resolutionEngine';

describe('DependencyResolver', () => {
	let resolver: DependencyResolver;
	let workspace: WorkspaceManager;
	let engine: ResolutionEngine;

	beforeEach(() => {
		workspace = new WorkspaceManager([]);
		engine = new ResolutionEngine(workspace);
		resolver = new DependencyResolver(workspace, engine);
	});

	it('should resolve dependency output', async () => {
		const result = await resolver.resolve('dependency.vpc.outputs.vpc_id', {
			currentUri: 'file:///terragrunt.hcl'
		});

		assert.ok(result !== null);
	});

	it('should handle missing dependency block', async () => {
		const result = await resolver.resolve('dependency.missing.outputs.value', {
			currentUri: 'file:///terragrunt.hcl'
		});

		assert.strictEqual(result.confidence, 'unknown');
	});
});

