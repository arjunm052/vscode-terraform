/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolutionResult, ResolutionContext } from './resolutionEngine';

interface CachedResult extends ResolutionResult {
	timestamp: number;
}

export class ResolutionCache {
	private cache = new Map<string, CachedResult>();
	private ttl = 60000; // 1 minute
	private maxSize = 1000;

	get(expression: string, context: ResolutionContext): ResolutionResult | null {
		const key = this.makeKey(expression, context);
		const entry = this.cache.get(key);

		if (entry && this.isValid(entry)) {
			return {
				value: entry.value,
				source: entry.source,
				chain: entry.chain,
				confidence: entry.confidence
			};
		}

		if (entry) {
			// Expired, remove it
			this.cache.delete(key);
		}

		return null;
	}

	set(expression: string, context: ResolutionContext, result: ResolutionResult): void {
		// Enforce max size with LRU eviction
		if (this.cache.size >= this.maxSize) {
			this.evictOldest();
		}

		const key = this.makeKey(expression, context);
		this.cache.set(key, {
			...result,
			timestamp: Date.now()
		});
	}

	invalidate(uri?: string): void {
		if (uri) {
			// Invalidate all entries related to this file
			const keysToDelete: string[] = [];
			for (const [key, entry] of this.cache.entries()) {
				if (key.includes(uri) || entry.source === uri) {
					keysToDelete.push(key);
				}
			}
			keysToDelete.forEach(key => this.cache.delete(key));
		} else {
			this.cache.clear();
		}
	}

	private makeKey(expression: string, context: ResolutionContext): string {
		return `${context.currentUri}:${expression}`;
	}

	private isValid(entry: CachedResult): boolean {
		return Date.now() - entry.timestamp < this.ttl;
	}

	private evictOldest(): void {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.timestamp < oldestTime) {
				oldestTime = entry.timestamp;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
		}
	}
}

