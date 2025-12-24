/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

export const testWorkspacePath = path.resolve(__dirname, '../../test/fixtures');

export function getDocUri(p: string): vscode.Uri {
	return vscode.Uri.file(path.resolve(testWorkspacePath, p));
}

export async function activate(docUri: vscode.Uri): Promise<void> {
	await vscode.workspace.openTextDocument(docUri);
	await vscode.window.showTextDocument(docUri);
	await sleep(2000); // Wait for server activation
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

