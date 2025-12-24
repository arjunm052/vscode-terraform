/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolutionContext } from './resolutionEngine';

export class CircularDependencyDetector {
	private resolutionStack: string[] = [];

	hasCircular(expression: string, context: ResolutionContext): boolean {
		const key = `${context.currentUri}:${expression}`;
		return this.resolutionStack.includes(key);
	}

	push(expression: string, context: ResolutionContext): void {
		const key = `${context.currentUri}:${expression}`;
		this.resolutionStack.push(key);
	}

	pop(): void {
		this.resolutionStack.pop();
	}

	clear(): void {
		this.resolutionStack = [];
	}
}

