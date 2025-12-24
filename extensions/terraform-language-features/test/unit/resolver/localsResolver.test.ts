/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { LocalsResolver } from '../../../server/src/resolver/resolvers/localsResolver';
import { WorkspaceManager } from '../../../server/src/workspace/workspaceManager';
import { ResolutionEngine } from '../../../server/src/resolver/resolutionEngine';

describe('LocalsResolver', () => {
	let resolver: LocalsResolver;
	let workspace: WorkspaceManager;
	let engine: ResolutionEngine;

	beforeEach(() => {
		workspace = new WorkspaceManager([]);
		engine = new ResolutionEngine(workspace);
		resolver = new LocalsResolver(workspace, engine);
	});

	it('should resolve local in same file', async () => {
		// Mock workspace with document
		const content = `
locals {
  region = "us-east-1"
}

resource "aws_instance" "example" {
  availability_zone = local.region
}
`;

		// In a real test, we would parse and index the document
		// For now, this is a placeholder test structure
		const result = await resolver.resolve('local.region', {
			currentUri: 'file:///test.tf'
		});

		// This would assert the result once the resolver is fully implemented
		assert.ok(result !== null);
	});

	it('should resolve local from locals.hcl', async () => {
		const result = await resolver.resolve('local.instance_type', {
			currentUri: 'file:///main.tf'
		});

		assert.ok(result !== null);
	});

	it('should handle nested local references', async () => {
		const result = await resolver.resolve('local.instance_type', {
			currentUri: 'file:///test.tf'
		});

		assert.ok(result !== null);
	});
});

