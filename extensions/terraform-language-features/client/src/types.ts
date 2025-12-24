/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ResolutionResult {
	value: any;
	source: string;
	chain: string[];
	confidence: 'known' | 'inferred' | 'unknown';
}

export interface VariableInfo {
	name: string;
	type: 'local' | 'dependency' | 'include' | 'env_var';
	value?: any;
	source?: string;
	resolved: boolean;
}

