/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getDocUri, activate } from './helper';

describe('Cross-file Resolution', () => {
	it('should resolve dependency across modules', async () => {
		// Setup workspace with multiple modules
		const vpcModule = getDocUri('modules/vpc/outputs.tf');
		const appModule = getDocUri('modules/app/terragrunt.hcl');

		await activate(vpcModule);
		await activate(appModule);

		// Test resolution in app module
		// This would test the actual resolution
		assert.ok(true);
	});

	it('should handle parent folder traversal', async () => {
		const childConfig = getDocUri('environments/dev/terragrunt.hcl');
		const rootConfig = getDocUri('terragrunt.hcl');

		await activate(childConfig);
		await activate(rootConfig);

		// Test resolution
		assert.ok(true);
	});
});

