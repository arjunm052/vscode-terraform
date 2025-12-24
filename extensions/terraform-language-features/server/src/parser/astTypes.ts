/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range, Position } from 'vscode-languageserver';

export interface HCLNode {
	type: 'block' | 'attribute' | 'expression' | 'function_call' | 'variable_reference' | 'literal';
	range: Range;
	name?: string;
	value?: any;
	children?: HCLNode[];
	blockType?: string; // 'resource', 'data', 'module', 'variable', 'output', 'locals', 'dependency', 'include', etc.
	attributeName?: string;
}

export interface BlockNode extends HCLNode {
	type: 'block';
	blockType: string;
	name: string;
	children: HCLNode[];
}

export interface AttributeNode extends HCLNode {
	type: 'attribute';
	attributeName: string;
	value: HCLNode;
}

export interface VariableReferenceNode extends HCLNode {
	type: 'variable_reference';
	name: string;
	prefix: string; // 'var', 'local', 'module', 'data', 'dependency', 'include'
	path: string[]; // ['instance_type'] for local.instance_type
}

export interface FunctionCallNode extends HCLNode {
	type: 'function_call';
	functionName: string;
	arguments: HCLNode[];
}

export function createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
	return {
		start: Position.create(startLine, startChar),
		end: Position.create(endLine, endChar)
	};
}

