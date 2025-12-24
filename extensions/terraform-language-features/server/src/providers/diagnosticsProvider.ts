/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { HCLParser } from '../parser/hclParser';
import { WorkspaceManager } from '../workspace/workspaceManager';

export class DiagnosticsProvider {
	constructor(
		private parser: HCLParser,
		private workspace: WorkspaceManager
	) {}

	async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
		const diagnostics: Diagnostic[] = [];

		try {
			// Parse document
			const ast = await this.parser.parse(document);

			// Basic syntax validation
			// In a full implementation, this would check for:
			// - Unclosed blocks
			// - Invalid attribute names
			// - Type mismatches
			// - Undefined variable references

			// For now, return empty diagnostics
			// Real implementation would analyze AST and add diagnostics

		} catch (error) {
			// Parse error
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 }
				},
				message: `Parse error: ${error}`,
				source: 'terraform'
			});
		}

		return diagnostics;
	}
}

