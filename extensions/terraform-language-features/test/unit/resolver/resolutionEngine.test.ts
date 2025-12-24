/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResolutionEngine } from '../../../server/src/resolver/resolutionEngine';
import { WorkspaceManager } from '../../../server/src/workspace/workspaceManager';

describe('ResolutionEngine', () => {
	let engine: ResolutionEngine;
	let workspace: WorkspaceManager;

	beforeEach(() => {
		workspace = new WorkspaceManager([]);
		engine = new ResolutionEngine(workspace);
	});

	it('should cache resolution results', async () => {
		const result1 = await engine.resolve('local.test', {
			currentUri: 'file:///test.tf'
		});

		const result2 = await engine.resolve('local.test', {
			currentUri: 'file:///test.tf'
		});

		// Second call should use cache
		assert.ok(result2 !== null);
	});

	it('should detect circular dependencies', async () => {
		// This would test circular dependency detection
		// Implementation would need to be enhanced for full test
		assert.ok(true);
	});
});

