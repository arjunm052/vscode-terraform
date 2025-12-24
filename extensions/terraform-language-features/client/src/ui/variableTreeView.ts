/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { VariableInfo } from '../types';

export class VariableInspectorProvider implements vscode.TreeDataProvider<VariableItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<VariableItem | undefined | null | void> = new vscode.EventEmitter<VariableItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<VariableItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor(private client: LanguageClient) { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: VariableItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: VariableItem): Promise<VariableItem[]> {
		if (!element) {
			// Root level: Categories
			return [
				new VariableItem('Locals', vscode.TreeItemCollapsibleState.Expanded, 'category'),
				new VariableItem('Dependencies', vscode.TreeItemCollapsibleState.Expanded, 'category'),
				new VariableItem('Includes', vscode.TreeItemCollapsibleState.Expanded, 'category'),
				new VariableItem('Env Vars', vscode.TreeItemCollapsibleState.Collapsed, 'category')
			];
		}

		// Request variables from LSP server
		const uri = vscode.window.activeTextEditor?.document.uri.toString();
		const variables = await this.client.sendRequest<VariableInfo[]>('terraform/listVariables', {
			category: element.label,
			uri
		});

		return variables.map((v: any) => new VariableItem(
			v.name,
			vscode.TreeItemCollapsibleState.None,
			'variable',
			v.value,
			v.source
		));
	}
}

class VariableItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly type: 'category' | 'variable',
		public readonly value?: any,
		public readonly source?: string
	) {
		super(label, collapsibleState);

		if (type === 'variable') {
			this.description = JSON.stringify(value);
			this.tooltip = `Source: ${source}`;
			this.contextValue = 'variable';
		}
	}
}

