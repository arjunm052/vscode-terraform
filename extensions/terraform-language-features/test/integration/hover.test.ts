/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getDocUri, activate } from './helper';

describe('Hover Provider', () => {
	const docUri = getDocUri('terragrunt.hcl');

	it('should show hover for local reference', async () => {
		await activate(docUri);
		const position = new vscode.Position(5, 25); // Position of "local.instance_type"

		const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
			'vscode.executeHoverProvider',
			docUri,
			position
		);

		assert.ok(hovers && hovers.length > 0);
		const hover = hovers[0];
		const content = hover.contents[0] as vscode.MarkdownString;

		assert.ok(content.value.includes('instance_type') || content.value.includes('t3.medium'));
	});
});

